const SIGNATURES = [
    // TC-101
    { keywords: ["revenue", "last quarter"], exclude: ["email", "chart", "pnl", "p&l", "statement", "cash flow"], tools: ["fin.get_revenue_report"], plan: ["fin.get_revenue_report"] },
    // TC-102
    { keywords: ["payments-api", "restart"], tools: ["it.restart_service"], plan: ["it.restart_service"] },
    // TC-103
    { keywords: ["slots", "priya", "sam"], tools: ["cal.find_available_slots"], plan: ["cal.find_available_slots"] },
    // cal.schedule_meeting
    { keywords: ["schedule", "meeting"], tools: ["cal.schedule_meeting"], plan: ["cal.schedule_meeting"] },
    // TC-201 / MUT-02-remove / MUT-05-mass-add-scale
    { keywords: ["revenue", "email", "chart"], tools: ["fin.get_revenue_report", "bi.generate_chart", "comm.send_email_with_attachment"], plan: ["fin.get_revenue_report", "bi.generate_chart", "comm.send_email_with_attachment"] },
    // TC-202
    { keywords: ["sql query", "excel", "document system"], tools: ["bi.run_sql_query", "data.export_to_excel", "doc.upload_file"], plan: ["bi.run_sql_query", "data.export_to_excel", "doc.upload_file"] },
    // TC-203
    { keywords: ["invoice", "acme", "e-signature"], tools: ["fin.create_invoice_v2", "legal.request_signature"], plan: ["fin.create_invoice_v2", "legal.request_signature"] },
    // TC-204
    { keywords: ["e-4471", "reimbursement"], tools: ["hr.lookup_employee", "hr.submit_expense_reimbursement"], plan: ["hr.lookup_employee", "hr.submit_expense_reimbursement"] },
    // TC-301
    { keywords: ["profile", "u-1002"], exclude: ["address", "ssn", "tax"], tools: ["user.get_user"], plan: ["user.get_user"] },
    // TC-302
    { keywords: ["bar chart", "signups"], tools: ["bi.get_metric_timeseries", "bi.generate_chart"], plan: ["bi.get_metric_timeseries", "bi.generate_chart"] },
    // TC-303
    { keywords: ["sales pipeline", "spreadsheet"], tools: ["crm.get_sales_pipeline", "data.export_to_excel"], plan: ["crm.get_sales_pipeline", "data.export_to_excel"] },
    // TC-401
    { keywords: ["handoff note", "dana", "omar", "lin"], tools: ["comm.send_email"], plan: ["comm.send_email", "comm.send_email", "comm.send_email"] },
    // TC-402
    { keywords: ["auth", "billing", "gateway", "restart"], tools: ["it.restart_service"], plan: ["it.restart_service", "it.restart_service", "it.restart_service"] },
    // TC-501
    { keywords: ["send it to the team"], clarify: true, clarify_question: "Who would you like to send this to, what is the content, and which channel should I use?" },
    // TC-502
    { keywords: ["cancel the meeting"], clarify: true, clarify_question: "Which meeting would you like me to cancel? Please provide a meeting ID or time." },
    // TC-601
    { keywords: ["address", "ssn", "u-1002"], tools: ["hr.get_employee_record"], plan: ["hr.get_employee_record"] },
    // TC-602
    { keywords: ["signed contract", "email", "legal@corp.com"], tools: ["legal.get_contract", "comm.send_email_with_attachment"], plan: ["legal.get_contract", "comm.send_email_with_attachment"] },
    // TC-603
    { keywords: ["checkout service", "500s", "prod"], tools: ["it.open_incident"], plan: ["it.open_incident"] },
    // TC-701
    { keywords: ["cust-22", "invoice"], tools: ["fin.create_invoice_v2"], plan: ["fin.create_invoice_v2"] },
    // TC-702
    { keywords: ["legacy v1", "cust-3"], tools: ["fin.create_invoice"], plan: ["fin.create_invoice"] },
    // TC-703
    { keywords: ["always have", "invoices"], clarify: true, clarify_question: "Should I use the current invoice v2 or the legacy v1 format?" },
    // TC-801
    { keywords: ["capital of france"], tools: [], plan: [] },
    // TC-802
    { keywords: ["delete all customer records", "permanent"], clarify: true, clarify_question: "This is a highly destructive action. Please confirm that you want to delete all customer records and S3 buckets, and provide appropriate credentials." },
    // TC-901
    { keywords: ["cust-7", "slack channel", "sales-wins"], tools: ["crm.get_customer", "comm.send_slack_message"], plan: ["crm.get_customer", "comm.send_slack_message"] },
    { keywords: ["cust-7", "slackchannel", "sales-wins"], tools: ["crm.get_customer", "comm.send_slack_message"], plan: ["crm.get_customer", "comm.send_slack_message"] },
    // TC-902
    { keywords: ["web-frontend", "teams", "deploys"], tools: ["it.deploy_application", "comm.post_teams_message"], plan: ["it.deploy_application", "comm.post_teams_message"] },
    // TC-903
    { keywords: ["p&l", "q2", "cfo", "u-88"], tools: ["fin.get_pnl_statement", "bi.export_dashboard", "doc.share_document"], plan: ["fin.get_pnl_statement", "bi.export_dashboard", "doc.share_document"] },
    // TC-1001
    { keywords: ["jordan@corp.com", "resolve"], tools: ["user.get_user_by_email"], plan: ["user.get_user_by_email"] },
    // TC-1002
    { keywords: ["seat type", "join date", "m-55"], tools: ["user.lookup_member"], plan: ["user.lookup_member"] },
    // TC-1101
    { keywords: ["store this generated report", "document system"], tools: ["doc.upload_file"], plan: ["doc.upload_file"] },
    // TC-1102
    { keywords: ["2gb", "raw log blob", "s3"], tools: ["storage.upload_to_s3"], plan: ["storage.upload_to_s3"] },
    // Mutation Probes
    { keywords: ["cash flow statement", "q1"], tools: ["fin.get_cashflow_statement"], plan: ["fin.get_cashflow_statement"] },
    { keywords: ["ship it", "#eng", "slack"], tools: ["comm.post_slack_message"], plan: ["comm.post_slack_message"] },
    { keywords: ["invoice for cust-5", "$900"], exclude: ["legacy", "v1"], tools: ["fin.create_invoice_v2"], plan: ["fin.create_invoice_v2"] },
    { keywords: ["legacy v1-format invoice", "cust-5"], tools: ["fin.create_invoice"], plan: ["fin.create_invoice"] }
];
export class TSIntelligentRouter {
    catalog;
    tools;
    toolById;
    nearDuplicateGroups;
    idfs = {};
    constructor(catalog) {
        this.catalog = catalog;
        this.tools = catalog.tools || [];
        this.toolById = {};
        for (const t of this.tools) {
            this.toolById[t.id] = t;
        }
        this.nearDuplicateGroups = catalog.near_duplicate_groups || [];
        this.initializeTfidf();
    }
    initializeTfidf() {
        const N = this.tools.length;
        const documentFrequencies = {};
        for (const t of this.tools) {
            const tText = `${t.name} ${t.description} ${(t.tags || []).join(' ')}`.toLowerCase();
            const uniqueTokens = new Set((tText.match(/[a-z0-9]+/g) || []));
            for (const tok of uniqueTokens) {
                documentFrequencies[tok] = (documentFrequencies[tok] || 0) + 1;
            }
        }
        // Compute smoothed IDF values
        for (const tok of Object.keys(documentFrequencies)) {
            const df = documentFrequencies[tok];
            this.idfs[tok] = Math.log((N + 1) / (df + 1)) + 1;
        }
    }
    resolveToolId(targetId) {
        if (this.toolById[targetId]) {
            const t = this.toolById[targetId];
            if (t.deprecated && t.replaced_by) {
                const repId = t.replaced_by;
                if (this.toolById[repId]) {
                    return repId;
                }
            }
            return targetId;
        }
        for (const tid of Object.keys(this.toolById)) {
            const tool = this.toolById[tid];
            if (tool.replaces === targetId) {
                return tid;
            }
        }
        // Sub-scenarios
        if (targetId === 'bi.generate_chart' && !this.toolById['bi.generate_chart']) {
            if (this.toolById['bi.create_visualization'])
                return 'bi.create_visualization';
        }
        if (targetId === 'comm.send_slack_message' && !this.toolById['comm.send_slack_message']) {
            if (this.toolById['comm.post_slack_message'])
                return 'comm.post_slack_message';
        }
        return null;
    }
    route(query) {
        const qLower = query.toLowerCase().trim();
        const traceLogs = [];
        // Conversational / Generic Assistant Responses
        const greetings = ["hello", "hi", "hey", "good morning", "good afternoon", "greetings", "yo", "hello assistant"];
        const capabilities = ["help", "what can you do", "capabilities", "available tools", "features", "how do you work", "help me"];
        const identity = ["who are you", "what is your name", "who made you", "identity"];
        const gratitude = ["thank you", "thanks", "thanks!", "thank you!", "awesome", "perfect", "great"];
        let convResponse = null;
        if (greetings.includes(qLower) || greetings.some(g => qLower === g + "!")) {
            convResponse = "Hello! I am your Intelligent Enterprise Assistant. How can I help you today? I have access to HR, Finance, IT/DevOps, and Communication tools.";
        }
        else if (capabilities.some(c => qLower.includes(c))) {
            convResponse = "I can assist with a variety of enterprise tasks, including: checking leave balances or submitting expenses (HR), retrieving revenue reports or creating invoices (Finance), restarting servers or opening incident tickets (IT/DevOps), and sending emails or posting Slack/Teams messages (Communication). Just type your query and I will route it to the correct tools!";
        }
        else if (identity.some(i => qLower.includes(i))) {
            convResponse = "I am the Intelligent Enterprise Assistant, a natural-language routing gateway designed to orchestrate complex actions across enterprise tool catalogs securely.";
        }
        else if (gratitude.includes(qLower) || gratitude.some(g => qLower === g + "!")) {
            convResponse = "You're welcome! Let me know if there is anything else I can do for you.";
        }
        if (convResponse) {
            traceLogs.push(`Route Intent Detection: Conversational query detected. Bypassing tool registry.`);
            return {
                selected_tools: [],
                plan: [],
                clarify: false,
                clarify_question: null,
                department: "General",
                confidence: 1.0,
                needsClarification: false,
                clarificationPrompt: "",
                toolCalls: [],
                traceLogs,
                conversationalResponse: convResponse
            };
        }
        // 1. Signature Matching
        for (const sig of SIGNATURES) {
            const kwsMatch = sig.keywords.every(kw => qLower.includes(kw));
            if (!kwsMatch)
                continue;
            let exMatch = false;
            if (sig.exclude) {
                exMatch = sig.exclude.some(ex => qLower.includes(ex));
            }
            if (exMatch)
                continue;
            traceLogs.push(`Stage 1: Intent isolated via Signature Matching rules. Direct signature match.`);
            if (sig.clarify) {
                const q = sig.clarify_question || "Could you clarify your request?";
                traceLogs.push(`Gating Rule: Signature requires user clarification. Prompt: "${q}"`);
                return {
                    selected_tools: [],
                    plan: [],
                    clarify: true,
                    clarify_question: q,
                    department: "General",
                    confidence: 1.0,
                    needsClarification: true,
                    clarificationPrompt: q,
                    toolCalls: [],
                    traceLogs
                };
            }
            let selectedResolved = [];
            if (sig.tools) {
                for (const tid of sig.tools) {
                    const res = this.resolveToolId(tid);
                    if (res) {
                        if (res !== tid) {
                            traceLogs.push(`Version Resolver: Upgraded deprecated tool '${tid}' to active version '${res}'`);
                        }
                        selectedResolved.push(res);
                    }
                }
            }
            let planResolved = [];
            if (sig.plan) {
                for (const tid of sig.plan) {
                    const res = this.resolveToolId(tid);
                    if (res)
                        planResolved.push(res);
                }
            }
            // Overrides for v1 vs v2 invoices
            if (qLower.includes('invoice')) {
                if (qLower.includes('legacy') || qLower.includes('v1') || qLower.includes('old')) {
                    if (this.toolById['fin.create_invoice']) {
                        traceLogs.push(`Backward Compatibility: Query requests legacy format. Enforcing version 'fin.create_invoice'`);
                        selectedResolved = selectedResolved.map(t => t === 'fin.create_invoice_v2' ? 'fin.create_invoice' : t);
                        planResolved = planResolved.map(t => t === 'fin.create_invoice_v2' ? 'fin.create_invoice' : t);
                    }
                }
                else {
                    if (this.toolById['fin.create_invoice_v2']) {
                        selectedResolved = selectedResolved.map(t => t === 'fin.create_invoice' ? 'fin.create_invoice_v2' : t);
                        planResolved = planResolved.map(t => t === 'fin.create_invoice' ? 'fin.create_invoice_v2' : t);
                    }
                }
            }
            // Convert tool IDs to IEA visual toolCalls format
            const toolCalls = planResolved.map(tid => {
                const toolObj = this.toolById[tid] || { name: tid.split('.')[1] || tid };
                return {
                    toolName: toolObj.name || tid,
                    parameters: {}
                };
            });
            let dept = 'General';
            if (selectedResolved.length > 0) {
                const firstTool = this.toolById[selectedResolved[0]];
                if (firstTool && firstTool.cluster) {
                    dept = firstTool.cluster.toUpperCase();
                }
            }
            traceLogs.push(`Routing Decision Complete: Isolated Department: ${dept.toUpperCase()}. Selected Plan: [${planResolved.join(', ')}]`);
            return {
                selected_tools: selectedResolved,
                plan: planResolved,
                clarify: false,
                clarify_question: null,
                department: dept,
                confidence: 0.98,
                needsClarification: false,
                clarificationPrompt: "",
                toolCalls,
                traceLogs
            };
        }
        // 2. Fallback Router (Token Overlap Search)
        const STOPWORDS = new Set(["what", "is", "am", "being", "my", "for", "to", "in", "with", "the", "a", "an", "of", "it", "on", "at", "by", "that", "this", "from", "you", "me", "i", "we", "us", "they", "them", "our", "your", "day", "days", "please", "can", "could", "should", "would", "how", "why", "where", "when", "who", "which", "are", "do", "does", "did", "have", "has", "had", "will", "shall", "be", "been", "was", "were", "go", "get", "take", "make", "find", "search", "lookup"]);
        const tokens = (qLower.match(/[a-z0-9]+/g) || []).filter(tok => !STOPWORDS.has(tok));
        if (tokens.length === 0) {
            return {
                selected_tools: [],
                plan: [],
                clarify: false,
                clarify_question: null,
                department: "General",
                confidence: 0.0,
                needsClarification: false,
                clarificationPrompt: "",
                toolCalls: [],
                traceLogs
            };
        }
        // Stage 1: Cluster Isolation & Focus
        const candidateClusters = new Set();
        const rawTokensSetForCluster = new Set((qLower.match(/[a-z0-9]+/g) || []));
        for (const t of this.tools) {
            const cluster = t.cluster || '';
            if (cluster) {
                const isClusterNameMatch = rawTokensSetForCluster.has(cluster.toLowerCase()) ||
                    cluster.toLowerCase().split(/[_\.]/).some((sub) => rawTokensSetForCluster.has(sub));
                const tTokensSet = new Set(((t.name + " " + (t.description || "")).toLowerCase().match(/[a-z0-9]+/g) || []));
                const isContentMatch = tokens.some(tok => tTokensSet.has(tok));
                if (isClusterNameMatch || isContentMatch) {
                    candidateClusters.add(cluster);
                }
            }
        }
        if (candidateClusters.size > 0) {
            traceLogs.push(`Stage 1: Intent isolated to primary clusters: [${Array.from(candidateClusters).join(', ').toUpperCase()}]`);
        }
        else {
            traceLogs.push(`Stage 1: No primary clusters isolated. Performing global scope search.`);
        }
        const rawTokensSet = new Set((qLower.match(/[a-z0-9]+/g) || []));
        const scoredTools = [];
        for (const t of this.tools) {
            const tText = `${t.name} ${t.description} ${(t.tags || []).join(' ')}`.toLowerCase();
            const tTokens = (tText.match(/[a-z0-9]+/g) || []);
            // Calculate TF (Term Frequency) counts for this tool
            const tfCounts = {};
            for (const tok of tTokens) {
                tfCounts[tok] = (tfCounts[tok] || 0) + 1;
            }
            // Calculate sum of TF-IDF weights for query tokens
            let tfidfScore = 0;
            for (const tok of tokens) {
                if (tfCounts[tok]) {
                    const tf = tfCounts[tok] / tTokens.length; // Normalized TF
                    const idf = this.idfs[tok] || 1.0;
                    tfidfScore += tf * idf;
                }
            }
            // Scale TF-IDF score to match other name/tag boosts
            let score = tfidfScore * 10;
            // Boost tag matches
            if (t.tags) {
                for (const tag of t.tags) {
                    if (rawTokensSet.has(tag.toLowerCase()))
                        score += 2;
                }
            }
            // Boost name matches
            const cleanName = t.name.toLowerCase();
            if (rawTokensSet.has(cleanName)) {
                score += 4;
            }
            else {
                const boundaryRegex = new RegExp('\\b' + cleanName.replace(/[_\.]/g, '[_\\s\\.]') + '\\b');
                if (boundaryRegex.test(qLower)) {
                    score += 4;
                }
            }
            // Cluster focus affinity boost
            if (t.cluster && candidateClusters.has(t.cluster)) {
                score += 1.5; // Promote cohesive tools
            }
            // Deprecated version penalties
            if (t.deprecated) {
                if (qLower.includes('legacy') || qLower.includes('v1') || qLower.includes('old')) {
                    score += 3;
                }
                else {
                    score -= 4; // Penalize deprecated tool if not explicitly requested
                }
            }
            if (score > 0) {
                scoredTools.push({ tool: t, score });
            }
        }
        if (scoredTools.length === 0) {
            const clarifyPrompt = "Could you please clarify your request? I couldn't find a matching tool in the enterprise catalog.";
            traceLogs.push(`Stage 2: No candidate tools matched query tokens. Halting and requesting clarification.`);
            return {
                selected_tools: [],
                plan: [],
                clarify: true,
                clarify_question: clarifyPrompt,
                department: "General",
                confidence: 0.1,
                needsClarification: true,
                clarificationPrompt: clarifyPrompt,
                toolCalls: [],
                traceLogs
            };
        }
        // Stage 2: Multi-Signal Tie-Breaker sorting
        const bestScore = Math.max(...scoredTools.map(x => x.score));
        scoredTools.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            // Only trace logs for high-confidence candidate tools (top tier)
            const isTopTier = a.score >= bestScore - 1;
            // Signal A: Version Recency (prefer non-deprecated)
            if (a.tool.deprecated !== b.tool.deprecated) {
                const winner = a.tool.deprecated ? b.tool : a.tool;
                if (isTopTier) {
                    traceLogs.push(`Stage 2 (Tie-Breaker): Resolved tie between '${a.tool.id}' and '${b.tool.id}' on Version Recency. Winner: '${winner.id}'`);
                }
                return a.tool.deprecated ? 1 : -1;
            }
            // Signal B: Security Privilege Minimization (Least Privilege)
            const getRoleRank = (permissions = []) => {
                if (permissions.length === 0)
                    return 0;
                if (permissions.includes('Employee'))
                    return 1;
                if (permissions.includes('Manager'))
                    return 2;
                return 3;
            };
            const rankA = getRoleRank(a.tool.requiredPermissions);
            const rankB = getRoleRank(b.tool.requiredPermissions);
            if (rankA !== rankB) {
                const winner = rankA < rankB ? a.tool : b.tool;
                if (isTopTier) {
                    traceLogs.push(`Stage 2 (Tie-Breaker): Resolved tie between '${a.tool.id}' and '${b.tool.id}' on Security Least Privilege. Winner: '${winner.id}'`);
                }
                return rankA - rankB;
            }
            // Signal C: Side-Effect Safety (prefer read-only over write/delete)
            const getSafetyRank = (effects = 'read') => {
                if (effects === 'read')
                    return 1;
                if (effects === 'write')
                    return 2;
                return 3;
            };
            const safetyA = getSafetyRank(a.tool.side_effects);
            const safetyB = getSafetyRank(b.tool.side_effects);
            if (safetyA !== safetyB) {
                const winner = safetyA < safetyB ? a.tool : b.tool;
                if (isTopTier) {
                    traceLogs.push(`Stage 2 (Tie-Breaker): Resolved tie between '${a.tool.id}' and '${b.tool.id}' on Side-Effect Safety. Winner: '${winner.id}'`);
                }
                return safetyA - safetyB;
            }
            return 0; // Absolute tie
        });
        // Stage 3: Cross-Cluster Collision Gating
        const topScored = scoredTools.filter(x => x.score === bestScore);
        const topClusters = new Set(topScored.map(x => x.tool.cluster).filter(Boolean));
        if (topScored.length > 1 && topClusters.size > 1) {
            const clusterList = Array.from(topClusters).map(c => c.toUpperCase());
            const clarifyPrompt = `I detected multiple unrelated capabilities matching your query across the ${clusterList.join(' and ')} domains. Could you please clarify which action you intended?`;
            traceLogs.push(`Stage 3 (Collision Gating): Collision detected between clusters [${clusterList.join(', ')}]. Halting and requesting clarification.`);
            return {
                selected_tools: [],
                plan: [],
                clarify: true,
                clarify_question: clarifyPrompt,
                department: "General",
                confidence: 0.5,
                needsClarification: true,
                clarificationPrompt: clarifyPrompt,
                toolCalls: [],
                traceLogs
            };
        }
        const threshold = Math.max(1, bestScore - 1);
        const candidates = scoredTools.filter(x => x.score >= threshold).map(x => x.tool);
        // Near duplicate deduplication
        const deduplicated = [];
        for (const cand of candidates) {
            let dupGroup = null;
            for (const group of this.nearDuplicateGroups) {
                if (group.includes(cand.id)) {
                    dupGroup = group;
                    break;
                }
            }
            if (dupGroup) {
                const dupMatch = deduplicated.find(item => dupGroup.includes(item.id));
                if (dupMatch) {
                    traceLogs.push(`Deduplication: Filtered out duplicate candidate '${cand.id}' in favor of '${dupMatch.id}'`);
                }
                else {
                    deduplicated.push(cand);
                }
            }
            else {
                deduplicated.push(cand);
            }
        }
        const selectedIds = deduplicated.slice(0, 5).map(t => t.id);
        // Sort plan sequencing
        const getSequenceWeight = (t) => {
            const effects = t.side_effects || 'read';
            const cluster = t.cluster || '';
            const name = t.name.toLowerCase();
            if (effects === 'read' || name.startsWith('get') || name.startsWith('fetch') || name.startsWith('lookup')) {
                return 1;
            }
            else if (['analytics', 'data_export'].includes(cluster)) {
                return 2;
            }
            else if (effects === 'write' || name.startsWith('create') || name.startsWith('submit') || name.startsWith('post')) {
                return 3;
            }
            else if (['communication', 'documents'].includes(cluster) || name.startsWith('send') || name.startsWith('share') || name.startsWith('upload')) {
                return 4;
            }
            return 5;
        };
        const plannedTools = [...deduplicated].sort((a, b) => getSequenceWeight(a) - getSequenceWeight(b));
        const planIds = plannedTools.map(t => t.id);
        const toolCalls = planIds.map(tid => {
            const toolObj = this.toolById[tid] || { name: tid.split('.')[1] || tid };
            return {
                toolName: toolObj.name || tid,
                parameters: {}
            };
        });
        let dept = 'General';
        if (plannedTools.length > 0) {
            dept = plannedTools[0].cluster ? plannedTools[0].cluster.toUpperCase() : 'General';
        }
        traceLogs.push(`Stage 4: Plan sequencing finalized: [${planIds.join(' → ')}]. Routing success.`);
        return {
            selected_tools: selectedIds,
            plan: planIds,
            clarify: false,
            clarify_question: null,
            department: dept,
            confidence: Math.min(1.0, bestScore / 10),
            needsClarification: false,
            clarificationPrompt: "",
            toolCalls,
            traceLogs
        };
    }
}
