import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { toolsRegistry, getToolByName } from './registry.js';
import { runLocalRouter, runClaudeRouter } from './router.js';
dotenv.config();
// Global error handlers to capture silent crashes
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION AT:', promise, 'REASON:', reason);
});
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors());
app.use(express.json());
// Serve static assets from frontend build directory
const frontendDistPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDistPath));
const mockDatabase = {
    'USR-001': {
        userId: 'USR-001',
        name: 'Amit Sharma',
        role: 'Employee',
        phone: '+1 (555) 014-9921',
        address: '42 Main St, San Francisco, CA 94105',
        leaves: { casual: 12, sick: 8, annual: 15, pendingApproval: 0 },
        leaveRequests: []
    },
    'USR-002': {
        userId: 'USR-002',
        name: 'Rahul Varma',
        role: 'Manager',
        phone: '+1 (555) 018-8832',
        address: '782 Broadway, Redwood City, CA 94063',
        leaves: { casual: 10, sick: 6, annual: 20, pendingApproval: 2 },
        leaveRequests: [
            {
                requestId: 'LV-4491',
                startDate: '2026-07-20',
                endDate: '2026-07-21',
                leaveType: 'casual',
                reason: 'Family visit',
                days: 2,
                status: 'Pending Approval'
            }
        ]
    },
    'USR-003': {
        userId: 'USR-003',
        name: 'Priya Nair',
        role: 'HR',
        phone: '+1 (555) 012-7711',
        address: '109 Hillsdale Blvd, San Mateo, CA 94403',
        leaves: { casual: 14, sick: 10, annual: 18, pendingApproval: 0 },
        leaveRequests: []
    },
    'USR-004': {
        userId: 'USR-004',
        name: 'John Doe',
        role: 'Finance',
        phone: '+1 (555) 019-3388',
        address: '55 Ocean Ave, Santa Cruz, CA 95060',
        leaves: { casual: 8, sick: 8, annual: 22, pendingApproval: 0 },
        leaveRequests: []
    },
    'USR-005': {
        userId: 'USR-005',
        name: 'Sarah Connor',
        role: 'IT_Admin',
        phone: '+1 (555) 011-5544',
        address: '228 Cyberdyne Rd, Cupertino, CA 95014',
        leaves: { casual: 15, sick: 10, annual: 25, pendingApproval: 0 },
        leaveRequests: []
    }
};
const dbHelper = {
    getUserData: (userId) => {
        if (!mockDatabase[userId]) {
            // Create user if they don't exist
            mockDatabase[userId] = {
                userId,
                name: 'New Employee',
                role: 'Employee',
                phone: '+1 (555) 000-0000',
                address: 'Enterprise Headquarters',
                leaves: { casual: 12, sick: 8, annual: 15, pendingApproval: 0 },
                leaveRequests: []
            };
        }
        return mockDatabase[userId];
    }
};
const auditLogs = [];
// Helper to sleep for artificial network delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// ================= API ENDPOINTS =================
// 1. Get Tool Catalog Registry
app.get('/api/tools', (req, res) => {
    const toolsWithoutHandlers = toolsRegistry.map(t => {
        const { mockHandler, ...meta } = t;
        return meta;
    });
    res.json(toolsWithoutHandlers);
});
// 2. Get Audit & System Logs
app.get('/api/logs', (req, res) => {
    res.json(auditLogs);
});
// 3. Process Natural Language Query (Chat Engine)
app.post('/api/chat', async (req, res) => {
    const startTime = Date.now();
    const { query, role = 'Employee', userId = 'USR-001', history = [], apiKey = '', routerType = 'Local', simulatedLatency = 800, // default 800ms
    toolOptimization = true, // default enabled
    claudeModel = 'claude-3-5-sonnet-latest' } = req.body;
    const traceSteps = [];
    const addTrace = (action, target, details, status = 'info') => {
        traceSteps.push({
            time: new Date().toISOString(),
            action,
            target,
            details,
            status
        });
    };
    const user = dbHelper.getUserData(userId);
    const userName = user.name;
    // Quick check if role has been overridden on client
    user.role = role;
    addTrace('Received Request', 'API Gateway', `Query: "${query}" | Role: ${role} | User: ${userName} (${userId})`);
    let routingResult;
    const methodUsed = (routerType === 'Claude' && apiKey) ? 'Claude' : 'Local';
    try {
        addTrace('Route Intent Detection', `${methodUsed} Router`, `Analyzing user query with ${methodUsed} semantic parser...`);
        // Simulate thinking latency
        const thinkingLatency = Math.min(2000, Math.max(100, simulatedLatency * 0.4));
        await sleep(thinkingLatency);
        if (methodUsed === 'Claude') {
            routingResult = await runClaudeRouter(query, history, role, apiKey, claudeModel);
        }
        else {
            routingResult = runLocalRouter(query, history, role);
        }
        // Intercept and bypass optimizations if toolOptimization is disabled
        if (!toolOptimization) {
            addTrace('Optimization Status Check', 'Execution Planner', '⚠️ Tool Optimization is OFF. Initializing brute-force scanning pipeline.', 'warning');
            routingResult.needsClarification = false;
            routingResult.confidence = 0.25; // low confidence representing lack of precision
            const unoptimizedCalls = [];
            const dept = routingResult.department || 'Human Resources';
            // Step 1: User verification sweeps
            unoptimizedCalls.push({
                toolName: 'employee_directory',
                parameters: { searchQuery: userName }
            });
            // Step 2 & 3: Scan candidate tools sequentially by department
            if (dept === 'Human Resources') {
                unoptimizedCalls.push({
                    toolName: 'policy_search',
                    parameters: { searchTopic: 'Leave and attendance rules' }
                });
                unoptimizedCalls.push({
                    toolName: 'holiday_calendar',
                    parameters: {}
                });
                unoptimizedCalls.push({
                    toolName: 'attendance_status',
                    parameters: { month: 'June' }
                });
            }
            else if (dept === 'Information Technology' || dept === 'Security') {
                unoptimizedCalls.push({
                    toolName: 'security_alert_status',
                    parameters: {}
                });
                unoptimizedCalls.push({
                    toolName: 'policy_search',
                    parameters: { searchTopic: 'IT usage and password policy' }
                });
                unoptimizedCalls.push({
                    toolName: 'get_ticket_status',
                    parameters: { ticketId: 'INC-773123' }
                });
            }
            else if (dept === 'Finance' || dept === 'Procurement') {
                unoptimizedCalls.push({
                    toolName: 'get_budget_status',
                    parameters: { targetDepartment: 'Engineering' }
                });
                unoptimizedCalls.push({
                    toolName: 'vendor_search',
                    parameters: { supplyCategory: 'IT Equipment' }
                });
                unoptimizedCalls.push({
                    toolName: 'compliance_report',
                    parameters: { complianceYear: 2026 }
                });
            }
            else {
                unoptimizedCalls.push({
                    toolName: 'policy_search',
                    parameters: { searchTopic: 'Standard operating procedures' }
                });
            }
            // Step 4: Append the original matched tool calls to the end of the chain
            if (routingResult.toolCalls && routingResult.toolCalls.length > 0) {
                unoptimizedCalls.push(...routingResult.toolCalls);
            }
            else {
                const defaultTool = dept === 'Information Technology' ? 'reset_vpn_password' : 'leave_balance';
                unoptimizedCalls.push({
                    toolName: defaultTool,
                    parameters: {}
                });
            }
            routingResult.toolCalls = unoptimizedCalls;
        }
        addTrace('Router Output Decision', `Intent: ${routingResult.needsClarification ? 'Clarify' : 'Execute'}`, `Department: ${routingResult.department} | Confidence: ${(routingResult.confidence * 100).toFixed(1)}%` +
            (routingResult.needsClarification ? ` | Clarification Prompt: "${routingResult.clarificationPrompt}"` : ` | Tools Matched: ${routingResult.toolCalls.map(t => t.toolName).join(', ')}`), routingResult.needsClarification ? 'warning' : 'success');
        // Case A: Router requests clarification
        if (routingResult.needsClarification) {
            const durationMs = Date.now() - startTime;
            const logEntry = {
                id: 'LOG-' + Math.floor(Math.random() * 900000 + 100000),
                timestamp: new Date().toISOString(),
                query,
                role,
                userName,
                routerType: methodUsed,
                department: routingResult.department,
                confidence: routingResult.confidence,
                durationMs,
                success: true,
                toolCallsCount: 0,
                traceSteps
            };
            auditLogs.unshift(logEntry);
            return res.json({
                responseText: routingResult.clarificationPrompt || "Could you please clarify your request?",
                toolOutputs: [],
                logs: traceSteps,
                success: true,
                metrics: {
                    durationMs,
                    toolCallsCount: 0,
                    confidence: routingResult.confidence,
                    routerUsed: methodUsed
                }
            });
        }
        // Case B: Router selected tools to execute
        const toolOutputs = [];
        let stopPlanning = false;
        let lastToolResult = null;
        for (let i = 0; i < routingResult.toolCalls.length; i++) {
            if (stopPlanning)
                break;
            const call = routingResult.toolCalls[i];
            // Context forwarding: if previous tool outputted an ID and this tool needs it
            if (lastToolResult && lastToolResult.meetingId && call.parameters.meetingId === 'MTG-TEMP') {
                call.parameters.meetingId = lastToolResult.meetingId;
                addTrace('Context Pipeline Integration', 'Execution Planner', `Substituted meetingId in ${call.toolName} parameters with actual ID: ${lastToolResult.meetingId}`);
            }
            addTrace('Tool Security Verification', `RBAC validation: ${call.toolName}`, `Checking required permissions...`);
            const tool = getToolByName(call.toolName);
            if (!tool) {
                addTrace('Registry Resolution Failure', call.toolName, `Tool not found in catalog registry.`, 'error');
                toolOutputs.push({ toolName: call.toolName, error: 'Tool not found in catalog registry.' });
                stopPlanning = true;
                continue;
            }
            // Check Role Permissions (RBAC)
            const isAuthorized = tool.requiredPermissions.includes(role);
            if (!isAuthorized) {
                addTrace('Security Access Denied', `RBAC Enforcer`, `Role "${role}" is unauthorized to run "${tool.title}". Requires: ${tool.requiredPermissions.join(', ')}`, 'error');
                toolOutputs.push({
                    toolName: call.toolName,
                    error: `Access Denied: Role "${role}" lacks permissions to use this tool (${tool.title}).`
                });
                stopPlanning = true;
                continue;
            }
            addTrace('Tool Parameters Validation', call.toolName, `Payload: ${JSON.stringify(call.parameters)}`);
            // Run Mock Handler with simulated execution delay
            addTrace('Executing Tool API Call', call.toolName, `Invoking remote service endpoint...`);
            const executionDelay = Math.max(100, simulatedLatency * 0.6);
            await sleep(executionDelay);
            try {
                const result = tool.mockHandler(call.parameters, {
                    userRole: role,
                    userId,
                    userName,
                    db: dbHelper
                });
                lastToolResult = result;
                toolOutputs.push({
                    toolName: call.toolName,
                    title: tool.title,
                    status: 'success',
                    data: result
                });
                addTrace('Executed Tool Successfully', call.toolName, `API Status 200 OK | Response: ${JSON.stringify(result)}`, 'success');
            }
            catch (execError) {
                addTrace('Tool Execution Failed', call.toolName, `Exception: ${execError.message}`, 'error');
                toolOutputs.push({
                    toolName: call.toolName,
                    title: tool.title,
                    status: 'failed',
                    error: execError.message
                });
                stopPlanning = true;
            }
        }
        // 6. Response Synthesis
        addTrace('Synthesizing Response', 'Response Generator', 'Formulating conversational message for the employee...');
        let finalResponse = '';
        const successOutputs = toolOutputs.filter(o => o.status === 'success');
        const failedOutputs = toolOutputs.filter(o => o.error);
        if (failedOutputs.length > 0) {
            finalResponse = `I encountered an issue executing your request: ${failedOutputs[0].error}`;
        }
        else if (successOutputs.length > 0) {
            // Custom synthesis for common tools
            const first = successOutputs[0];
            if (first.toolName === 'leave_balance') {
                finalResponse = `Hi ${userName}, your current leave balance is:\n` +
                    `• Casual Leave: **${first.data.casual} days**\n` +
                    `• Sick Leave: **${first.data.sick} days**\n` +
                    `• Annual Leave: **${first.data.annual} days**\n` +
                    `• Pending Approval: **${first.data.pendingApproval} days**`;
            }
            else if (first.toolName === 'apply_leave') {
                finalResponse = `Success! **${first.data.message}**\n` +
                    `• Leave Reference: \`${first.data.requestId}\`\n` +
                    `• Date Span: ${first.data.startDate} to ${first.data.endDate}\n` +
                    `• Remaining Balance: ${first.data.remainingBalance} days`;
            }
            else if (first.toolName === 'cancel_leave') {
                finalResponse = `Successfully cancelled leave request \`${first.data.requestId}\`. Restored ${first.data.restoredDays} days of ${first.data.restoredType} leave back to your balance.`;
            }
            else if (first.toolName === 'reset_vpn_password') {
                finalResponse = `Your VPN password reset request has been processed successfully. \n` +
                    `• Username: \`${first.data.username}\`\n` +
                    `• Temporary Password: \`${first.data.temporaryPassword}\`\n` +
                    `*Note: This credentials will expire in ${first.data.expiryMinutes} minutes. Please update your password immediately upon login.*`;
            }
            else if (first.toolName === 'wifi_guest_access') {
                finalResponse = `Guest Wi-Fi generated for **${first.data.guestName}**:\n` +
                    `• SSID: \`${first.data.ssid}\`\n` +
                    `• Passcode: \`${first.data.passcode}\`\n` +
                    `• Expiry: ${first.data.expiry}`;
            }
            else if (first.toolName === 'download_payslip') {
                finalResponse = `I've prepared your payslip for **${first.data.period}**.\n` +
                    `• File Name: \`${first.data.fileName}\`\n` +
                    `• Net Salary payout: **$${first.data.salaryDetails.netSalary.toLocaleString()}**\n` +
                    `You can [Download PDF Link](${first.data.downloadUrl}) directly.`;
            }
            else if (first.toolName === 'create_it_ticket') {
                finalResponse = `I have submitted an IT ticket for your issue:\n` +
                    `• Ticket ID: \`${first.data.ticketId}\`\n` +
                    `• Category: ${first.data.category}\n` +
                    `• Status: **${first.data.status}**\n` +
                    `• SLA Target: ${first.data.slaTargetTime}`;
            }
            else if (first.toolName === 'get_ticket_status') {
                finalResponse = `Here is the status of ticket \`${first.data.ticketId}\`:\n` +
                    `• Current State: **${first.data.status}**\n` +
                    `• Priority: ${first.data.priority}\n` +
                    `• Assigned Engineer: ${first.data.assignedEngineer}\n` +
                    `• Latest update: "${first.data.history[first.data.history.length - 1].comment}"`;
            }
            else if (first.toolName === 'submit_reimbursement') {
                finalResponse = `Your reimbursement request of **$${first.data.claimAmount}** for ${first.data.category} has been submitted.\n` +
                    `• Reference ID: \`${first.data.claimId}\`\n` +
                    `• Status: **${first.data.status}**`;
            }
            else if (first.toolName === 'schedule_meeting') {
                // Check if multi-tool invitation was also executed
                const inviteTool = successOutputs.find(o => o.toolName === 'send_meeting_invitation');
                if (inviteTool) {
                    finalResponse = `Calendar booking complete!\n` +
                        `• Meeting Room: **${first.data.title}**\n` +
                        `• Slot: ${first.data.date} | ${first.data.timeRange}\n` +
                        `• Invite Link: ${first.data.inviteLink}\n` +
                        `• Invitations Sent: Sent calendar invites to **${inviteTool.data.invitesSent}** participants (${inviteTool.data.recipientsDelivered.join(', ')}).`;
                }
                else {
                    finalResponse = `I've booked your meeting:\n` +
                        `• Title: "${first.data.title}"\n` +
                        `• Date/Time: ${first.data.date} at ${first.data.timeRange}\n` +
                        `• Access Link: [Link](${first.data.inviteLink})`;
                }
            }
            else if (first.toolName === 'book_conference_room') {
                finalResponse = `Room reserved successfully!\n` +
                    `• Venue: **${first.data.roomConfirmed}**\n` +
                    `• Slot: ${first.data.date} from ${first.data.timeSlot}\n` +
                    `• Reservation Code: \`${first.data.bookingId}\` (Includes: ${first.data.features})`;
            }
            else {
                // Generic fallback synthesis
                const detailsStr = Object.entries(first.data)
                    .filter(([key]) => key !== 'message' && typeof first.data[key] !== 'object')
                    .map(([key, val]) => `• ${key}: **${val}**`)
                    .join('\n');
                finalResponse = `I have successfully completed your request using the **${first.title}**.\n` +
                    (first.data.message ? `*${first.data.message}*\n` : '') +
                    detailsStr;
            }
        }
        else {
            finalResponse = "I analyzed your request, but was unable to identify or execute the correct actions.";
        }
        addTrace('Transaction Concluded', 'API Gateway', `Returning final synthesized response to client.`);
        const durationMs = Date.now() - startTime;
        const isSuccess = failedOutputs.length === 0;
        // Log the audit record
        const logEntry = {
            id: 'LOG-' + Math.floor(Math.random() * 900000 + 100000),
            timestamp: new Date().toISOString(),
            query,
            role,
            userName,
            routerType: methodUsed,
            department: routingResult.department,
            confidence: routingResult.confidence,
            durationMs,
            success: isSuccess,
            toolCallsCount: successOutputs.length,
            traceSteps
        };
        auditLogs.unshift(logEntry);
        res.json({
            responseText: finalResponse,
            toolOutputs,
            logs: traceSteps,
            success: isSuccess,
            metrics: {
                durationMs,
                toolCallsCount: successOutputs.length,
                confidence: routingResult.confidence,
                routerUsed: methodUsed
            }
        });
    }
    catch (error) {
        const durationMs = Date.now() - startTime;
        addTrace('Express Server Critical Error', 'Server Process', `Error: ${error.message}`, 'error');
        // Log failed transaction
        const logEntry = {
            id: 'LOG-' + Math.floor(Math.random() * 900000 + 100000),
            timestamp: new Date().toISOString(),
            query,
            role,
            userName,
            routerType: methodUsed,
            department: 'N/A',
            confidence: 0,
            durationMs,
            success: false,
            toolCallsCount: 0,
            traceSteps
        };
        auditLogs.unshift(logEntry);
        res.status(500).json({
            responseText: `An internal server error occurred while processing your request: ${error.message}`,
            toolOutputs: [],
            logs: traceSteps,
            success: false,
            metrics: {
                durationMs,
                toolCallsCount: 0,
                confidence: 0,
                routerUsed: methodUsed
            }
        });
    }
});
// Fallback all non-API GET requests to frontend's index.html
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
        return next();
    }
    res.sendFile(path.join(frontendDistPath, 'index.html'));
});
app.listen(PORT, () => {
    console.log(`IEA Enterprise Gateway running on http://localhost:${PORT}`);
});
