import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { toolsRegistry } from './registry.js';
import { RouterOutput } from './router.js';
import { TSIntelligentRouter } from './intelligent-router.js';

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

// Load dynamic testkit catalog as the enterprise catalog source of truth
const catalogPath = path.resolve(__dirname, '../../router-testkit/catalog/tools_catalog.json');
let testkitCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

// Helper to look up tool metadata in catalog
function getToolFromCatalog(idOrName: string) {
  return testkitCatalog.tools.find((t: any) => t.id === idOrName || t.name === idOrName);
}

// Helper to execute mock response based on returns metadata
function executeMockTool(tool: any, params: any) {
  const response: any = {};
  if (tool.returns && Array.isArray(tool.returns.fields)) {
    for (const field of tool.returns.fields) {
      if (field.includes('revenue') || field.includes('earnings') || field.includes('profit') || field.includes('tax') || field.includes('liability')) {
        response[field] = `$${(Math.floor(Math.random() * 500000) + 100000).toLocaleString('en-US')}`;
      } else if (field.includes('id') || field.includes('key') || field.includes('ts')) {
        response[field] = `${tool.cluster.substring(0, 3).toUpperCase()}-${Math.floor(Math.random() * 90000) + 10000}`;
      } else if (field.includes('status') || field.includes('verdict')) {
        response[field] = 'SUCCESS';
      } else if (field.includes('email') || field.includes('recipient') || field.includes('to')) {
        response[field] = params.email || params.to || params.cfo || 'finance@corp.com';
      } else if (field.includes('list') || field.includes('history') || field.includes('deployments') || field.includes('slots') || field.includes('fields')) {
        response[field] = [
          { id: '1', name: 'Record A', status: 'verified', timestamp: new Date().toISOString() },
          { id: '2', name: 'Record B', status: 'active', timestamp: new Date().toISOString() }
        ];
      } else {
        response[field] = `mock_val_${field}`;
      }
    }
  } else {
    response['status'] = 'SUCCESS';
    response['timestamp'] = new Date().toISOString();
  }
  return response;
}

// Assign virtual role permissions based on tool cluster for RBAC simulation
function getToolRequiredPermissions(tool: any): string[] {
  const cluster = tool.cluster ? tool.cluster.toLowerCase() : '';
  const name = tool.name ? tool.name.toLowerCase() : '';
  
  if (cluster === 'finance') {
    return ['Finance', 'CFO', 'Administrator'];
  } else if (cluster === 'hr' && (name.includes('ssn') || name.includes('record') || name.includes('employee'))) {
    return ['HR', 'Administrator'];
  } else if (cluster === 'it_devops' && (name.includes('deploy') || name.includes('restart') || name.includes('rollback'))) {
    return ['IT_Admin', 'Administrator'];
  }
  // Open tools accessible to all roles including default Employee and Manager
  return ['Employee', 'Manager', 'Finance', 'CFO', 'HR', 'IT_Admin', 'Administrator'];
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve static assets from frontend build directory
const frontendDistPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDistPath));

// ================= IN-MEMORY DATABASE =================
interface UserData {
  userId: string;
  name: string;
  role: string;
  phone: string;
  address: string;
  leaves: {
    casual: number;
    sick: number;
    annual: number;
    pendingApproval: number;
  };
  leaveRequests: {
    requestId: string;
    startDate: string;
    endDate: string;
    leaveType: string;
    reason: string;
    days: number;
    status: string;
  }[];
}

const mockDatabase: { [userId: string]: UserData } = {
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
  },
  'USR-006': {
    userId: 'USR-006',
    name: 'Robert Vance',
    role: 'CFO',
    phone: '+1 (555) 015-4422',
    address: '100 Financial Way, San Francisco, CA 94111',
    leaves: { casual: 10, sick: 10, annual: 30, pendingApproval: 0 },
    leaveRequests: []
  },
  'USR-007': {
    userId: 'USR-007',
    name: 'Alice Smith',
    role: 'Administrator',
    phone: '+1 (555) 016-5533',
    address: '1 Enterprise Way, San Jose, CA 95113',
    leaves: { casual: 15, sick: 15, annual: 25, pendingApproval: 0 },
    leaveRequests: []
  }
};

const dbHelper = {
  getUserData: (userId: string): UserData => {
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

// ================= AUDIT LOG STORAGE =================
interface AuditLog {
  id: string;
  timestamp: string;
  query: string;
  role: string;
  userName: string;
  routerType: 'Local' | 'Claude';
  department: string;
  confidence: number;
  durationMs: number;
  success: boolean;
  toolCallsCount: number;
  traceSteps: {
    time: string;
    action: string;
    target: string;
    details: string;
    status: 'success' | 'warning' | 'error' | 'info';
  }[];
}

const auditLogs: AuditLog[] = [];

// Helper to sleep for artificial network delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ================= API ENDPOINTS =================

// 1. Get Tool Catalog Registry
// 1. Get Tool Catalog Registry
app.get('/api/tools', (req, res) => {
  res.json(testkitCatalog.tools || []);
});

// 2. Get Audit & System Logs
app.get('/api/logs', (req, res) => {
  res.json(auditLogs);
});

// 3. Process Natural Language Query (Chat Engine)
app.post('/api/chat', async (req, res) => {
  const startTime = Date.now();
  const { 
    query, 
    role = 'Employee', 
    userId = 'USR-001', 
    history = [], 
    apiKey = '', 
    routerType = 'Local',
    simulatedLatency = 800, // default 800ms
    toolOptimization = true, // default enabled
    claudeModel = 'claude-3-5-sonnet-latest'
  } = req.body;

  const traceSteps: AuditLog['traceSteps'] = [];
  const addTrace = (action: string, target: string, details: string, status: AuditLog['traceSteps'][0]['status'] = 'info') => {
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
  user.role = role; 

  addTrace('Received Request', 'API Gateway', `Query: "${query}" | Role: ${role} | User: ${userName} (${userId})`);

  let routingResult: RouterOutput;
  const methodUsed = (routerType === 'Claude' && apiKey) ? 'Claude' : 'Local';

  try {
    addTrace('Route Intent Detection', `${methodUsed} Router`, `Analyzing user query with ${methodUsed} semantic parser...`);
    
    // Simulate thinking latency
    const thinkingLatency = Math.min(2000, Math.max(100, simulatedLatency * 0.4));
    await sleep(thinkingLatency);

    const router = new TSIntelligentRouter(testkitCatalog);
    const unifiedResult = router.route(query);

    // Stream decision engine thought process steps
    if (unifiedResult.traceLogs) {
      for (const log of unifiedResult.traceLogs) {
        addTrace('Decision Pipeline', 'Router Engine', log);
      }
    }

    routingResult = {
      department: unifiedResult.department,
      confidence: unifiedResult.confidence,
      needsClarification: unifiedResult.needsClarification,
      clarificationPrompt: unifiedResult.clarificationPrompt,
      toolCalls: unifiedResult.toolCalls
    };
    (routingResult as any).selected_tools = unifiedResult.selected_tools;
    (routingResult as any).plan = unifiedResult.plan;

    // Intercept and bypass optimizations if toolOptimization is disabled
    if (!toolOptimization) {
      addTrace('Optimization Status Check', 'Execution Planner', '⚠️ Tool Optimization is OFF. Initializing brute-force scanning pipeline.', 'warning');
      
      routingResult.needsClarification = false;
      routingResult.confidence = 0.25; 
      
      const unoptimizedCalls: { toolName: string; parameters: any }[] = [];
      const dept = routingResult.department || 'FINANCE';
      
      // Step 1: User verification sweeps
      unoptimizedCalls.push({
        toolName: 'get_user',
        parameters: { user_id: 'U-1002' }
      });
      
      // Step 2 & 3: Scan candidate tools sequentially by department
      if (dept === 'HR' || dept === 'IDENTITY') {
        unoptimizedCalls.push({
          toolName: 'lookup_employee',
          parameters: { query: userName }
        });
        unoptimizedCalls.push({
          toolName: 'get_employee_record',
          parameters: { employee_id: 'E-4471' }
        });
      } else if (dept === 'IT_DEVOPS' || dept === 'CALENDAR') {
        unoptimizedCalls.push({
          toolName: 'create_ticket',
          parameters: { title: 'Service desk issue' }
        });
        unoptimizedCalls.push({
          toolName: 'open_incident',
          parameters: { description: 'Outage detected' }
        });
      } else if (dept === 'FINANCE' || dept === 'DATA_EXPORT') {
        unoptimizedCalls.push({
          toolName: 'fetch_quarterly_earnings',
          parameters: { quarter: 'Q1' }
        });
        unoptimizedCalls.push({
          toolName: 'get_pnl_statement',
          parameters: { period: 'Q1' }
        });
      } else {
        unoptimizedCalls.push({
          toolName: 'search_documents',
          parameters: { search_query: 'SOP' }
        });
      }
      
      // Step 4: Append the original matched tool calls to the end of the chain
      if (routingResult.toolCalls && routingResult.toolCalls.length > 0) {
        unoptimizedCalls.push(...routingResult.toolCalls);
      } else {
        unoptimizedCalls.push({
          toolName: 'get_revenue_report',
          parameters: { period: 'Q1' }
        });
      }
      
      routingResult.toolCalls = unoptimizedCalls;
    }

    addTrace(
      'Router Output Decision', 
      `Intent: ${routingResult.needsClarification ? 'Clarify' : 'Execute'}`, 
      `Department: ${routingResult.department} | Confidence: ${(routingResult.confidence * 100).toFixed(1)}%` +
      (routingResult.needsClarification ? ` | Clarification Prompt: "${routingResult.clarificationPrompt}"` : ` | Tools Matched: ${routingResult.toolCalls.map(t => t.toolName).join(', ')}`),
      routingResult.needsClarification ? 'warning' : 'success'
    );

    // Case A: Router requests clarification
    if (routingResult.needsClarification) {
      const durationMs = Date.now() - startTime;
      const logEntry: AuditLog = {
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
        },
        selected_tools: [],
        plan: [],
        clarify: true,
        clarify_question: routingResult.clarificationPrompt
      });
    }

    // Case B: Router selected tools to execute
    const toolOutputs: any[] = [];
    let stopPlanning = false;
    let lastToolResult: any = null;

    for (let i = 0; i < routingResult.toolCalls.length; i++) {
      if (stopPlanning) break;

      const call = routingResult.toolCalls[i];
      
      addTrace('Tool Security Verification', `RBAC validation: ${call.toolName}`, `Checking required permissions...`);
      
      const tool = getToolFromCatalog(call.toolName);
      if (!tool) {
        addTrace('Registry Resolution Failure', call.toolName, `Tool not found in catalog registry.`, 'error');
        toolOutputs.push({ toolName: call.toolName, error: 'Tool not found in catalog registry.' });
        stopPlanning = true;
        continue;
      }

      // Check Role Permissions (RBAC)
      const requiredPermissions = getToolRequiredPermissions(tool);
      const isAuthorized = requiredPermissions.includes(role);
      if (!isAuthorized) {
        addTrace(
          'Security Access Denied', 
          `RBAC Enforcer`, 
          `Role "${role}" is unauthorized to run "${tool.name}". Requires: ${requiredPermissions.join(', ')}`, 
          'error'
        );
        toolOutputs.push({ 
          toolName: call.toolName, 
          error: `Access Denied: Role "${role}" lacks permissions to use this tool (${tool.name}).` 
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
        const result = executeMockTool(tool, call.parameters);
        lastToolResult = result;
        toolOutputs.push({
          toolName: call.toolName,
          title: tool.name,
          status: 'success',
          data: result
        });

        addTrace(
          'Executed Tool Successfully', 
          call.toolName, 
          `API Status 200 OK | Response: ${JSON.stringify(result)}`, 
          'success'
        );
      } catch (execError: any) {
        addTrace('Tool Execution Failed', call.toolName, `Exception: ${execError.message}`, 'error');
        toolOutputs.push({
          toolName: call.toolName,
          title: tool.name,
          status: 'failed',
          error: execError.message
        });
        stopPlanning = true;
      }
    }

    // 6. Response Synthesis
    addTrace('Synthesizing Response', 'Response Generator', 'Formulating conversational response...');
    
    let finalResponse = '';
    const successOutputs = toolOutputs.filter(o => o.status === 'success');
    const failedOutputs = toolOutputs.filter(o => o.error);

    if (failedOutputs.length > 0) {
      finalResponse = `I encountered an issue executing your request: ${failedOutputs[0].error}`;
    } else if (successOutputs.length > 0) {
      const first = successOutputs[0];
      const detailsStr = Object.entries(first.data)
        .filter(([key]) => typeof first.data[key] !== 'object')
        .map(([key, val]) => `• ${key}: **${val}**`)
        .join('\n');
      
      finalResponse = `I have successfully completed your request using **${first.toolName}**:\n` + detailsStr;
    } else {
      finalResponse = "I analyzed your request, but was unable to identify or execute the correct actions.";
    }

    addTrace('Transaction Concluded', 'API Gateway', `Returning final synthesized response to client.`);

    const durationMs = Date.now() - startTime;
    const isSuccess = failedOutputs.length === 0;

    // Log the audit record
    const logEntry: AuditLog = {
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
      },
      selected_tools: (routingResult as any).selected_tools || [],
      plan: (routingResult as any).plan || [],
      clarify: false,
      clarify_question: null
    });

  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    addTrace('Express Server Critical Error', 'Server Process', `Error: ${error.message}`, 'error');
    
    const logEntry: AuditLog = {
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

// 4. Exec Scored Benchmark Harness (Child Process)
app.get('/api/benchmark', (req, res) => {
  const pythonCmd = 'python3 router-testkit/harness/run_benchmark.py';
  // Cwd relative to server directory (running from root directory workspace)
  const rootDir = path.resolve(__dirname, '../../');
  
  exec(pythonCmd, { cwd: rootDir }, (error, stdout, stderr) => {
    if (error) {
      console.error('Benchmark error:', stderr);
      return res.status(500).json({ error: 'Failed to run python benchmark harness', details: stderr });
    }
    
    try {
      const output = stdout.toString();
      const lines = output.split('\n');
      const result: any = {
        catalogSize: 0,
        fullCost: 0,
        cases: [],
        categoryScore: {},
        summary: {
          passed: 0,
          total: 0,
          accuracy: "0%",
          avgTokens: 0,
          fullDumpTokens: 0,
          tokenSavings: "0%"
        }
      };

      let section: 'header' | 'cases' | 'categories' | 'summary' = 'header';

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        if (line.includes('Catalog:')) {
          const match = line.match(/Catalog:\s*(\d+)\s*tools\s*\|\s*full-catalog injection\s*~=\s*(\d+)\s*tokens/);
          if (match) {
            result.catalogSize = parseInt(match[1]);
            result.fullCost = parseInt(match[2]);
          }
          continue;
        }

        if (line.startsWith('CASE') && line.includes('CATEGORY')) {
          section = 'cases';
          continue;
        }

        if (line.startsWith('---')) {
          continue;
        }

        if (line.startsWith('By category:')) {
          section = 'categories';
          continue;
        }

        if (line.startsWith('Summary:')) {
          section = 'summary';
          continue;
        }

        if (section === 'cases') {
          const parts = line.split(/\s+/);
          if (parts.length >= 4) {
            result.cases.push({
              id: parts[0],
              category: parts[1],
              result: parts[2],
              tokens: parseInt(parts[3])
            });
          }
          continue;
        }

        if (section === 'categories') {
          const parts = line.split(/\s+/);
          if (parts.length >= 2) {
            result.categoryScore[parts[0]] = parts[1];
          }
          continue;
        }

        if (section === 'summary') {
          if (line.includes('Cases passed')) {
            const match = line.match(/Cases passed\s*:\s*(\d+)\/(\d+)\s*\(([\d%]+)\)/);
            if (match) {
              result.summary.passed = parseInt(match[1]);
              result.summary.total = parseInt(match[2]);
              result.summary.accuracy = match[3];
            }
          } else if (line.includes('Avg tokens')) {
            const match = line.match(/Avg tokens\s*\(routed\)\s*:\s*([\d.]+)/);
            if (match) result.summary.avgTokens = Math.round(parseFloat(match[1]));
          } else if (line.includes('Tokens (full dump)')) {
            const match = line.match(/Tokens\s*\(full dump\)\s*:\s*(\d+)/);
            if (match) result.summary.fullDumpTokens = parseInt(match[1]);
          } else if (line.includes('Token savings')) {
            const match = line.match(/Token savings\s*:\s*([\d%]+)/);
            if (match) result.summary.tokenSavings = match[1];
          }
        }
      }

      // Load and append original test case details
      const casesMap = loadTestCaseDetails();
      for (const c of result.cases) {
        if (casesMap[c.id]) {
          c.query = casesMap[c.id].query;
          c.expected = casesMap[c.id].expected;
          c.rationale = casesMap[c.id].rationale;
        }
      }

      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: 'Failed to parse benchmark stdout', details: e.message, raw: stdout });
    }
  });
});

function loadTestCaseDetails(): Record<string, any> {
  const casesMap: Record<string, any> = {};
  const testCasesDir = path.resolve(__dirname, '../../router-testkit/test_cases');
  try {
    const files = fs.readdirSync(testCasesDir);
    for (const file of files) {
      if (file.startsWith('_') || file === 'catalog_mutations.json' || !file.endsWith('.json')) {
        continue;
      }
      const filePath = path.join(testCasesDir, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (data && Array.isArray(data.cases)) {
        for (const c of data.cases) {
          casesMap[c.id] = c;
        }
      }
    }
  } catch (err) {
    console.error('Failed to load test case details:', err);
  }
  return casesMap;
}

// 5. Schema Intake Guardrail Validation
app.post('/api/guardrail/validate', (req, res) => {
  const { submissionText } = req.body;
  
  let submission: any;
  try {
    submission = typeof submissionText === 'string' ? JSON.parse(submissionText) : submissionText;
  } catch (e) {
    return res.json({
      verdict: 'reject',
      reason: 'MALFORMED_JSON_STRUCTURE',
      note: 'Submission is not valid JSON (unquoted keys, trailing comma, or single quotes).'
    });
  }

  // Validate required fields
  const requiredFields = ["id", "name", "cluster", "description", "parameters", "returns"];
  for (const field of requiredFields) {
    if (!(field in submission)) {
      return res.json({
        verdict: 'reject',
        reason: 'MISSING_REQUIRED_FIELD',
        note: `Missing '${field}' field.`
      });
    }
  }

  // ID Pattern Check
  const idPattern = /^[a-z_]+\.[a-z0-9_]+$/;
  if (!idPattern.test(submission.id)) {
    return res.json({
      verdict: 'reject',
      reason: 'BAD_ID_FORMAT',
      note: "ID contains space or invalid characters. Must be cluster-prefixed (e.g. cluster.tool_name)."
    });
  }

  // Name Pattern Check
  const namePattern = /^[a-z][a-z0-9_]*$/;
  if (!namePattern.test(submission.name)) {
    return res.json({
      verdict: 'reject',
      reason: 'BAD_NAME_FORMAT',
      note: "Name contains space or invalid characters. Must be lowercase snake_case."
    });
  }

  // Description Vague check (min 6 words)
  const words = (submission.description || '').trim().split(/\s+/).filter(Boolean);
  if (words.length < 6) {
    return res.json({
      verdict: 'reject',
      reason: 'DESCRIPTION_TOO_VAGUE',
      note: "Description is under 6 words or semantically empty."
    });
  }

  // Description length (max 500)
  if ((submission.description || '').length > 500) {
    return res.json({
      verdict: 'reject',
      reason: 'DESCRIPTION_TOO_LONG',
      note: "Description exceeds maximum length of 500 characters."
    });
  }

  // Max Parameters check (max 12)
  if (!Array.isArray(submission.parameters) || submission.parameters.length > 12) {
    return res.json({
      verdict: 'reject',
      reason: 'TOO_MANY_PARAMETERS',
      note: "Parameters exceed maximum allowance of 12."
    });
  }

  // Parameter types check
  const allowedTypes = ["string", "number", "integer", "boolean", "array", "object"];
  for (const param of submission.parameters) {
    if (!param.type || !allowedTypes.includes(param.type)) {
      return res.json({
        verdict: 'reject',
        reason: 'INVALID_PARAM_TYPE',
        note: `'${param.type}' is not an allowed parameter type (use string, number, integer, boolean, array, object).`
      });
    }
  }

  // Version Semver Check
  const versionPattern = /^\d+\.\d+\.\d+$/;
  if (submission.version && !versionPattern.test(submission.version)) {
    return res.json({
      verdict: 'reject',
      reason: 'BAD_VERSION_FORMAT',
      note: `version '${submission.version}' is not semver x.y.z.`
    });
  }

  // Duplicate ID Check
  const activeIds = (testkitCatalog.tools || []).map((t: any) => t.id);
  if (activeIds.includes(submission.id)) {
    return res.json({
      verdict: 'reject',
      reason: 'DUPLICATE_ID',
      note: `ID '${submission.id}' already exists in the live catalog.`
    });
  }

  // Dangling Replaced By Check
  if (submission.deprecated && submission.replaced_by) {
    if (!activeIds.includes(submission.replaced_by)) {
      return res.json({
        verdict: 'reject',
        reason: 'DANGLING_REPLACED_BY',
        note: `replaced_by points to a tool id '${submission.replaced_by}' that does not exist in the catalog.`
      });
    }
  }

  return res.json({
    verdict: 'accept',
    note: "Schema validated successfully and accepted into the registry."
  });
});

const MUTATION_CANDIDATE_TOOLS = [
  {
    id: "fin.get_cashflow_statement",
    name: "get_cashflow_statement",
    cluster: "finance",
    description: "Retrieve and fetch the cash flow statement for a given fiscal period, including operating, investing, and financing activities.",
    version: "1.0.0",
    deprecated: false,
    requiredPermissions: ["Manager"],
    side_effects: "read",
    parameters: [
      { name: "period", type: "string", required: true, description: "Fiscal period (e.g. Q1, FY2026)" }
    ],
    returns: { type: "object", fields: ["operating_cashflow", "investing_cashflow", "financing_cashflow"] }
  },
  {
    id: "it.scale_kubernetes_cluster",
    name: "scale_kubernetes_cluster",
    cluster: "it_devops",
    description: "Scale kubernetes pods and node count for application clusters to manage workload demand.",
    version: "1.0.0",
    deprecated: false,
    requiredPermissions: ["IT_Admin"],
    side_effects: "write",
    parameters: [
      { name: "replica_count", type: "integer", required: true, description: "Number of replicas to target" }
    ],
    returns: { type: "object", fields: ["status", "current_replicas"] }
  },
  {
    id: "mkt.track_campaign_roi",
    name: "track_campaign_roi",
    cluster: "marketing",
    description: "Track and analyze return on investment (ROI) metrics for marketing campaigns based on budget and conversion logs.",
    version: "1.0.0",
    deprecated: false,
    requiredPermissions: ["Employee"],
    side_effects: "read",
    parameters: [
      { name: "campaign_id", type: "string", required: true, description: "Unique identifier of the marketing campaign" }
    ],
    returns: { type: "object", fields: ["roi_percentage", "net_revenue", "cost"] }
  },
  {
    id: "hr.check_benefits_eligibility",
    name: "check_benefits_eligibility",
    cluster: "hr",
    description: "Check employee eligibility status for company health, dental, and retirement benefits packages.",
    version: "1.0.0",
    deprecated: false,
    requiredPermissions: ["Employee"],
    side_effects: "read",
    parameters: [
      { name: "employee_id", type: "string", required: true, description: "Employee ID to look up" }
    ],
    returns: { type: "object", fields: ["eligible", "benefits_tier"] }
  },
  {
    id: "legal.generate_nda",
    name: "generate_nda",
    cluster: "legal",
    description: "Generate a standard non-disclosure agreement document template for employee or partner onboarding.",
    version: "1.0.0",
    deprecated: false,
    requiredPermissions: ["Manager"],
    side_effects: "write",
    parameters: [
      { name: "signee_name", type: "string", required: true, description: "Name of the signee" }
    ],
    returns: { type: "object", fields: ["document_id", "status"] }
  }
];

// Real-time Catalog Mutations
app.post('/api/mutations/add', (req, res) => {
  const { toolId, toolObj } = req.body;
  const targetTool = toolObj || MUTATION_CANDIDATE_TOOLS.find(t => t.id === toolId);
  if (!targetTool) {
    return res.status(404).json({ error: 'Tool candidate definition not found' });
  }
  
  if (testkitCatalog.tools.some((t: any) => t.id === toolId)) {
    return res.json({ success: true, message: 'Tool already in catalog', tools: testkitCatalog.tools });
  }

  testkitCatalog.tools.push(targetTool);
  res.json({ success: true, message: `Successfully added ${toolId} to catalog`, tools: testkitCatalog.tools });
});

app.post('/api/mutations/remove', (req, res) => {
  const { toolId } = req.body;
  testkitCatalog.tools = testkitCatalog.tools.filter((t: any) => t.id !== toolId);
  res.json({ success: true, message: `Successfully removed ${toolId} from catalog`, tools: testkitCatalog.tools });
});

app.post('/api/mutations/reset', (req, res) => {
  try {
    const catalogPath = path.resolve(__dirname, '../../router-testkit/harness/catalog.json');
    testkitCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    res.json({ success: true, message: 'Catalog reset to default', tools: testkitCatalog.tools });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset catalog' });
  }
});

app.post('/api/mutations/toggle-deprecation', (req, res) => {
  const { toolId, deprecated, replacedBy } = req.body;
  const tool = testkitCatalog.tools.find((t: any) => t.id === toolId);
  if (tool) {
    tool.deprecated = deprecated;
    tool.replaced_by = replacedBy || null;
    res.json({ success: true, message: `Successfully updated ${toolId}`, tools: testkitCatalog.tools });
  } else {
    res.status(404).json({ error: 'Tool not found' });
  }
});

app.post('/api/mutations/inject-synthetic', (req, res) => {
  const { count } = req.body;
  testkitCatalog.tools = testkitCatalog.tools.filter((t: any) => !t.id.startsWith('syn.'));
  
  if (count > 0) {
    for (let i = 1; i <= count; i++) {
      testkitCatalog.tools.push({
        id: `syn.tool_${i}`,
        name: `synthetic_tool_${i}`,
        cluster: testkitCatalog.clusters[i % testkitCatalog.clusters.length] || 'general',
        description: `Synthetic tool number ${i} for scale load testing.`,
        version: "1.0.0",
        deprecated: false,
        parameters: [],
        returns: { type: "object", fields: ["status"] }
      });
    }
  }
  res.json({ success: true, message: `Successfully injected ${count} synthetic tools`, tools: testkitCatalog.tools });
});

// 6. Catalog Mutations Simulation Sandbox
app.post('/api/mutations/simulate', (req, res) => {
  const { scenarioId } = req.body;
  
  const mutationsPath = path.resolve(__dirname, '../../router-testkit/test_cases/catalog_mutations.json');
  const mutationsFile = JSON.parse(fs.readFileSync(mutationsPath, 'utf8'));
  const scenario = mutationsFile.scenarios.find((s: any) => s.id === scenarioId);
  
  if (!scenario) {
    return res.status(404).json({ error: 'Scenario not found' });
  }

  const clonedCatalog = JSON.parse(JSON.stringify(testkitCatalog));
  const delta = scenario.delta || {};
  let logs: string[] = [`Starting simulation for ${scenarioId} (${scenario.type})` ];
  
  if (delta.add) {
    for (const t of delta.add) {
      clonedCatalog.tools.push(t);
      logs.push(`Added tool to catalog: ${t.id} (${t.name})`);
    }
  }
  
  if (delta.remove) {
    for (const rid of delta.remove) {
      clonedCatalog.tools = clonedCatalog.tools.filter((t: any) => t.id !== rid);
      logs.push(`Removed tool from catalog: ${rid}`);
    }
  }
  
  if (delta.add_synthetic) {
    const count = delta.add_synthetic.count || 40;
    logs.push(`Scaling catalog stress: adding ${count} synthetic tools...`);
    for (let i = 1; i <= count; i++) {
      const synId = `syn.tool_${i}`;
      clonedCatalog.tools.push({
        id: synId,
        name: `synthetic_tool_${i}`,
        cluster: clonedCatalog.clusters[i % clonedCatalog.clusters.length],
        description: `Synthetic placeholder tool number ${i} for scale stress testing.`,
        version: "1.0.0",
        deprecated: false,
        parameters: [],
        returns: { type: "object", fields: ["status"] }
      });
    }
    logs.push(`Scaled catalog: tool count is now ${clonedCatalog.tools.length}`);
  }

  const router = new TSIntelligentRouter(clonedCatalog);
  const probeResults: any[] = [];
  let passed = true;

  if (scenario.probe_query) {
    const probeQuery = scenario.probe_query;
    logs.push(`Executing probe query: "${probeQuery}"`);
    const routeRes = router.route(probeQuery);
    
    const expectedIds = scenario.expected_after.tools_required || [];
    const actualIds = routeRes.selected_tools || [];
    
    let queryPass = true;
    for (const expId of expectedIds) {
      if (!actualIds.includes(expId)) queryPass = false;
    }
    
    if (scenario.expected_after.behavior === 'graceful_degradation') {
      if (actualIds.includes('bi.create_visualization') || routeRes.clarify) {
        queryPass = true;
      } else {
        queryPass = false;
      }
    }
    
    if (queryPass) {
      logs.push(`✅ Probe Query PASSED invariant. Routed to: ${JSON.stringify(actualIds)}`);
    } else {
      logs.push(`❌ Probe Query FAILED invariant. Routed to: ${JSON.stringify(actualIds)}. Expected: ${JSON.stringify(expectedIds)}`);
      passed = false;
    }
    
    probeResults.push({
      query: probeQuery,
      actual: actualIds,
      expected: expectedIds,
      passed: queryPass
    });
  }

  if (scenario.probes) {
    for (const p of scenario.probes) {
      logs.push(`Executing version probe query: "${p.query}"`);
      const routeRes = router.route(p.query);
      const expectedIds = p.expected_tools || [];
      const actualIds = routeRes.selected_tools || [];
      
      const queryPass = expectedIds.every((id: string) => actualIds.includes(id)) && actualIds.length === expectedIds.length;
      
      if (queryPass) {
        logs.push(`✅ Version Probe PASSED. Routed to: ${JSON.stringify(actualIds)}`);
      } else {
        logs.push(`❌ Version Probe FAILED. Routed to: ${JSON.stringify(actualIds)}. Expected: ${JSON.stringify(expectedIds)}`);
        passed = false;
      }
      
      probeResults.push({
        query: p.query,
        actual: actualIds,
        expected: expectedIds,
        passed: queryPass
      });
    }
  }

  res.json({
    scenarioId,
    passed,
    logs,
    probeResults
  });
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
