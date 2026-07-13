import Anthropic from '@anthropic-ai/sdk';
import { toolsRegistry } from './registry.js';
// System Date Helper
const getSystemDateInfo = () => {
    const now = new Date();
    return {
        today: now.toISOString().split('T')[0],
        tomorrow: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        dayAfterTomorrow: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        currentYear: now.getFullYear(),
        currentMonthName: now.toLocaleString('default', { month: 'long' })
    };
};
// Date Arithmetic Helper
const addDays = (dateStr, days) => {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
};
// Simple date parser for common relative strings
const parseRelativeDate = (text) => {
    const { today, tomorrow, dayAfterTomorrow } = getSystemDateInfo();
    const t = text.toLowerCase();
    if (t.includes('today'))
        return today;
    if (t.includes('tomorrow'))
        return tomorrow;
    if (t.includes('day after tomorrow'))
        return dayAfterTomorrow;
    // Check "next monday", "next tuesday", etc.
    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < 7; i++) {
        if (t.includes(`next ${daysOfWeek[i]}`)) {
            const now = new Date();
            const currentDay = now.getDay();
            let daysToAdd = i - currentDay;
            if (daysToAdd <= 0)
                daysToAdd += 7; // Next week's day
            return new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        }
    }
    // Check specific day name (e.g., "on monday") within the current/upcoming week
    for (let i = 0; i < 7; i++) {
        if (t.includes(daysOfWeek[i])) {
            const now = new Date();
            const currentDay = now.getDay();
            let daysToAdd = i - currentDay;
            if (daysToAdd < 0)
                daysToAdd += 7; // Treat past days as upcoming in the next 7 days
            return new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        }
    }
    // Standard YYYY-MM-DD search
    const dateMatch = text.match(/\b\d{4}-\d{2}-\d{2}\b/);
    if (dateMatch)
        return dateMatch[0];
    return today; // Fallback
};
// Keyword weights for Department matching
const deptKeywords = {
    'Human Resources': ['leave', 'sick', 'payslip', 'salary', 'attendance', 'holiday', 'employee', 'profile', 'address', 'phone', 'vacation', 'time off', 'check-in', 'check-out'],
    'Information Technology': ['password', 'vpn', 'ad', 'account', 'lock', 'software', 'laptop', 'macbook', 'wifi', 'guest', 'ticket', 'issue', 'credentials', 'install', 'network', 'wi-fi'],
    'Finance': ['reimbursement', 'expense', 'invoice', 'budget', 'claim', 'payment', 'vendor', 'po', 'billing', 'spent', 'financial', 'payout'],
    'Project Management': ['task', 'jira', 'linear', 'sprint', 'meeting', 'calendar', 'event', 'invite', 'project status', 'schedule', 'todo', 'kanban'],
    'Sales': ['sales', 'lead', 'crm', 'revenue', 'customer', 'deal', 'quota', 'prospect'],
    'Marketing': ['campaign', 'marketing', 'social media', 'linkedin', 'twitter', 'clicks', 'ads', 'newsletter', 'email blast', 'ctr'],
    'Procurement': ['procurement', 'purchase', 'vendor', 'asset', 'supplies', 'requisition', 'cdw'],
    'Inventory': ['stock', 'sku', 'inventory', 'warehouse', 'aisle', 'shelf', 'reorder'],
    'Legal': ['policy', 'nda', 'contract', 'compliance', 'legal', 'agreement', 'bylaws', 'handbook', 'confidentiality'],
    'Customer Support': ['support', 'ticket', 'escalate', 'satisfaction', 'csat', 'zendesk', 'customer support', 'nps', 'survey'],
    'Operations': ['dispatch', 'shipment', 'delivery', 'courier', 'freight', 'tracking', 'dhl', 'ups'],
    'Analytics': ['kpi', 'analytics', 'report', 'forecast', 'projection', 'dashboard', 'arr', 'mrr'],
    'Security': ['phishing', 'mfa', 'okta', 'access log', 'threat', 'alert', 'security', 'hack', 'firewall', 'quarantine'],
    'Facilities': ['conference room', 'meeting room', 'facility', 'ac leaking', 'visitor pass', 'maintanence', 'bulb', 'reception', 'guest pass'],
    'Administration': ['stationery', 'courier', 'parking slot', 'license plate', 'car', 'papers', 'notebook']
};
/**
 * LOCAL ROUTER
 * Uses simple heuristic NLP, keyword token overlap, synonyms, and rule-based planners.
 */
export const runLocalRouter = (query, history, role) => {
    const lowercaseQuery = query.toLowerCase();
    const dateInfo = getSystemDateInfo();
    // 1. Context Retention: Check if this is a follow-up to a leave-balance or meeting booking query
    let activeContext = null;
    if (history && history.length > 0) {
        // Get last user & assistant exchange
        const lastExchange = history.slice(-2);
        if (lastExchange.length >= 2) {
            const lastAssistantMsg = lastExchange[1];
            if (lastAssistantMsg.role === 'assistant' && lastAssistantMsg.logs) {
                const lastToolCalled = lastAssistantMsg.logs.find((l) => l.action.includes('Executed Tool'));
                if (lastToolCalled) {
                    activeContext = lastToolCalled.target; // E.g., "leave_balance" or "schedule_meeting"
                }
            }
        }
    }
    // 2. Department Detection
    let bestDept = 'Information Technology';
    let maxDeptScore = 0;
    for (const [dept, keywords] of Object.entries(deptKeywords)) {
        let score = 0;
        for (const kw of keywords) {
            if (lowercaseQuery.includes(kw)) {
                score += 2;
            }
        }
        if (score > maxDeptScore) {
            maxDeptScore = score;
            bestDept = dept;
        }
    }
    // 3. Tool Selection: Search all tools and rank them
    const rankedTools = toolsRegistry.map(tool => {
        let score = 0;
        // Exact name match
        if (lowercaseQuery.includes(tool.name.replace(/_/g, ' '))) {
            score += 10;
        }
        // Title matching
        const titleWords = tool.title.toLowerCase().split(' ');
        for (const w of titleWords) {
            if (w.length > 3 && lowercaseQuery.includes(w)) {
                score += 3;
            }
        }
        // Description matching
        const descWords = tool.description.toLowerCase().split(' ');
        for (const w of descWords) {
            if (w.length > 3 && lowercaseQuery.includes(w)) {
                score += 1;
            }
        }
        // Department match bonus
        if (tool.department === bestDept) {
            score += 2;
        }
        return { tool, score };
    }).filter(t => t.score > 0);
    // Prioritize meeting scheduling over sending invitation when creating a meeting is requested
    if (lowercaseQuery.includes('schedule') || lowercaseQuery.includes('book') || lowercaseQuery.includes('create')) {
        if (lowercaseQuery.includes('meeting') || lowercaseQuery.includes('calendar') || lowercaseQuery.includes('event')) {
            const scheduleMtgIdx = rankedTools.findIndex(t => t.tool.name === 'schedule_meeting');
            if (scheduleMtgIdx !== -1) {
                rankedTools[scheduleMtgIdx].score += 15;
            }
        }
    }
    rankedTools.sort((a, b) => b.score - a.score);
    // If no tools match, but we have a context of "leave_balance" and query is about applying
    if (rankedTools.length === 0 || rankedTools[0].score < 2) {
        if (activeContext === 'leave_balance' && (lowercaseQuery.includes('apply') || lowercaseQuery.includes('take') || lowercaseQuery.includes('request'))) {
            const applyLeaveTool = toolsRegistry.find(t => t.name === 'apply_leave');
            if (applyLeaveTool) {
                rankedTools.unshift({ tool: applyLeaveTool, score: 8 });
            }
        }
    }
    // Fallback if nothing matched
    if (rankedTools.length === 0 || rankedTools[0].score < 1.5) {
        return {
            department: bestDept,
            confidence: 0.1,
            needsClarification: true,
            clarificationPrompt: "I couldn't locate a specific tool in our catalog that matches your request. Could you rephrase your query? (For example: 'Show my leave balance', 'Reset my VPN password', or 'Book a room')",
            toolCalls: []
        };
    }
    const primaryMatch = rankedTools[0].tool;
    const confidence = Math.min(0.9, 0.2 + (rankedTools[0].score / 15));
    // 4. Multi-Tool Planning Rules
    // E.g., "Schedule a meeting with Rahul and invite priya"
    // Needs: schedule_meeting + send_meeting_invitation
    if (primaryMatch.name === 'schedule_meeting' && (lowercaseQuery.includes('invite') || lowercaseQuery.includes('send invitation') || lowercaseQuery.includes('email them'))) {
        // Plan multi-tool
        const meetingParams = {
            title: lowercaseQuery.includes('about')
                ? query.substring(lowercaseQuery.indexOf('about') + 5).split('and')[0].trim()
                : 'Discussion Sync',
            meetingDate: parseRelativeDate(query),
            startTime: lowercaseQuery.match(/\b\d{2}:\d{2}\b/) ? lowercaseQuery.match(/\b\d{2}:\d{2}\b/)[0] : '14:00',
            durationMinutes: lowercaseQuery.includes('hour') ? 60 : 30
        };
        // Extract emails/names for invitations
        let recipients = [];
        if (lowercaseQuery.includes('invite')) {
            const invitePart = query.substring(lowercaseQuery.indexOf('invite') + 6);
            recipients = invitePart.split(/,|and/).map(s => s.trim()).filter(s => s.length > 0);
        }
        else {
            recipients = ['team@enterprise.com'];
        }
        return {
            department: 'Project Management',
            confidence: 0.85,
            needsClarification: false,
            toolCalls: [
                {
                    toolName: 'schedule_meeting',
                    parameters: meetingParams
                },
                {
                    toolName: 'send_meeting_invitation',
                    parameters: {
                        meetingId: 'MTG-TEMP', // Will be replaced by execution output dynamically
                        recipients: recipients
                    }
                }
            ]
        };
    }
    // 5. Single Tool Parameter Extraction
    const extractedParams = {};
    if (primaryMatch.name === 'apply_leave') {
        // Check if we have leave type
        let leaveType = 'casual';
        if (lowercaseQuery.includes('sick'))
            leaveType = 'sick';
        if (lowercaseQuery.includes('annual') || lowercaseQuery.includes('vacation'))
            leaveType = 'annual';
        extractedParams.leaveType = leaveType;
        // Check reason
        extractedParams.reason = lowercaseQuery.includes('for')
            ? query.substring(lowercaseQuery.indexOf('for') + 4).trim()
            : 'Personal work';
        // Dates
        if (lowercaseQuery.includes('tomorrow')) {
            extractedParams.startDate = dateInfo.tomorrow;
            extractedParams.endDate = dateInfo.tomorrow;
        }
        else if (lowercaseQuery.includes('next week')) {
            // Set to next Monday to next Tuesday
            const nextMon = parseRelativeDate('next monday');
            extractedParams.startDate = nextMon;
            extractedParams.endDate = parseRelativeDate('next tuesday');
        }
        else {
            // Look for days count
            const daysMatch = lowercaseQuery.match(/(\d+)\s*day/);
            if (daysMatch) {
                const days = parseInt(daysMatch[1]);
                const start = parseRelativeDate(query);
                extractedParams.startDate = start;
                extractedParams.endDate = addDays(start, days - 1);
            }
            else {
                // Missing dates
                return {
                    department: 'Human Resources',
                    confidence: 0.8,
                    needsClarification: true,
                    clarificationPrompt: `I detected you want to apply for ${leaveType} leave. Could you please provide the start date and end date? (e.g., "Apply casual leave from 2026-07-20 to 2026-07-22")`,
                    toolCalls: []
                };
            }
        }
    }
    else if (primaryMatch.name === 'download_payslip') {
        const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
        let month = dateInfo.currentMonthName;
        for (const m of months) {
            if (lowercaseQuery.includes(m)) {
                month = m.charAt(0).toUpperCase() + m.slice(1);
                break;
            }
        }
        extractedParams.month = month;
        const yearMatch = lowercaseQuery.match(/\b(202\d)\b/);
        extractedParams.year = yearMatch ? parseInt(yearMatch[1]) : dateInfo.currentYear;
    }
    else if (primaryMatch.name === 'wifi_guest_access') {
        // Extract guest name
        let guestName = 'External Guest';
        const forMatch = query.match(/for\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
        if (forMatch) {
            guestName = forMatch[1];
        }
        else {
            return {
                department: 'Information Technology',
                confidence: 0.8,
                needsClarification: true,
                clarificationPrompt: "To generate guest Wi-Fi access, could you please provide the name of the guest?",
                toolCalls: []
            };
        }
        extractedParams.guestName = guestName;
        // Duration
        const daysMatch = lowercaseQuery.match(/(\d+)\s*day/);
        extractedParams.durationDays = daysMatch ? parseInt(daysMatch[1]) : 1;
    }
    else if (primaryMatch.name === 'create_it_ticket') {
        extractedParams.issueDescription = query;
        extractedParams.category = 'Hardware';
        if (lowercaseQuery.includes('software') || lowercaseQuery.includes('install') || lowercaseQuery.includes('license')) {
            extractedParams.category = 'Software';
        }
        else if (lowercaseQuery.includes('internet') || lowercaseQuery.includes('network') || lowercaseQuery.includes('wifi') || lowercaseQuery.includes('wi-fi') || lowercaseQuery.includes('vpn')) {
            extractedParams.category = 'Network';
        }
        else if (lowercaseQuery.includes('login') || lowercaseQuery.includes('password') || lowercaseQuery.includes('access')) {
            extractedParams.category = 'Access Management';
        }
    }
    else if (primaryMatch.name === 'get_ticket_status') {
        const ticketMatch = lowercaseQuery.match(/inc-\d+/);
        if (ticketMatch) {
            extractedParams.ticketId = ticketMatch[0].toUpperCase();
        }
        else {
            return {
                department: 'Information Technology',
                confidence: 0.8,
                needsClarification: true,
                clarificationPrompt: "Please provide the IT ticket reference ID (e.g. INC-123456) to check its status.",
                toolCalls: []
            };
        }
    }
    else if (primaryMatch.name === 'submit_reimbursement') {
        // Extract amount
        const amountMatch = lowercaseQuery.match(/(?:usd|\$)\s*(\d+(?:\.\d+)?)/) || lowercaseQuery.match(/(\d+(?:\.\d+)?)\s*(?:usd|\$|dollars)/);
        if (amountMatch) {
            extractedParams.amount = parseFloat(amountMatch[1]);
        }
        else {
            return {
                department: 'Finance',
                confidence: 0.8,
                needsClarification: true,
                clarificationPrompt: "To log your reimbursement claim, I need the amount in USD. Could you please specify how much you spent?",
                toolCalls: []
            };
        }
        // Category
        let category = 'Meals';
        if (lowercaseQuery.includes('travel') || lowercaseQuery.includes('flight') || lowercaseQuery.includes('taxi') || lowercaseQuery.includes('cab'))
            category = 'Travel';
        else if (lowercaseQuery.includes('office') || lowercaseQuery.includes('stationery') || lowercaseQuery.includes('supplies'))
            category = 'Office Supplies';
        else if (lowercaseQuery.includes('client') || lowercaseQuery.includes('entertainment') || lowercaseQuery.includes('dinner'))
            category = 'Client Entertainment';
        else if (lowercaseQuery.includes('training') || lowercaseQuery.includes('course') || lowercaseQuery.includes('cert'))
            category = 'Training';
        extractedParams.category = category;
        extractedParams.date = parseRelativeDate(query);
        extractedParams.description = lowercaseQuery.includes('for')
            ? query.substring(lowercaseQuery.indexOf('for') + 4).trim()
            : `Expense for ${category}`;
    }
    else if (primaryMatch.name === 'get_reimbursement_status') {
        const claimMatch = lowercaseQuery.match(/exp-\d+/);
        if (claimMatch) {
            extractedParams.claimId = claimMatch[0].toUpperCase();
        }
        else {
            return {
                department: 'Finance',
                confidence: 0.8,
                needsClarification: true,
                clarificationPrompt: "Please provide the reimbursement claim ID (e.g. EXP-12345) to retrieve the status.",
                toolCalls: []
            };
        }
    }
    else if (primaryMatch.name === 'create_task') {
        extractedParams.title = lowercaseQuery.includes('task')
            ? query.substring(lowercaseQuery.indexOf('task') + 4).trim()
            : 'New Task';
        extractedParams.description = 'Created via Enterprise Assistant';
        extractedParams.priority = 'Medium';
        if (lowercaseQuery.includes('high') || lowercaseQuery.includes('urgent'))
            extractedParams.priority = 'High';
        if (lowercaseQuery.includes('critical') || lowercaseQuery.includes('blocker'))
            extractedParams.priority = 'Critical';
        // Assignee
        const assignMatch = query.match(/(?:assign to|assignee is)\s+([A-Z][a-z]+)/);
        if (assignMatch) {
            extractedParams.assigneeName = assignMatch[1];
        }
    }
    else if (primaryMatch.name === 'book_conference_room') {
        let room = 'Conference Room 2B';
        if (lowercaseQuery.includes('boardroom'))
            room = 'Boardroom A';
        else if (lowercaseQuery.includes('lovelace'))
            room = 'Ada Lovelace Suite';
        else if (lowercaseQuery.includes('turing'))
            room = 'Alan Turing Lab';
        else if (lowercaseQuery.includes('huddle'))
            room = 'Huddle Room 4';
        extractedParams.roomName = room;
        extractedParams.bookingDate = parseRelativeDate(query);
        // Start Time
        const timeMatch = lowercaseQuery.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/) || lowercaseQuery.match(/\b\d{2}:\d{2}\b/);
        if (timeMatch) {
            let rawTime = timeMatch[0];
            if (rawTime.includes('pm') && !rawTime.includes(':')) {
                const hour = parseInt(rawTime);
                rawTime = `${hour + 12}:00`;
            }
            else if (rawTime.includes('am') && !rawTime.includes(':')) {
                const hour = parseInt(rawTime);
                rawTime = `${String(hour).padStart(2, '0')}:00`;
            }
            extractedParams.startTime = rawTime.replace(/\s*(?:am|pm)/i, '');
        }
        else {
            extractedParams.startTime = '10:00';
        }
        // Duration
        const hrMatch = lowercaseQuery.match(/(\d+)\s*hour/);
        extractedParams.durationHours = hrMatch ? parseInt(hrMatch[1]) : 1;
    }
    // Populate default required parameters if missing from basic matching
    for (const [paramName, paramMeta] of Object.entries(primaryMatch.inputSchema)) {
        if (paramMeta.required && extractedParams[paramName] === undefined) {
            if (paramMeta.type === 'string') {
                extractedParams[paramName] = `Default ${paramName}`;
            }
            else if (paramMeta.type === 'number') {
                extractedParams[paramName] = 1;
            }
            else if (paramMeta.type === 'boolean') {
                extractedParams[paramName] = true;
            }
            else if (paramMeta.type === 'date') {
                extractedParams[paramName] = dateInfo.today;
            }
        }
    }
    return {
        department: primaryMatch.department,
        confidence,
        needsClarification: false,
        toolCalls: [
            {
                toolName: primaryMatch.name,
                parameters: extractedParams
            }
        ]
    };
};
/**
 * CLAUDE AI ROUTER
 * Instructs Claude to act as a structured router and return JSON matching our planning format.
 */
export const runClaudeRouter = async (query, history, role, apiKey, modelName) => {
    const client = new Anthropic({ apiKey });
    // Format tool descriptions for Claude, excluding code mock handlers
    const toolsDocumentation = toolsRegistry.map(t => ({
        name: t.name,
        title: t.title,
        description: t.description,
        department: t.department,
        requiredPermissions: t.requiredPermissions,
        inputSchema: t.inputSchema
    }));
    const { today, currentYear, currentMonthName } = getSystemDateInfo();
    const messages = [];
    // Add conversation history
    if (history && history.length > 0) {
        history.forEach(h => {
            messages.push({
                role: h.role === 'assistant' ? 'assistant' : 'user',
                content: h.content
            });
        });
    }
    // Add active query
    messages.push({
        role: 'user',
        content: query
    });
    const systemPrompt = `You are the core routing engine for the Intelligent Enterprise Assistant (IEA).
Your task is to analyze the user's Natural Language query in the context of the conversation history, identify the appropriate Department and select the correct Tool(s) to execute from the catalog of tools.

Current System Date Information:
- Today is: ${today}
- Current Month: ${currentMonthName}
- Current Year: ${currentYear}

List of Available Enterprise Tools:
${JSON.stringify(toolsDocumentation, null, 2)}

User Role: "${role}"

Instructions:
1. Identify the user intent and categorize the department.
2. Select the matching tool(s). You can select MULTIPLE tools if the query requires sequence execution (e.g. Schedule meeting AND send invites).
3. Extract parameters matching the tool's inputSchema.
4. Check if the user role is authorized to execute the selected tool(s) (check requiredPermissions). If they lack permission, still select the tool, but the backend will enforce security block later.
5. If the query is ambiguous, or missing required fields for the tool (e.g. applying for leave but didn't state start/end dates), set "needsClarification": true and formulate a polite clarification question in "clarificationPrompt".
6. Respond ONLY with a valid, clean JSON object. Do not include markdown code block styling or extra text.

JSON Schema Output format:
{
  "department": "Department Name",
  "confidence": 0.0 to 1.0,
  "needsClarification": boolean,
  "clarificationPrompt": "Polite clarification query string if needsClarification is true, otherwise empty",
  "toolCalls": [
    {
      "toolName": "name_of_tool",
      "parameters": {
        "param1": value,
        "param2": value
      }
    }
  ]
}`;
    try {
        const response = await client.messages.create({
            model: modelName || 'claude-3-5-sonnet-latest',
            max_tokens: 1500,
            temperature: 0,
            system: systemPrompt,
            messages: messages
        });
        let rawText = '';
        if (response.content[0].type === 'text') {
            rawText = response.content[0].text.trim();
        }
        else {
            throw new Error("Invalid response format from Claude API.");
        }
        // Clean JSON if Claude wrapped it in markdown tags
        if (rawText.startsWith('```json')) {
            rawText = rawText.substring(7);
        }
        if (rawText.startsWith('```')) {
            rawText = rawText.substring(3);
        }
        if (rawText.endsWith('```')) {
            rawText = rawText.substring(0, rawText.length - 3);
        }
        rawText = rawText.trim();
        const output = JSON.parse(rawText);
        return output;
    }
    catch (error) {
        console.error('Claude API Routing Error:', error);
        // Fallback to local router if Claude fails
        return runLocalRouter(query, history, role);
    }
};
