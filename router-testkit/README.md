# AI Tool-Routing Hackathon — Input Test Kit

A ready-to-run input set for building and grading an **intelligent tool-routing
layer** that filters a large enterprise tool catalog down to a small,
high-precision subset per query.

Everything here is *input* for participants: a mock catalog, a scored test
suite, registry-guardrail fixtures, catalog-churn scenarios, and a benchmark
harness with a reference baseline router to beat.

```
router-testkit/
├── catalog/
│   └── tools_catalog.json          64 mock tools · 13 clusters · dup/version metadata
├── registry_guardrail/
│   └── submissions.json            valid + malformed intake fixtures (accept/reject)
├── test_cases/
│   ├── 01_single_tool.json         ── 29 scored query packets across 11 categories
│   ├── 02_multi_tool_ordered.json
│   ├── 03_deduplication.json
│   ├── 04_repeat_count.json
│   ├── 05_clarification.json
│   ├── 06_fallback_widening.json
│   ├── 07_backward_compat.json
│   ├── 08_negative_out_of_scope.json
│   ├── 09_cross_cluster.json
│   ├── 10_positional_bias.json
│   ├── 11_scope_overlap.json
│   ├── catalog_mutations.json      add / remove / replace / upgrade resilience
│   └── _index.json
└── harness/
    ├── run_benchmark.py            scorer (prints metrics; no dependencies)
    └── baseline_router.py          naive reference router (REPLACE THIS)
```

## Quick start

Standard-library Python only — nothing to install.

```bash
cd harness
python run_benchmark.py                          # runs the baseline (~24% accuracy)
python run_benchmark.py --router mymod:MyRouter  # run your own
python run_benchmark.py --verbose                # also print why each case failed
```

Your router is any class with:

```python
class MyRouter:
    def __init__(self, catalog): ...
    def route(self, query, context=None) -> dict:
        return {
          "selected_tools": ["fin.get_revenue_report", ...],  # the K schemas you'd inject
          "plan":           ["fin.get_revenue_report", ...],  # ordered call plan (ids may repeat)
          "clarify":        False,                             # True => you asked instead of acting
          "clarify_question": None,
        }
```

## The catalog (`catalog/tools_catalog.json`)

64 tools over 13 clusters (finance, communication, analytics, hr, identity,
it_devops, crm, calendar, documents, cloud_storage, marketing, legal,
data_export). It carries the metadata your router is expected to exploit:

- `near_duplicate_groups` — deliberately overlapping tools. E.g. the classic
  `get_user` / `fetch_profile` / `lookup_member` / `get_user_by_email` quartet,
  two revenue fetchers, two chart makers, `create_ticket` vs `open_incident`.
- `version_families` — `create_invoice` (deprecated v1) coexists with
  `create_invoice_v2` (current). Each tool has `deprecated`, `replaces`,
  `replaced_by`, `sunset_date`.
- `cross_cluster_traps` — tools whose **name** points at the wrong cluster:
  `email_report` lives in data_export (not communication); `send_campaign` is
  a marketing blast, not a 1:1 email.
- Per-tool `side_effects` (`read` / `write` / `destructive`) so you can be
  conservative about routing destructive actions on vague queries.

## The scored suite (`test_cases/*.json`)

Each case has a machine-checkable `expected` block:

| field | meaning |
|---|---|
| `tools_required` | `{tool_id, min_calls, max_calls}` — must be selected and called within the count band |
| `order` | ordered list that must appear as a **subsequence** of your `plan` (or `null`) |
| `forbidden` | tool ids that must NOT be selected. `"*"` means *no tool at all* |
| `should_clarify` | router should ask, not act |
| `allow_any_of` | dedup groups: pick **exactly one** id per group |

Categories map 1:1 to the problem's pillars:

- **single_tool / cross_cluster** — basic and multi-cluster routing accuracy.
- **multi_tool_ordered** — the canonical *"pull revenue → make chart → email to
  finance"* chain, with ordering enforced.
- **deduplication** — the near-dup groups; injecting all three user lookups
  fails, injecting one passes.
- **repeat_count** — same tool invoked N times (e.g. restart 3 services →
  `restart_service` ×3).
- **clarification / negative_out_of_scope** — must *not* fabricate a tool call.
- **fallback_widening** — the initially-obvious tool lacks a needed field/scope
  (e.g. `send_email` can't attach; identity lookup has no SSN); the case encodes
  the correct widen target.
- **backward_compat** — unversioned request → current tool; explicit "legacy v1"
  → deprecated tool; genuinely ambiguous → clarify.
- **positional_bias / scope_overlap** — set `context.shuffle_catalog=true` and
  present near-dups in random order; correct pick must be signal-driven, not
  position-driven (DMS vs raw S3, etc.).

## Registry guardrail (`registry_guardrail/submissions.json`)

Feed each `invalid_submissions` entry to your intake validator; it must reject
with the given `expected_reason` (vague/too-long description, bad id/name,
missing field, duplicate id, bad param type, too many params, bad semver,
dangling `replaced_by`, malformed JSON). The two `valid_submissions` must pass.

## Catalog churn (`test_cases/catalog_mutations.json`)

Directly answers the "what if tools change?" evaluation questions. Apply each
`delta` to the catalog, re-run the probe, and assert the invariant:

- **add** — new tool routable immediately, no regressions elsewhere.
- **remove** — depended-on tool gone → graceful degradation, no crash.
- **replace** — renamed tool routes by capability, not hardcoded id.
- **upgrade (both alive)** — `PREFER_CURRENT` unless an explicit version signal;
  never inject both versions at once.
- **scale stress** — auto-grow to ~104 tools; accuracy and token savings must hold.

## Scoring & metrics

`run_benchmark.py` checks each case and prints, in plain text: a PASS/FAIL line
per case (with token cost), a per-category tally, and a summary with overall
accuracy and token savings (average routed tokens vs. the full-catalog dump).
Run with `--verbose` to see the reason each failed case failed. No charts, no
dependencies — just numbers you can read or pipe.

Baseline reference: ~24% case accuracy, ~94% token savings. Beat both.
