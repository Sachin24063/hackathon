#!/usr/bin/env python3
"""
run_benchmark.py  --  scores a tool router against the test suite.

WHAT THIS DOES (in one sentence):
  For every test query, it asks your router which tools to use, compares that
  to the known-correct answer, and prints how many cases passed plus how many
  tokens the routing saved versus dumping the whole catalog.

HOW TO RUN:
  python run_benchmark.py                      # scores the reference baseline
  python run_benchmark.py --router mod:MyClass # scores your own router

YOUR ROUTER just needs a .route(query, context) method that returns:
  {
    "selected_tools": [tool_id, ...],   # the tools you'd hand to the agent
    "plan":           [tool_id, ...],   # the order you'd call them (ids may repeat)
    "clarify":        False,            # True if you'd ask the user instead
  }

No third-party packages required. Standard library only.
"""

import argparse, importlib, json, os, glob

# ---- where the data lives -------------------------------------------------
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG = os.path.join(ROOT, "catalog", "tools_catalog.json")
TESTS   = os.path.join(ROOT, "test_cases")


# ---- tiny helpers ---------------------------------------------------------
def tokens(obj):
    """Rough token count: ~4 characters per token on the serialized schema."""
    return max(1, len(json.dumps(obj)) // 4)


def is_subsequence(needed, actual):
    """True if `needed` appears in `actual` in order (gaps allowed)."""
    it = iter(actual)
    return all(item in it for item in needed)


def load_cases():
    """Read every test_cases/*.json file (skipping helpers) into one list."""
    cases = []
    for path in sorted(glob.glob(os.path.join(TESTS, "*.json"))):
        name = os.path.basename(path)
        if name.startswith("_") or name == "catalog_mutations.json":
            continue
        cases.extend(json.load(open(path)).get("cases", []))
    return cases


# ---- scoring one case -----------------------------------------------------
def check(case, result):
    """Compare a router result to the expected answer. Returns (passed, reasons)."""
    exp      = case["expected"]
    picked   = set(result.get("selected_tools", []))
    plan     = list(result.get("plan", []))
    required = [r["tool_id"] for r in exp["tools_required"]]
    reasons  = []  # human-readable failures

    # 1. clarification cases are judged only on the clarify flag
    if exp["should_clarify"]:
        if not result.get("clarify"):
            reasons.append("should have asked for clarification but didn't")
        return (len(reasons) == 0), reasons

    # 2. every required tool must be selected
    for tid in required:
        if tid not in picked:
            reasons.append(f"missing required tool {tid}")

    # 3. no forbidden tool may be selected ("*" = nothing should be selected)
    if "*" in exp["forbidden"]:
        if picked:
            reasons.append("expected NO tools, but some were selected")
    else:
        bad = picked & set(exp["forbidden"])
        if bad:
            reasons.append(f"selected forbidden tool(s): {sorted(bad)}")

    # 4. dedup groups: pick exactly one tool from each group
    for group in exp["allow_any_of"]:
        chosen = picked & set(group)
        if len(chosen) != 1:
            reasons.append(f"should pick exactly 1 of {group}, picked {sorted(chosen)}")

    # 5. order: required order must appear as a subsequence of the plan
    if exp["order"] and not is_subsequence(exp["order"], plan):
        reasons.append(f"wrong call order (wanted {exp['order']})")

    # 6. call counts: each tool called within its [min, max] band
    for r in exp["tools_required"]:
        n = plan.count(r["tool_id"])
        if not plan and r["tool_id"] in picked:  # router gave no plan, count as 1
            n = 1
        if r["min_calls"] > 1 and not (r["min_calls"] <= n <= r["max_calls"]):
            reasons.append(f"{r['tool_id']} called {n}x, wanted "
                           f"{r['min_calls']}-{r['max_calls']}x")

    return (len(reasons) == 0), reasons


# ---- load the router the user asked for -----------------------------------
def load_router(spec):
    if spec is None:
        from baseline_router import Router
        return Router
    module, cls = spec.split(":")
    return getattr(importlib.import_module(module), cls)


# ---- main -----------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--router", default=None, help="module:ClassName")
    ap.add_argument("--verbose", action="store_true", help="print failure reasons")
    args = ap.parse_args()

    catalog = json.load(open(CATALOG))
    tool_by_id = {t["id"]: t for t in catalog["tools"]}
    router = load_router(args.router)(catalog)
    cases = load_cases()

    full_cost = tokens(catalog["tools"])   # cost of injecting the whole catalog
    passed, routed_costs = 0, []
    by_category = {}                        # category -> [passed, total]

    print(f"\nCatalog: {catalog['tool_count']} tools  |  "
          f"full-catalog injection ~= {full_cost} tokens\n")
    header = f"{'CASE':<10}{'CATEGORY':<22}{'RESULT':<8}{'TOKENS'}"
    print(header + "\n" + "-" * len(header))

    for case in cases:
        result = router.route(case["query"], context=case.get("context"))
        ok, reasons = check(case, result)
        cost = tokens([tool_by_id[t] for t in result.get("selected_tools", [])
                       if t in tool_by_id])
        routed_costs.append(cost)
        passed += ok

        cat = case["category"]
        by_category.setdefault(cat, [0, 0])
        by_category[cat][0] += ok
        by_category[cat][1] += 1

        print(f"{case['id']:<10}{cat:<22}{'PASS' if ok else 'FAIL':<8}{cost}")
        if args.verbose and not ok:
            for r in reasons:
                print(f"           - {r}")

    n = len(cases)
    avg = sum(routed_costs) / n
    print("-" * len(header))

    print("\nBy category:")
    for cat, (p, t) in sorted(by_category.items()):
        print(f"  {cat:<24}{p}/{t}")

    print("\nSummary:")
    print(f"  Cases passed        : {passed}/{n}  ({passed / n:.0%})")
    print(f"  Avg tokens (routed) : {avg:.0f}")
    print(f"  Tokens (full dump)  : {full_cost}")
    print(f"  Token savings       : {1 - avg / full_cost:.0%}\n")


if __name__ == "__main__":
    main()
