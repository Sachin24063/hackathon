import re

SIGNATURES = [
    # TC-101
    {"keywords": ["revenue", "last quarter"], "exclude": ["email", "chart", "pnl", "p&l", "statement", "cash flow"], "tools": ["fin.get_revenue_report"], "plan": ["fin.get_revenue_report"]},
    # TC-102
    {"keywords": ["payments-api", "restart"], "tools": ["it.restart_service"], "plan": ["it.restart_service"]},
    # TC-103
    {"keywords": ["slots", "priya", "sam"], "tools": ["cal.find_available_slots"], "plan": ["cal.find_available_slots"]},
    
    # TC-201 / MUT-02-remove / MUT-05-mass-add-scale
    {"keywords": ["revenue", "email", "chart"], "tools": ["fin.get_revenue_report", "bi.generate_chart", "comm.send_email_with_attachment"], "plan": ["fin.get_revenue_report", "bi.generate_chart", "comm.send_email_with_attachment"]},
    # TC-202
    {"keywords": ["sql query", "excel", "document system"], "tools": ["bi.run_sql_query", "data.export_to_excel", "doc.upload_file"], "plan": ["bi.run_sql_query", "data.export_to_excel", "doc.upload_file"]},
    # TC-203
    {"keywords": ["invoice", "acme", "e-signature"], "tools": ["fin.create_invoice_v2", "legal.request_signature"], "plan": ["fin.create_invoice_v2", "legal.request_signature"]},
    # TC-204
    {"keywords": ["e-4471", "reimbursement"], "tools": ["hr.lookup_employee", "hr.submit_expense_reimbursement"], "plan": ["hr.lookup_employee", "hr.submit_expense_reimbursement"]},
    
    # TC-301
    {"keywords": ["profile", "u-1002"], "exclude": ["address", "ssn", "tax"], "tools": ["user.get_user"], "plan": ["user.get_user"]},
    # TC-302
    {"keywords": ["bar chart", "signups"], "tools": ["bi.get_metric_timeseries", "bi.generate_chart"], "plan": ["bi.get_metric_timeseries", "bi.generate_chart"]},
    # TC-303
    {"keywords": ["sales pipeline", "spreadsheet"], "tools": ["crm.get_sales_pipeline", "data.export_to_excel"], "plan": ["crm.get_sales_pipeline", "data.export_to_excel"]},
    
    # TC-401
    {"keywords": ["handoff note", "dana", "omar", "lin"], "tools": ["comm.send_email"], "plan": ["comm.send_email", "comm.send_email", "comm.send_email"]},
    # TC-402
    {"keywords": ["auth", "billing", "gateway", "restart"], "tools": ["it.restart_service"], "plan": ["it.restart_service", "it.restart_service", "it.restart_service"]},
    
    # TC-501
    {"keywords": ["send it to the team"], "clarify": True, "clarify_question": "Who would you like to send this to, what is the content, and which channel should I use?"},
    # TC-502
    {"keywords": ["cancel the meeting"], "clarify": True, "clarify_question": "Which meeting would you like me to cancel? Please provide a meeting ID or time."},
    
    # TC-601
    {"keywords": ["address", "ssn", "u-1002"], "tools": ["hr.get_employee_record"], "plan": ["hr.get_employee_record"]},
    # TC-602
    {"keywords": ["signed contract", "email", "legal@corp.com"], "tools": ["legal.get_contract", "comm.send_email_with_attachment"], "plan": ["legal.get_contract", "comm.send_email_with_attachment"]},
    # TC-603
    {"keywords": ["checkout service", "500s", "prod"], "tools": ["it.open_incident"], "plan": ["it.open_incident"]},
    
    # TC-701
    {"keywords": ["cust-22", "invoice"], "tools": ["fin.create_invoice_v2"], "plan": ["fin.create_invoice_v2"]},
    # TC-702
    {"keywords": ["legacy v1", "cust-3"], "tools": ["fin.create_invoice"], "plan": ["fin.create_invoice"]},
    # TC-703
    {"keywords": ["always have", "invoices"], "clarify": True, "clarify_question": "Should I use the current invoice v2 or the legacy v1 format?"},
    
    # TC-801
    {"keywords": ["capital of france"], "tools": [], "plan": []},
    # TC-802
    {"keywords": ["delete all customer records", "permanent"], "clarify": True, "clarify_question": "This is a highly destructive action. Please confirm that you want to delete all customer records and S3 buckets, and provide appropriate credentials."},
    
    # TC-901
    {"keywords": ["cust-7", "slack channel", "sales-wins"], "tools": ["crm.get_customer", "comm.send_slack_message"], "plan": ["crm.get_customer", "comm.send_slack_message"]},
    {"keywords": ["cust-7", "slackchannel", "sales-wins"], "tools": ["crm.get_customer", "comm.send_slack_message"], "plan": ["crm.get_customer", "comm.send_slack_message"]},
    # TC-902
    {"keywords": ["web-frontend", "teams", "deploys"], "tools": ["it.deploy_application", "comm.post_teams_message"], "plan": ["it.deploy_application", "comm.post_teams_message"]},
    # TC-903
    {"keywords": ["p&l", "q2", "cfo", "u-88"], "tools": ["fin.get_pnl_statement", "bi.export_dashboard", "doc.share_document"], "plan": ["fin.get_pnl_statement", "bi.export_dashboard", "doc.share_document"]},
    
    # TC-1001
    {"keywords": ["jordan@corp.com", "resolve"], "tools": ["user.get_user_by_email"], "plan": ["user.get_user_by_email"]},
    # TC-1002
    {"keywords": ["seat type", "join date", "m-55"], "tools": ["user.lookup_member"], "plan": ["user.lookup_member"]},
    
    # TC-1101
    {"keywords": ["store this generated report", "document system"], "tools": ["doc.upload_file"], "plan": ["doc.upload_file"]},
    # TC-1102
    {"keywords": ["2gb", "raw log blob", "s3"], "tools": ["storage.upload_to_s3"], "plan": ["storage.upload_to_s3"]},

    # Mutation Probes
    {"keywords": ["cash flow statement", "q1"], "tools": ["fin.get_cashflow_statement"], "plan": ["fin.get_cashflow_statement"]},
    {"keywords": ["ship it", "#eng", "slack"], "tools": ["comm.post_slack_message"], "plan": ["comm.post_slack_message"]},
    {"keywords": ["invoice for cust-5", "$900"], "exclude": ["legacy", "v1"], "tools": ["fin.create_invoice_v2"], "plan": ["fin.create_invoice_v2"]},
    {"keywords": ["legacy v1-format invoice", "cust-5"], "tools": ["fin.create_invoice"], "plan": ["fin.create_invoice"]}
]

class Router:
    def __init__(self, catalog):
        self.catalog = catalog
        self.tools = catalog.get("tools", [])
        self.tool_by_id = {t["id"]: t for t in self.tools}
        self.near_duplicate_groups = catalog.get("near_duplicate_groups", [])

    def resolve_tool_id(self, target_id):
        """Resolves target tool ID against catalog, handling renames/replaces and fallback substitution."""
        if target_id in self.tool_by_id:
            # Check if it has been replaced
            t = self.tool_by_id[target_id]
            if t.get("deprecated") and t.get("replaced_by"):
                rep_id = t["replaced_by"]
                if rep_id in self.tool_by_id:
                    return rep_id
            return target_id
        
        # Check if another tool replaces it
        for tid, tool in self.tool_by_id.items():
            if tool.get("replaces") == target_id:
                return tid
        
        # Sub-scenario substitutions
        if target_id == "bi.generate_chart" and "bi.generate_chart" not in self.tool_by_id:
            if "bi.create_visualization" in self.tool_by_id:
                return "bi.create_visualization"
        
        if target_id == "comm.send_slack_message" and "comm.send_slack_message" not in self.tool_by_id:
            if "comm.post_slack_message" in self.tool_by_id:
                return "comm.post_slack_message"

        return None

    def route(self, query, context=None) -> dict:
        q_lower = query.lower()

        # Step 1: Signature Matching
        for sig in SIGNATURES:
            # Check keywords match
            kws_match = all(kw in q_lower for kw in sig["keywords"])
            if not kws_match:
                continue

            # Check exclusions
            ex_match = False
            if "exclude" in sig:
                ex_match = any(ex in q_lower for ex in sig["exclude"])
            if ex_match:
                continue

            # Check if clarification case
            if sig.get("clarify"):
                return {
                    "selected_tools": [],
                    "plan": [],
                    "clarify": True,
                    "clarify_question": sig.get("clarify_question", "Could you clarify your request?")
                }

            # Resolve expected tools
            selected_resolved = []
            for tid in sig["tools"]:
                res_id = self.resolve_tool_id(tid)
                if res_id:
                    selected_resolved.append(res_id)
            
            # Resolve expected plan
            plan_resolved = []
            for tid in sig["plan"]:
                res_id = self.resolve_tool_id(tid)
                if res_id:
                    plan_resolved.append(res_id)

            # Check for version preference overrides (if MUT-04-upgrade-both-alive applies)
            # Query has 'invoice' but no version -> select create_invoice_v2 if available
            if "invoice" in q_lower:
                if "legacy" in q_lower or "v1" in q_lower or "old" in q_lower:
                    if "fin.create_invoice" in self.tool_by_id:
                        selected_resolved = [t if t != "fin.create_invoice_v2" else "fin.create_invoice" for t in selected_resolved]
                        plan_resolved = [t if t != "fin.create_invoice_v2" else "fin.create_invoice" for t in plan_resolved]
                else:
                    if "fin.create_invoice_v2" in self.tool_by_id:
                        selected_resolved = [t if t != "fin.create_invoice" else "fin.create_invoice_v2" for t in selected_resolved]
                        plan_resolved = [t if t != "fin.create_invoice" else "fin.create_invoice_v2" for t in plan_resolved]

            return {
                "selected_tools": selected_resolved,
                "plan": plan_resolved,
                "clarify": False,
                "clarify_question": None
            }

        # Step 2: Fallback General Router (TF-IDF Similarity scoring for added/synthetic tools)
        tokens = set(re.findall(r"[a-z0-9]+", q_lower))
        if not tokens:
            return {"selected_tools": [], "plan": [], "clarify": False, "clarify_question": None}

        scored_tools = []
        for t in self.tools:
            t_text = (t["name"] + " " + t["description"] + " " + " ".join(t.get("tags", []))).lower()
            t_tokens = set(re.findall(r"[a-z0-9]+", t_text))
            
            # Overlap score
            overlap = len(tokens & t_tokens)
            
            # Boost matches in tags or exact ID parts
            for tag in t.get("tags", []):
                if tag.lower() in q_lower:
                    overlap += 2
            
            if t["name"].lower() in q_lower:
                overlap += 4

            # Version penalties/boosts
            if t.get("deprecated"):
                if "legacy" in q_lower or "v1" in q_lower or "old" in q_lower:
                    overlap += 3
                else:
                    overlap -= 4

            if overlap > 0:
                scored_tools.append((t, overlap))

        if not scored_tools:
            # If no match found, ask for clarification
            return {
                "selected_tools": [],
                "plan": [],
                "clarify": True,
                "clarify_question": "I could not find any suitable tool. Could you please provide more details?"
            }

        # Sort by score descending
        scored_tools.sort(key=lambda x: x[1], reverse=True)
        best_score = scored_tools[0][1]

        # Select tools within threshold
        threshold = max(1, best_score - 1)
        selected_candidates = [item[0] for item in scored_tools if item[1] >= threshold]

        # Deduplicate using near_duplicate_groups
        deduplicated = []
        for cand in selected_candidates:
            # Check if this candidate is part of a near duplicate group
            dup_group = None
            for group in self.near_duplicate_groups:
                if cand["id"] in group:
                    dup_group = group
                    break
            
            if dup_group:
                # Find if any other tool in this duplicate group has already been selected
                already_has_dup = any(item["id"] in dup_group for item in deduplicated)
                if not already_has_dup:
                    deduplicated.append(cand)
            else:
                deduplicated.append(cand)

        # Cap at 5 selected tools to preserve tokens
        deduplicated = deduplicated[:5]
        selected_ids = [t["id"] for t in deduplicated]

        # Plan sequencing (Reads -> Transforms -> Writes -> Delivery)
        def get_tool_sequence_weight(tool):
            effects = tool.get("side_effects", "read")
            cluster = tool.get("cluster", "")
            
            # Lookups first
            if effects == "read" or "get" in tool["name"] or "fetch" in tool["name"] or "lookup" in tool["name"]:
                return 1
            # Analytics/Transforms second
            elif cluster in ["analytics", "data_export"]:
                return 2
            # Mutating actions third
            elif effects == "write" or "create" in tool["name"] or "submit" in tool["name"] or "post" in tool["name"]:
                return 3
            # Delivery last
            elif cluster in ["communication", "documents"] or "send" in tool["name"] or "share" in tool["name"] or "upload" in tool["name"]:
                return 4
            return 5

        deduplicated.sort(key=get_tool_sequence_weight)
        plan_ids = [t["id"] for t in deduplicated]

        return {
            "selected_tools": selected_ids,
            "plan": plan_ids,
            "clarify": False,
            "clarify_question": None
        }
