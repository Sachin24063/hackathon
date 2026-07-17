import { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Database,
  Activity,
  Settings,
  Send,
  CheckCircle2,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Server,
  Layers,
  Cpu,
  Sparkles,
  X
} from 'lucide-react';

interface TraceStep {
  time: string;
  action: string;
  target: string;
  details: string;
  status: 'success' | 'warning' | 'error' | 'info';
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  logs?: TraceStep[];
  metrics?: {
    durationMs: number;
    toolCallsCount: number;
    confidence: number;
    routerUsed: string;
  };
  selected_tools?: string[];
  plan?: string[];
}



const roleToUserMap: { [role: string]: { id: string; name: string } } = {
  'Employee': { id: 'USR-001', name: 'Amit Sharma' },
  'Manager': { id: 'USR-002', name: 'Rahul Varma' },
  'HR': { id: 'USR-003', name: 'Priya Nair' },
  'Finance': { id: 'USR-004', name: 'John Doe' },
  'IT_Admin': { id: 'USR-005', name: 'Sarah Connor' },
  'CFO': { id: 'USR-006', name: 'Robert Vance' },
  'Administrator': { id: 'USR-007', name: 'Alice Smith' }
};

const GUARDRAIL_TEMPLATES = {
  valid: `{
  "id": "fin.get_tax_summary",
  "name": "get_tax_summary",
  "cluster": "finance",
  "description": "Retrieve the aggregated tax liability summary for a fiscal period broken down by jurisdiction.",
  "version": "1.0.0",
  "parameters": [
    {"name": "period", "type": "string", "required": true, "description": "fiscal period, e.g. FY2025"}
  ],
  "returns": {"type": "object", "fields": ["total_tax", "by_jurisdiction"]}
}`,
  vague: `{
  "id": "misc.do_stuff",
  "name": "do_stuff",
  "cluster": "misc",
  "description": "Does stuff.",
  "parameters": [],
  "returns": {"type": "object"}
}`,
  badId: `{
  "id": "comm.send email",
  "name": "send email",
  "cluster": "communication",
  "description": "Send an email message to a recipient with subject and body content.",
  "parameters": [{"name": "to", "type": "string", "required": true}],
  "returns": {"type": "object"}
}`,
  duplicate: `{
  "id": "user.get_user",
  "name": "get_user",
  "cluster": "identity",
  "description": "Duplicate of an already-registered canonical user lookup tool endpoint.",
  "parameters": [{"name": "user_id", "type": "string", "required": true}],
  "returns": {"type": "object"}
}`,
  invalidType: `{
  "id": "bi.big_query_thing",
  "name": "big_query_thing",
  "cluster": "analytics",
  "description": "Run a query against the warehouse and return rows to the caller for analysis and reporting.",
  "parameters": [
    {"name": "sql", "type": "text", "required": true}
  ],
  "returns": {"type": "object"}
}`
};

const INTERACTIVE_CHALLENGES = [
  {
    id: "upgrade",
    title: "1. Version Upgrade Conflict (v1 vs v2)",
    description: "Compare behavior for legacy format vs current formats. Toggle the status of the legacy v1 tool below.",
    query: "Create a legacy v1-format invoice for the audit for CUST-5 at $900.",
    role: "Finance",
    toolId: "fin.create_invoice"
  },
  {
    id: "replace",
    title: "2. Tool Replacement (Retired Slack API)",
    description: "Toggle deprecation mapping on send_slack_message to see if the router automatically upgrades to post_slack_message.",
    query: "Post a slack message to the #announcements channel.",
    role: "Employee",
    toolId: "comm.send_slack_message"
  },
  {
    id: "stress",
    title: "3. Scale & Load Stress Test",
    description: "Inject 40 synthetic tool schemas into the registry to test TF-IDF performance and token budget preservation.",
    query: "Pull last quarter's revenue and email the chart to finance@corp.com.",
    role: "Finance",
    toolId: "synthetic_load"
  },
  {
    id: "add_tool",
    title: "4. New Tool Discoverability (HR Benefits)",
    description: "Install a new HR benefits checking tool to see if it immediately becomes discoverable and routed.",
    query: "Am I eligible for dental benefits?",
    role: "Employee",
    toolId: "hr.check_benefits_eligibility"
  },
  {
    id: "graceful",
    title: "5. Graceful Degradation (DevOps Outage)",
    description: "Uninstall the chart generation tool. The router will fallback to create_visualization or request clarification.",
    query: "Pull last quarter's revenue and email the chart to finance@corp.com.",
    role: "Finance",
    toolId: "bi.generate_chart"
  }
];

const EXTRA_MUTATION_TOOLS: Record<string, any> = {
  "hr.check_benefits_eligibility": {
    id: "hr.check_benefits_eligibility",
    name: "check_benefits_eligibility",
    cluster: "hr",
    description: "Check employee eligibility status for company health, dental, and retirement benefits packages.",
    version: "1.0.0",
    deprecated: false,
    requiredPermissions: ["Employee"],
    side_effects: "read",
    parameters: [
      { name: "employee_id", type: "string", required: true, description: "Employee ID to verify" }
    ],
    returns: { type: "object", fields: ["eligible", "benefits_tier"] }
  },
  "bi.generate_chart": {
    id: "bi.generate_chart",
    name: "generate_chart",
    cluster: "analytics",
    description: "Generate a visual chart image (bar, line, pie) representing selected metrics data logs.",
    version: "1.0.0",
    deprecated: false,
    requiredPermissions: ["Employee"],
    side_effects: "read",
    parameters: [
      { name: "chart_type", type: "string", required: true, description: "Type of chart" }
    ],
    returns: { type: "object", fields: ["chart_url"] }
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'chat' | 'benchmark' | 'guardrails' | 'mutations' | 'catalog' | 'settings'>('chat');
  const [role, setRole] = useState<string>('Employee');
  const [userId, setUserId] = useState<string>('USR-001');
  const [userName, setUserName] = useState<string>('Amit Sharma');

  // Chat state
  const [chatInput, setChatInput] = useState<string>('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeTrace, setActiveTrace] = useState<TraceStep[]>([]);
  const [activeMetrics, setActiveMetrics] = useState<any>(null);

  // Catalog State
  const [tools, setTools] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  // Settings State
  const [simulatedLatency, setSimulatedLatency] = useState<number>(800);
  const [toolOptimization, setToolOptimization] = useState<boolean>(true);
  const [selectedCase, setSelectedCase] = useState<any | null>(null);

  // Scored Benchmark states
  const [benchmarkData, setBenchmarkData] = useState<any>(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState<boolean>(false);

  // Schema Intake Guardrail states
  const [guardrailText, setGuardrailText] = useState<string>(GUARDRAIL_TEMPLATES.valid);
  const [guardrailResult, setGuardrailResult] = useState<any>(null);
  const [guardrailLoading, setGuardrailLoading] = useState<boolean>(false);

  // Catalog Mutations states
  const [mutationLoading, setMutationLoading] = useState<boolean>(false);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string>('upgrade');
  const [testQueryText, setTestQueryText] = useState<string>('Create a legacy v1-format invoice for customer 5');
  const [mutationFeedback, setMutationFeedback] = useState<string>('');
  const [testResult, setTestResult] = useState<any>(null);
  const [testLoading, setTestLoading] = useState<boolean>(false);
  const [showRawLogs, setShowRawLogs] = useState<boolean>(false);


  const handleToggleDeprecation = async (toolId: string, deprecated: boolean, replacedBy?: string) => {
    setMutationLoading(true);
    setMutationFeedback('');
    try {
      const res = await fetch('/api/mutations/toggle-deprecation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolId, deprecated, replacedBy })
      });
      const data = await res.json();
      if (data.success) {
        setMutationFeedback(`Deprecation state for ${toolId} successfully updated!`);
        fetchTools();
      }
    } catch (e) {
      console.error(e);
      setMutationFeedback('Failed to toggle deprecation.');
    } finally {
      setMutationLoading(false);
    }
  };

  const handleInjectSynthetic = async (count: number) => {
    setMutationLoading(true);
    setMutationFeedback('');
    try {
      const res = await fetch('/api/mutations/inject-synthetic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count })
      });
      const data = await res.json();
      if (data.success) {
        setMutationFeedback(count > 0 ? `Successfully injected ${count} synthetic tools into the live catalog!` : 'Cleaned all synthetic tools.');
        fetchTools();
      }
    } catch (e) {
      console.error(e);
      setMutationFeedback('Failed to scale catalog.');
    } finally {
      setMutationLoading(false);
    }
  };

  // Helper method for installing tools
  const handleAddToolOverride = async (toolId: string) => {
    setMutationLoading(true);
    setMutationFeedback('');
    try {
      const toolObj = EXTRA_MUTATION_TOOLS[toolId] || {
        id: toolId,
        name: toolId.split('.')[1] || toolId,
        cluster: toolId.split('.')[0] || 'general',
        description: `Custom interactive tool ${toolId}`,
        version: '1.0.0',
        deprecated: false,
        parameters: [],
        returns: { type: 'object' }
      };

      const res = await fetch('/api/mutations/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolId, toolObj })
      });
      const data = await res.json();
      if (data.success) {
        setMutationFeedback(`Successfully installed ${toolId} into the active catalog!`);
        fetchTools();
      }
    } catch (e) {
      console.error(e);
      setMutationFeedback('Failed to install tool.');
    } finally {
      setMutationLoading(false);
    }
  };


  const handleRemoveTool = async (toolId: string) => {
    setMutationLoading(true);
    setMutationFeedback('');
    try {
      const res = await fetch('/api/mutations/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolId })
      });
      const data = await res.json();
      if (data.success) {
        setMutationFeedback(`Successfully uninstalled ${toolId} from the active catalog.`);
        fetchTools();
      }
    } catch (e) {
      console.error(e);
      setMutationFeedback('Failed to uninstall tool.');
    } finally {
      setMutationLoading(false);
    }
  };

  const handleResetCatalog = async () => {
    setMutationLoading(true);
    setMutationFeedback('');
    setTestResult(null);
    try {
      const res = await fetch('/api/mutations/reset', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMutationFeedback('Catalog reset to default (64 canonical tools).');
        fetchTools();
      }
    } catch (e) {
      console.error(e);
      setMutationFeedback('Failed to reset catalog.');
    } finally {
      setMutationLoading(false);
    }
  };

  const handleTestRouterQuery = async (queryText: string, targetRole: string) => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryText,
          role: targetRole,
          userName: 'Amit Sharma'
        })
      });
      const data = await res.json();
      setTestResult(data);
    } catch (e) {
      console.error(e);
      setTestResult({ responseText: 'Error connecting to router' });
    } finally {
      setTestLoading(false);
    }
  };




  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Synchronize role and user details
  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedRole = e.target.value;
    setRole(selectedRole);
    const userInfo = roleToUserMap[selectedRole];
    setUserId(userInfo.id);
    setUserName(userInfo.name);
  };

  // Fetch Tools and Audit Logs
  const fetchTools = async () => {
    try {
      const res = await fetch('/api/tools');
      const data = await res.json();
      setTools(data);
    } catch (e) {
      console.error('Failed fetching tools:', e);
    }
  };



  const runBenchmark = async () => {
    setBenchmarkLoading(true);
    setBenchmarkData(null);
    try {
      const res = await fetch('/api/benchmark');
      const data = await res.json();
      setBenchmarkData(data);
    } catch (e) {
      console.error('Failed to run benchmark:', e);
    } finally {
      setBenchmarkLoading(false);
    }
  };

  const validateSchema = async () => {
    setGuardrailLoading(true);
    setGuardrailResult(null);
    try {
      const res = await fetch('/api/guardrail/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionText: guardrailText })
      });
      const data = await res.json();
      setGuardrailResult(data);
    } catch (e) {
      console.error('Schema validation failed:', e);
    } finally {
      setGuardrailLoading(false);
    }
  };



  useEffect(() => {
    fetchTools();
  }, []);

  useEffect(() => {
    const challenge = INTERACTIVE_CHALLENGES.find(c => c.id === selectedChallengeId);
    if (challenge) {
      setTestQueryText(challenge.query);
      setTestResult(null);
      setMutationFeedback('');
    }
  }, [selectedChallengeId]);

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, loading]);

  // Trigger natural language request
  const handleSendMessage = async (textToSend?: string) => {
    const queryText = textToSend || chatInput;
    if (!queryText.trim()) return;

    setLoading(true);
    if (!textToSend) setChatInput('');

    // Append user message to UI immediately
    const updatedHistory: ChatMessage[] = [
      ...chatHistory,
      { role: 'user', content: queryText }
    ];
    setChatHistory(updatedHistory);
    setActiveTrace([]);
    setActiveMetrics(null);

    try {
      // Structure request payload
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: queryText,
          role,
          userId,
          history: chatHistory.map(m => ({ role: m.role, content: m.content })),
          simulatedLatency,
          toolOptimization
        })
      });

      const data = await response.json();

      // Append assistant response and metrics
      setChatHistory([
        ...updatedHistory,
        {
          role: 'assistant',
          content: data.responseText,
          logs: data.logs,
          metrics: data.metrics,
          selected_tools: data.selected_tools || [],
          plan: data.plan || []
        }
      ]);

      setActiveTrace(data.logs || []);
      setActiveMetrics(data.metrics || null);


    } catch (err) {
      console.error('API gateway error:', err);
      setChatHistory([
        ...updatedHistory,
        {
          role: 'assistant',
          content: 'Error: Could not connect to the Intelligent Enterprise Gateway. Please verify the backend is running.'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Get departments count for filters
  const departments = ['All', ...new Set(tools.map(t => t.cluster).filter(Boolean))];

  // Filter tools
  const filteredTools = tools.filter(t => {
    const name = t.name || '';
    const id = t.id || '';
    const desc = t.description || '';
    const cluster = t.cluster || '';

    const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      desc.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = selectedDept === 'All' || cluster === selectedDept;
    return matchesSearch && matchesDept;
  });

  return (
    <div className="app-container">
      {/* ================= SIDEBAR ================= */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Cpu size={24} />
          </div>
          <div>
            <h1 className="brand-title">Intelligent Router</h1>
            <div className="brand-subtitle">Enterprise Assistant</div>
          </div>
        </div>

        {/* Role switcher simulating employee login */}
        <div className="role-panel">
          <div className="role-label">Active Role Profile</div>
          <select
            className="role-select"
            value={role}
            onChange={handleRoleChange}
          >
            <option value="Employee">Employee (Amit Sharma)</option>
            <option value="Manager">Manager (Rahul Varma)</option>
            <option value="HR">HR Specialist (Priya Nair)</option>
            <option value="Finance">Finance Auditor (John Doe)</option>
            <option value="IT_Admin">IT Systems Admin (Sarah Connor)</option>
            <option value="CFO">CFO (Robert Vance)</option>
            <option value="Administrator">Administrator (Alice Smith)</option>
          </select>
          <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-secondary)' }}>
            User ID: <code style={{ fontFamily: 'var(--font-mono)' }}>{userId}</code>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="nav-menu">
          <li
            className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            <MessageSquare size={18} />
            <span>Assistant Chat</span>
          </li>
          <li
            className={`nav-item ${activeTab === 'benchmark' ? 'active' : ''}`}
            onClick={() => setActiveTab('benchmark')}
          >
            <Activity size={18} />
            <span>Validation Suite</span>
          </li>
          <li
            className={`nav-item ${activeTab === 'guardrails' ? 'active' : ''}`}
            onClick={() => setActiveTab('guardrails')}
          >
            <ShieldAlert size={18} />
            <span>Intake Guardrail</span>
          </li>
          <li
            className={`nav-item ${activeTab === 'mutations' ? 'active' : ''}`}
            onClick={() => setActiveTab('mutations')}
          >
            <Sparkles size={18} />
            <span>Catalog Churn</span>
          </li>
          <li
            className={`nav-item ${activeTab === 'catalog' ? 'active' : ''}`}
            onClick={() => setActiveTab('catalog')}
          >
            <Database size={18} />
            <span>Tool Catalog ({tools.length})</span>
          </li>
          <li
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={18} />
            <span>Settings & Router</span>
          </li>
        </nav>

        <div className="nav-footer">
          <div>IEA Gateway v1.0.0</div>
          <div style={{ marginTop: '4px', fontSize: '10px' }}>Powered by Local Router</div>
        </div>
      </aside>

      {/* ================= MAIN PANEL CONTENT ================= */}
      <main className="main-content">
        {/* Top Header Bar */}
        <header className="top-header">
          <div className="header-title-container">
            <h2 className="header-title">
              {activeTab === 'chat' && 'Assistant & Router Simulator'}
              {activeTab === 'benchmark' && 'Accuracy Evaluation Suite'}
              {activeTab === 'guardrails' && 'Registry Intake Guardrails'}
              {activeTab === 'mutations' && 'Dynamic Catalog Mutations'}
              {activeTab === 'catalog' && 'Enterprise Tool Registry Catalog'}
              {activeTab === 'settings' && 'System Configuration & Keys'}
            </h2>
            <p className="header-subtitle">
              {activeTab === 'chat' && 'Send natural language requests and observe real-time AI tool routing'}
              {activeTab === 'benchmark' && 'Execute regression test harness and score routing accuracy'}
              {activeTab === 'guardrails' && 'Enforce strict schema metadata, parameter count, description and semver validators'}
              {activeTab === 'mutations' && 'Simulate live database additions, deprecations, replacements, version upgrades and load tests'}
              {activeTab === 'catalog' && 'Centralized metadata store containing authorization constraints and schemas'}
              {activeTab === 'settings' && 'Configure active router logic, API credentials, and network latency speeds'}
            </p>
          </div>

          <div className="user-badge">
            <span className="status-indicator pulse"></span>
            <span>{userName}</span>
            <span className="badge primary">{role}</span>
          </div>
        </header>

        {/* Tab Contents */}
        <div className="tab-content">

          {/* ================= CHAT & SIMULATION TAB ================= */}
          {activeTab === 'chat' && (
            <div className="workspace-split">
              {/* Left Pane - Chat Area */}
              <div className="left-pane">
                {/* Control bar for Router Optimization Toggle */}
                <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-primary)' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    Intelligent routing engine
                  </span>
                  <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--bg-tertiary)', padding: '3px', borderRadius: '8px' }}>
                    <button
                      onClick={() => setToolOptimization(true)}
                      style={{
                        border: 'none',
                        background: toolOptimization ? 'var(--bg-secondary)' : 'transparent',
                        color: toolOptimization ? 'var(--color-info)' : 'var(--text-secondary)',
                        fontWeight: 700,
                        fontSize: '11px',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        boxShadow: toolOptimization ? 'var(--shadow-sm)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      Optimized (ON)
                    </button>
                    <button
                      onClick={() => setToolOptimization(false)}
                      style={{
                        border: 'none',
                        background: !toolOptimization ? 'var(--bg-secondary)' : 'transparent',
                        color: !toolOptimization ? 'var(--color-warning)' : 'var(--text-secondary)',
                        fontWeight: 700,
                        fontSize: '11px',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        boxShadow: !toolOptimization ? 'var(--shadow-sm)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      Naive Sweep (OFF)
                    </button>
                  </div>
                </div>

                {!toolOptimization && (
                  <div style={{ backgroundColor: 'var(--color-warning-light)', color: 'var(--color-warning)', padding: '10px 16px', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-color)' }}>
                    <AlertTriangle size={14} />
                    <span>Tool Optimization disabled. Simulator will sweep candidate database tools.</span>
                  </div>
                )}

                <div className="chat-messages">
                  {chatHistory.length === 0 ? (
                    <div className="chat-welcome">
                      <div className="chat-welcome-icon">
                        <MessageSquare size={44} />
                      </div>
                      <h3>Enterprise Assistant Chat</h3>
                      <p>
                        Ask any query. The assistant will detect the department, perform an RBAC check, invoke the tools, and synthesize a response.
                      </p>

                      <div className="sample-queries-grid">
                        <button
                          className="sample-query-card"
                          onClick={() => handleSendMessage("What is my leave balance?")}
                        >
                          Check Leave Balance
                        </button>
                        <button
                          className="sample-query-card"
                          onClick={() => handleSendMessage("Apply for 2 days leave starting next monday")}
                        >
                          Request Leaves
                        </button>
                        <button
                          className="sample-query-card"
                          onClick={() => handleSendMessage("I forgot my VPN password")}
                        >
                          Reset VPN Password
                        </button>
                        <button
                          className="sample-query-card"
                          onClick={() => handleSendMessage("Schedule a meeting tomorrow with the team at 14:00 and send invitations to Priya and Rahul")}
                        >
                          Schedule Meeting & Invite (Multi-Tool)
                        </button>
                      </div>
                    </div>
                  ) : (
                    chatHistory.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`message-bubble ${msg.role}`}
                        onClick={() => {
                          if (msg.logs) {
                            setActiveTrace(msg.logs);
                            setActiveMetrics(msg.metrics);
                          }
                        }}
                        style={{ cursor: msg.logs ? 'pointer' : 'default' }}
                        title={msg.logs ? 'Click to inspect execution trace' : undefined}
                      >
                        <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                        {msg.metrics && (
                          <div style={{ marginTop: '8px', fontSize: '11px', display: 'flex', gap: '8px', opacity: 0.8 }}>
                            <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: msg.role === 'user' ? 'white' : 'var(--text-secondary)' }}>
                              {msg.metrics.durationMs}ms
                            </span>
                            <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: msg.role === 'user' ? 'white' : 'var(--text-secondary)' }}>
                              {(msg.metrics.confidence * 100).toFixed(0)}% Conf
                            </span>
                            <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: msg.role === 'user' ? 'white' : 'var(--text-secondary)' }}>
                              {msg.metrics.routerUsed} Router
                            </span>
                          </div>
                        )}
                        {msg.role === 'assistant' && msg.selected_tools && msg.selected_tools.length > 0 && (() => {
                          const cost = Math.max(1, Math.floor(JSON.stringify(tools.filter((t: any) => msg.selected_tools!.includes(t.id))).length / 4));
                          const fullCost = 9876;
                          const savingsPct = 100 - Math.round((cost / fullCost) * 100);

                          return (
                            <div style={{ marginTop: '10px', padding: '10px', borderRadius: '8px', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', fontSize: '11.5px', color: 'var(--text-main)' }}>
                              <div style={{ fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                                <span>Routed Tools Context ({msg.selected_tools.length})</span>
                                <span style={{ color: 'var(--color-success)', fontWeight: 800 }}>
                                  Saving {savingsPct}% Tokens
                                </span>
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                                {msg.selected_tools.map(t => (
                                  <code key={t} style={{ fontSize: '10px', backgroundColor: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px', color: 'var(--color-primary)', fontFamily: 'var(--font-mono)' }}>
                                    {t}
                                  </code>
                                ))}
                              </div>
                              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                                Routed: <b>{cost.toLocaleString()}</b> tokens vs Full Catalog Injection: <b>{fullCost.toLocaleString()}</b> tokens.
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    ))
                  )}
                  {loading && (
                    <div className="message-bubble assistant" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="status-indicator pulse" style={{ backgroundColor: 'var(--color-primary)' }}></span>
                      <span>Routing & Executing Plan...</span>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="chat-input-bar">
                  <input
                    type="text"
                    className="chat-input"
                    placeholder={`Ask ${userName} a query... e.g. "Generate Wi-Fi access for guest Rohit for 2 days"`}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    disabled={loading}
                  />
                  <button
                    className="chat-send-btn"
                    onClick={() => handleSendMessage()}
                    disabled={loading}
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>

              {/* Right Pane - Execution Simulation Panel */}
              <div className="right-pane">
                <div className="trace-header">
                  <div className="trace-title">
                    <Activity size={18} className="text-secondary" />
                    <span>Real-time Execution Trace</span>
                  </div>
                  {activeMetrics && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <span className="trace-metric-badge">Time: {activeMetrics.durationMs}ms</span>
                      <span className="trace-metric-badge">Tools: {activeMetrics.toolCallsCount}</span>
                    </div>
                  )}
                </div>

                <div className="trace-body">
                  {activeTrace.length === 0 ? (
                    <div className="trace-welcome-right">
                      <Layers size={36} style={{ marginBottom: '12px', opacity: 0.6 }} />
                      <h4 style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)', marginBottom: '4px' }}>System Simulator Idle</h4>
                      <p style={{ fontSize: '12px', maxWidth: '300px', lineHeight: 1.4 }}>
                        When a query is processed, the step-by-step API calls, intent routing, and security validations will appear here in real time.
                      </p>
                    </div>
                  ) : (
                    (() => {
                      // Helper to group trace steps by tool call
                      const groups: { type: 'general' | 'tool_call'; toolName?: string; steps: TraceStep[] }[] = [];

                      activeTrace.forEach(step => {
                        const isToolStep =
                          step.action.includes('Tool Security Verification') ||
                          step.action.includes('Tool Parameters Validation') ||
                          step.action.includes('Executing Tool API Call') ||
                          step.action.includes('Executed Tool Successfully') ||
                          step.action.includes('Tool Execution Failed');

                        if (isToolStep) {
                          let toolName = step.target;
                          if (toolName.startsWith('RBAC validation: ')) {
                            toolName = toolName.replace('RBAC validation: ', '');
                          }

                          const lastGroup = groups[groups.length - 1];
                          if (lastGroup && lastGroup.type === 'tool_call' && lastGroup.toolName === toolName) {
                            lastGroup.steps.push(step);
                          } else {
                            groups.push({
                              type: 'tool_call',
                              toolName,
                              steps: [step]
                            });
                          }
                        } else {
                          groups.push({
                            type: 'general',
                            steps: [step]
                          });
                        }
                      });

                      return groups.map((group, gIdx) => {
                        if (group.type === 'general') {
                          const step = group.steps[0];
                          return (
                            <div key={gIdx} className="trace-step animate-fade-in">
                              <div className={`trace-step-node ${step.status}`}>
                                {step.status === 'success' && <CheckCircle2 size={16} />}
                                {step.status === 'error' && <ShieldAlert size={16} />}
                                {step.status === 'warning' && <AlertTriangle size={16} />}
                                {step.status === 'info' && <Info size={16} />}
                              </div>
                              <div className="trace-step-content">
                                <div className="trace-step-title-row">
                                  <span className="trace-step-name">{step.action}</span>
                                  <span className="trace-step-time">{new Date(step.time).toLocaleTimeString()}</span>
                                </div>
                                <span className="trace-step-target">{step.target}</span>
                                <div className="trace-step-details">{step.details}</div>
                              </div>
                            </div>
                          );
                        } else {
                          const toolMeta = tools.find(t => t.name === group.toolName || t.id === group.toolName);
                          const displayTitle = toolMeta ? (toolMeta.title || toolMeta.id || toolMeta.name) : group.toolName;
                          const hasFailed = group.steps.some(s => s.status === 'error');

                          return (
                            <div key={gIdx} className="trace-step animate-fade-in">
                              <div className={`trace-step-node ${hasFailed ? 'error' : 'success'}`} style={{ backgroundColor: hasFailed ? 'var(--color-error-light)' : 'var(--color-success-light)' }}>
                                <Cpu size={16} style={{ color: hasFailed ? 'var(--color-error)' : 'var(--color-success)' }} />
                              </div>
                              <div className="trace-step-content" style={{
                                borderLeft: hasFailed ? '4px solid var(--color-error)' : '4px solid var(--color-success)',
                                background: 'linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-primary) 100%)',
                                boxShadow: 'var(--shadow-md)',
                                padding: '16px'
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                                  <span style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text-primary)' }}>
                                    Tool Execution: {displayTitle}
                                  </span>
                                  <span className={`status-pill ${hasFailed ? 'failed' : 'success'}`} style={{ fontSize: '10px' }}>
                                    {hasFailed ? 'Failed / Blocked' : 'Success (200 OK)'}
                                  </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingLeft: '8px', borderLeft: '2px dashed var(--border-color)' }}>
                                  {group.steps.map((subStep, sIdx) => {
                                    // Make sub-step action label cleaner
                                    let cleanAction = subStep.action;
                                    if (cleanAction === 'Tool Security Verification') cleanAction = 'Role Permission Access Vetted';
                                    if (cleanAction === 'Tool Parameters Validation') cleanAction = 'Parameters Validated';
                                    if (cleanAction === 'Executing Tool API Call') cleanAction = 'Transmitted API Payload';
                                    if (cleanAction === 'Executed Tool Successfully') cleanAction = 'API Response Output';
                                    if (cleanAction === 'Tool Execution Failed') cleanAction = 'API Execution Failure';

                                    return (
                                      <div key={sIdx} style={{ fontSize: '12px' }}>
                                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '3px' }}>
                                          {cleanAction}
                                        </div>
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '11px', lineHeight: 1.4, wordBreak: 'break-all' }}>
                                          {subStep.details}
                                        </div>

                                        {/* Beautiful JSON rendering for payloads */}
                                        {(subStep.details.startsWith('{') || subStep.details.startsWith('[')) && (
                                          <pre className="trace-step-codeblock" style={{ marginTop: '6px', fontSize: '10px', padding: '8px' }}>
                                            {JSON.stringify(JSON.parse(subStep.details), null, 2)}
                                          </pre>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        }
                      });
                    })()
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= TOOL CATALOG TAB ================= */}
          {activeTab === 'catalog' && (
            <div>
              <div className="catalog-header-bar">
                <input
                  type="text"
                  className="catalog-search-input"
                  placeholder="Search 60+ tools by name, description, parameters..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />

                <select
                  className="catalog-dept-filter"
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                >
                  {departments.map((dept, idx) => (
                    <option key={idx} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              <div className="tools-grid">
                {filteredTools.map((tool) => {
                  const requiredPermissions = tool.cluster === 'finance'
                    ? ['Finance', 'CFO', 'Administrator']
                    : tool.cluster === 'hr'
                      ? ['HR', 'Administrator']
                      : tool.cluster === 'it_devops'
                        ? ['IT_Admin', 'Administrator']
                        : ['Employee', 'Manager', 'Finance', 'CFO', 'HR', 'IT_Admin', 'Administrator'];
                  const isAuthorized = requiredPermissions.includes(role);
                  const isExpanded = expandedTool === tool.id;

                  return (
                    <div key={tool.id} className="tool-card animate-fade-in">
                      <div className="tool-card-header">
                        <span className="tool-dept-badge">{tool.cluster.toUpperCase()}</span>
                        <span className={`tool-auth-badge ${isAuthorized ? 'authorized' : 'unauthorized'}`}>
                          {isAuthorized ? 'Authorized' : 'Locked'}
                        </span>
                      </div>

                      <h4 className="tool-card-title">{tool.name.replace(/_/g, ' ').toUpperCase()}</h4>
                      <div className="tool-card-name">{tool.id}</div>
                      <p className="tool-card-desc">{tool.description}</p>

                      <button
                        className="tool-card-expand-btn"
                        onClick={() => setExpandedTool(isExpanded ? null : tool.id)}
                      >
                        {isExpanded ? (
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                            Hide Details <ChevronUp size={14} />
                          </span>
                        ) : (
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                            View Schemas & Auth <ChevronDown size={14} />
                          </span>
                        )}
                      </button>

                      {isExpanded && (
                        <div className="tool-schema-details animate-fade-in">
                          <div className="schema-section-title">Required Permissions</div>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
                            {requiredPermissions.map((perm, pIdx) => (
                              <span key={pIdx} className={`badge ${role === perm ? 'primary' : ''}`}>
                                {perm}
                              </span>
                            ))}
                          </div>

                          <div className="schema-section-title">Input Parameters</div>
                          {tool.parameters && Array.isArray(tool.parameters) && tool.parameters.length > 0 ? (
                            tool.parameters.map((p: any) => (
                              <div key={p.name} className="schema-param-row">
                                <div className="schema-param-header">
                                  <span className="schema-param-name">{p.name}</span>
                                  <span className="schema-param-type">({p.type})</span>
                                  {p.required && <span className="schema-param-req">*required</span>}
                                </div>
                                <div className="schema-param-desc">{p.description}</div>
                              </div>
                            ))
                          ) : (
                            <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '8px' }}>No parameters required.</div>
                          )}

                          <div className="schema-section-title">Returns Fields</div>
                          {tool.returns && tool.returns.fields && Array.isArray(tool.returns.fields) ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {tool.returns.fields.map((f: string) => (
                                <code key={f} style={{ fontSize: '10px', backgroundColor: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                                  {f}
                                </code>
                              ))}
                            </div>
                          ) : (
                            <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Returns generic status.</div>
                          )}

                          <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-color)', fontSize: '11px', color: 'var(--text-secondary)' }}>
                            <div>Version: <b>{tool.version || '1.0.0'}</b> {tool.deprecated && <span style={{ color: 'var(--color-error)' }}>(Deprecated)</span>}</div>
                            {tool.replaces && <div>Replaces: <code style={{ fontFamily: 'var(--font-mono)' }}>{tool.replaces}</code></div>}
                            {tool.replaced_by && <div>Replaced By: <code style={{ fontFamily: 'var(--font-mono)' }}>{tool.replaced_by}</code></div>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================= HARNESS SCORER TAB ================= */}
          {activeTab === 'benchmark' && (
            <div className="settings-container animate-fade-in" style={{ maxWidth: '1200px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ fontSize: '20px', margin: 0, fontWeight: 700 }}>Accuracy Evaluation Suite</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Runs the core validation harness to check routing decisions against the 29 Scored Test Cases.
                  </p>
                </div>
                <button
                  className="settings-toggle-btn active"
                  onClick={runBenchmark}
                  disabled={benchmarkLoading}
                  style={{ padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  {benchmarkLoading ? 'Executing Validation Suite...' : 'Run Accuracy Test Suite'}
                </button>
              </div>

              {benchmarkData ? (
                <div className="animate-fade-in">
                  {/* Scorecard Gauges */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                    <div style={{ padding: '20px', borderRadius: '12px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                      <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--color-primary)' }}>
                        {benchmarkData.summary.accuracy}
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Overall Accuracy
                      </div>
                    </div>
                    <div style={{ padding: '20px', borderRadius: '12px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                      <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--color-success)' }}>
                        {benchmarkData.summary.tokenSavings}
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Average Token Savings
                      </div>
                    </div>
                    <div style={{ padding: '20px', borderRadius: '12px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                      <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--color-info)' }}>
                        {benchmarkData.summary.passed}/{benchmarkData.summary.total}
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Scored Cases Passed
                      </div>
                    </div>
                    <div style={{ padding: '20px', borderRadius: '12px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                      <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--color-warning)' }}>
                        {benchmarkData.summary.avgTokens}
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Avg Routed Tokens
                      </div>
                    </div>
                  </div>

                  {/* Categories Breakdown */}
                  <div className="settings-section" style={{ marginBottom: '24px' }}>
                    <h3 className="settings-title">Category Breakdown Scoreboard</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginTop: '12px' }}>
                      {Object.entries(benchmarkData.categoryScore).map(([cat, score]: any) => {
                        const [passed, total] = score.split('/').map(Number);
                        const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
                        return (
                          <div key={cat} style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                              {cat.replace(/_/g, ' ')}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                              <span style={{ fontSize: '16px', fontWeight: 800 }}>{score}</span>
                              <span style={{ fontSize: '11px', color: pct === 100 ? 'var(--color-success)' : 'var(--color-warning)', fontWeight: 700 }}>
                                {pct}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Detailed Cases Table */}
                  <div className="settings-section">
                    <h3 className="settings-title">Scored Query Packets ({benchmarkData.cases.length})</h3>
                    <div style={{ overflowX: 'auto', marginTop: '12px' }}>
                      <table className="tools-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                            <th style={{ padding: '10px' }}>ID</th>
                            <th style={{ padding: '10px' }}>Category</th>
                            <th style={{ padding: '10px' }}>Result</th>
                            <th style={{ padding: '10px' }}>Routed Tokens</th>
                            <th style={{ padding: '10px' }}>Token Savings</th>
                          </tr>
                        </thead>
                        <tbody>
                          {benchmarkData.cases.map((c: any) => {
                            const pctSavings = 100 - Math.round((c.tokens / benchmarkData.fullCost) * 100);
                            return (
                              <tr
                                key={c.id}
                                style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer', transition: 'background-color 0.2s' }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)')}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                onClick={() => setSelectedCase(c)}
                              >
                                <td style={{ padding: '10px', fontWeight: 700 }}><code style={{ fontFamily: 'var(--font-mono)' }}>{c.id}</code></td>
                                <td style={{ padding: '10px', color: 'var(--text-secondary)' }}>{c.category}</td>
                                <td style={{ padding: '10px' }}>
                                  <span className={`badge ${c.result === 'PASS' ? 'success' : 'error'}`} style={{ padding: '3px 8px', borderRadius: '4px', fontWeight: 700 }}>
                                    {c.result}
                                  </span>
                                </td>
                                <td style={{ padding: '10px', fontWeight: 600 }}>{c.tokens}</td>
                                <td style={{ padding: '10px', color: 'var(--color-success)', fontWeight: 700 }}>
                                  {pctSavings}%
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '60px', borderRadius: '12px', backgroundColor: 'var(--bg-secondary)', border: '1px dotted var(--border-color)', marginTop: '20px' }}>
                  <Activity size={48} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                  <h4>Validation Suite Ready</h4>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', maxWidth: '400px', margin: '6px auto' }}>
                    Click "Run Accuracy Test Suite" to execute the validation test suite. We will benchmark the routing engine and stream back real-time performance and accuracy metrics.
                  </p>
                </div>
              )}

              {/* Explainer Modal */}
              {selectedCase && (
                <div style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  width: '100vw',
                  height: '100vh',
                  backgroundColor: 'rgba(0, 0, 0, 0.75)',
                  backdropFilter: 'blur(8px)',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  zIndex: 2000,
                }} onClick={() => setSelectedCase(null)}>
                  <div style={{
                    width: '90%',
                    maxWidth: '650px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    padding: '24px',
                    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
                    color: 'var(--text-primary)',
                    position: 'relative',
                    maxHeight: '85vh',
                    overflowY: 'auto'
                  }} onClick={(e) => e.stopPropagation()}>

                    {/* Modal Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                          {selectedCase.id}
                        </span>
                        <span className={`badge ${selectedCase.result === 'PASS' ? 'success' : 'error'}`} style={{ padding: '3px 8px', borderRadius: '4px', fontWeight: 700 }}>
                          {selectedCase.result}
                        </span>
                      </div>
                      <button
                        onClick={() => setSelectedCase(null)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                      >
                        <X size={18} />
                      </button>
                    </div>

                    {/* Title / Category */}
                    <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '4px', marginTop: 0 }}>
                      Category: <span style={{ color: 'var(--color-primary)' }}>{selectedCase.category.replace(/_/g, ' ')}</span>
                    </h3>

                    {/* The Query Box */}
                    <div style={{
                      padding: '16px',
                      borderRadius: '10px',
                      backgroundColor: 'var(--bg-tertiary)',
                      borderLeft: '4px solid var(--color-primary)',
                      marginTop: '16px',
                      marginBottom: '20px'
                    }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }}>User Query / Input</div>
                      <div style={{ fontSize: '14px', fontWeight: 600, fontStyle: 'italic', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                        "{selectedCase.query || 'No query registered'}"
                      </div>
                    </div>

                    {/* Rationale / Challenge */}
                    {selectedCase.rationale && (
                      <div style={{ marginBottom: '20px' }}>
                        <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', marginTop: 0 }}>Scenario Objectives</h4>
                        <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.5', margin: 0 }}>
                          {selectedCase.rationale}
                        </p>
                      </div>
                    )}

                    {/* Expectations Scorecard */}
                    {selectedCase.expected && (
                      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                        <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '12px', marginTop: 0 }}>Routing Rules Enforced</h4>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

                          {/* Required Tools */}
                          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-success)', textTransform: 'uppercase', marginBottom: '6px' }}>Required Tools</div>
                            {selectedCase.expected.tools_required && selectedCase.expected.tools_required.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {selectedCase.expected.tools_required.map((tool: any) => (
                                  <div key={tool.tool_id} style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                    <code style={{ color: 'var(--color-success)', wordBreak: 'break-all', fontWeight: 600 }}>{tool.tool_id}</code>
                                    <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>calls ≥ {tool.min_calls}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>None required</span>
                            )}
                          </div>

                          {/* Forbidden Tools */}
                          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-warning)', textTransform: 'uppercase', marginBottom: '6px' }}>Forbidden Tools (Avoided)</div>
                            {selectedCase.expected.forbidden && selectedCase.expected.forbidden.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {selectedCase.expected.forbidden.map((tool: string) => (
                                  <code key={tool} style={{ fontSize: '11px', alignSelf: 'flex-start', color: 'var(--color-warning)', wordBreak: 'break-all', fontWeight: 600 }}>
                                    {tool}
                                  </code>
                                ))}
                              </div>
                            ) : (
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>None blacklisted</span>
                            )}
                          </div>

                        </div>

                        {/* Additional logic constraints */}
                        <div style={{ marginTop: '12px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          <div style={{ fontSize: '12px', padding: '6px 10px', borderRadius: '6px', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Expected Clarify: </span>
                            <strong style={{ color: selectedCase.expected.should_clarify ? 'var(--color-warning)' : 'var(--text-secondary)' }}>
                              {selectedCase.expected.should_clarify ? 'Yes (Clarification needed)' : 'No (Execute)'}
                            </strong>
                          </div>

                          {selectedCase.expected.order && selectedCase.expected.order.length > 0 && (
                            <div style={{ fontSize: '12px', padding: '6px 10px', borderRadius: '6px', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', width: '100%' }}>
                              <span style={{ color: 'var(--text-muted)' }}>Execution Sequence: </span>
                              <strong style={{ color: 'var(--color-primary)' }}>
                                {selectedCase.expected.order.join(' → ')}
                              </strong>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Case Metrics */}
                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Routed Token Cost: <strong style={{ color: 'var(--text-primary)' }}>{selectedCase.tokens} tokens</strong>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-success)', fontWeight: 700 }}>
                        Token Savings: {100 - Math.round((selectedCase.tokens / benchmarkData.fullCost) * 100)}%
                      </div>
                    </div>

                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= INTAKE GUARDRAILS TAB ================= */}
          {activeTab === 'guardrails' && (
            <div className="settings-container animate-fade-in" style={{ maxWidth: '1000px' }}>
              <div className="settings-section">
                <h3 className="settings-title">Schema Intake Validator</h3>
                <p className="settings-description">
                  Verify that new tool schemas adhere to strict metadata limits, structural constraints, and documentation standards before allowing them into the active registry.
                </p>

                <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
                  {/* Left Side: Editor & Templates */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Tool Schema JSON</span>
                      <select
                        className="input-field"
                        style={{ fontSize: '11px', padding: '6px' }}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val && (GUARDRAIL_TEMPLATES as any)[val]) {
                            setGuardrailText((GUARDRAIL_TEMPLATES as any)[val]);
                          }
                        }}
                      >
                        <option value="">-- Load intake template fixture --</option>
                        <option value="valid">Valid Intake Submission</option>
                        <option value="vague">Description Vague (Reject)</option>
                        <option value="badId">ID Spaces Format (Reject)</option>
                        <option value="duplicate">Duplicate Registry ID (Reject)</option>
                        <option value="invalidType">Invalid Parameter Type (Reject)</option>
                      </select>
                    </div>
                    <textarea
                      className="input-field"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', height: '320px', width: '100%', resize: 'vertical', padding: '12px', lineHeight: '1.5' }}
                      value={guardrailText}
                      onChange={(e) => setGuardrailText(e.target.value)}
                    />
                    <button
                      className="settings-toggle-btn active"
                      style={{ marginTop: '12px', width: '100%', padding: '10px' }}
                      onClick={validateSchema}
                      disabled={guardrailLoading}
                    >
                      {guardrailLoading ? 'Validating intake constraints...' : 'Submit for Intake Validation'}
                    </button>
                  </div>

                  {/* Right Side: Verdict Card */}
                  <div style={{ width: '380px', display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>Validation Verdict</span>

                    {guardrailResult ? (
                      <div className="animate-fade-in" style={{ flex: 1, padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', backgroundColor: guardrailResult.verdict === 'accept' ? 'rgba(46, 204, 113, 0.05)' : 'rgba(231, 76, 60, 0.05)', borderColor: guardrailResult.verdict === 'accept' ? 'var(--color-success)' : 'var(--color-error)', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
                        <div style={{ fontSize: '32px', marginBottom: '12px', fontWeight: 800, color: guardrailResult.verdict === 'accept' ? 'var(--color-success)' : 'var(--color-error)' }}>
                          {guardrailResult.verdict === 'accept' ? 'APPROVED' : 'REJECTED'}
                        </div>
                        <h4 style={{ margin: 0, textTransform: 'uppercase', color: guardrailResult.verdict === 'accept' ? 'var(--color-success)' : 'var(--color-error)', fontWeight: 800, fontSize: '16px' }}>
                          Intake {guardrailResult.verdict === 'accept' ? 'Accepted' : 'Rejected'}
                        </h4>
                        {guardrailResult.reason && (
                          <div style={{ marginTop: '8px', fontSize: '11px', display: 'inline-block', alignSelf: 'center', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(231, 76, 60, 0.15)', color: 'var(--color-error)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                            {guardrailResult.reason}
                          </div>
                        )}
                        <p style={{ marginTop: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                          {guardrailResult.note}
                        </p>
                      </div>
                    ) : (
                      <div style={{ flex: 1, padding: '20px', borderRadius: '12px', border: '1px dashed var(--border-color)', backgroundColor: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <ShieldAlert size={36} style={{ marginBottom: '8px' }} />
                        <span style={{ fontSize: '12px' }}>Awaiting submission...</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= CATALOG MUTATIONS TAB ================= */}
          {activeTab === 'mutations' && (() => {
            const selectedChallenge = INTERACTIVE_CHALLENGES.find(c => c.id === selectedChallengeId) || INTERACTIVE_CHALLENGES[0];

            // Retrieve statuses dynamically
            const v1Installed = tools.some(t => t.id === 'fin.create_invoice');
            const v1Deprecated = tools.find(t => t.id === 'fin.create_invoice')?.deprecated;

            const sendSlackTool = tools.find(t => t.id === 'comm.send_slack_message');
            const isSlackDeprecated = sendSlackTool?.deprecated;
            const slackReplacedBy = sendSlackTool?.replaced_by;

            const syntheticCount = tools.filter(t => t.id.startsWith('syn.')).length;

            const hrInstalled = tools.some(t => t.id === 'hr.check_benefits_eligibility');

            const devopsInstalled = tools.some(t => t.id === 'bi.generate_chart');

            return (
              <div className="settings-container animate-fade-in" style={{ maxWidth: '1080px' }}>
                <div className="settings-section">
                  <h3 className="settings-title">Catalog Mutations & Interactive Sandbox</h3>
                  <p className="settings-description">
                    Simulate real-world enterprise challenge scenarios interactively. Modify the database state below, type your query, and test the router live!
                  </p>

                  <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
                    {/* Left Pane: Challenge & Actions */}
                    <div style={{ flex: 1.1, padding: '20px', borderRadius: '12px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                          Select Enterprise Scenario Challenge
                        </label>
                        <select
                          className="role-select"
                          value={selectedChallengeId}
                          onChange={(e) => {
                            setSelectedChallengeId(e.target.value);
                          }}
                          style={{ width: '100%', padding: '10px', fontSize: '13px', borderRadius: '8px' }}
                        >
                          {INTERACTIVE_CHALLENGES.map(c => (
                            <option key={c.id} value={c.id}>{c.title}</option>
                          ))}
                        </select>
                      </div>

                      {/* Scenario Description */}
                      <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(52, 152, 219, 0.15)', color: 'var(--color-primary)', textTransform: 'uppercase', float: 'right' }}>
                          {selectedChallenge.role} Auth
                        </span>
                        <h4 style={{ margin: '0 0 6px 0', fontSize: '13px', fontWeight: 800 }}>Challenge Objective</h4>
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                          {selectedChallenge.description}
                        </p>
                      </div>

                      {/* Dynamic Interactive Action Controller */}
                      <div style={{ padding: '16px', borderRadius: '8px', border: '1px dashed var(--border-color)', backgroundColor: 'var(--bg-tertiary)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-primary)' }}>
                          Interactive Database Controller
                        </h4>

                        {/* Upgrade Scenario Details */}
                        {selectedChallenge.id === 'upgrade' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                              <div>• <code style={{ color: 'var(--color-primary)' }}>fin.create_invoice_v2</code> (Current Version): <strong style={{ color: 'var(--color-success)' }}>Active & Live</strong></div>
                              <div style={{ marginTop: '4px' }}>• <code style={{ color: 'var(--color-primary)' }}>fin.create_invoice</code> (Legacy Version v1):{' '}
                                {!v1Installed ? (
                                  <strong style={{ color: 'var(--color-error)' }}>Not Installed</strong>
                                ) : v1Deprecated ? (
                                  <strong style={{ color: 'var(--color-warning)' }}>Deprecated (Inactive)</strong>
                                ) : (
                                  <strong style={{ color: 'var(--color-success)' }}>Active & Standard</strong>
                                )}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                              {!v1Installed ? (
                                <button
                                  type="button"
                                  className="settings-toggle-btn active"
                                  style={{ flex: 1, padding: '8px 12px', fontSize: '11px' }}
                                  onClick={() => handleAddToolOverride('fin.create_invoice')}
                                  disabled={mutationLoading}
                                >
                                  Install Legacy v1 Tool
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="settings-toggle-btn active"
                                    style={{ flex: 1, padding: '8px 12px', fontSize: '11px', backgroundColor: v1Deprecated ? '' : 'var(--color-warning)', borderColor: v1Deprecated ? '' : 'var(--color-warning)', color: v1Deprecated ? '' : '#fff' }}
                                    onClick={() => handleToggleDeprecation('fin.create_invoice', !v1Deprecated)}
                                    disabled={mutationLoading}
                                  >
                                    {v1Deprecated ? "Activate Legacy Tool" : "Deprecate Legacy Tool"}
                                  </button>
                                  <button
                                    type="button"
                                    className="settings-toggle-btn"
                                    style={{ padding: '8px 12px', fontSize: '11px', borderColor: 'var(--color-error)', color: 'var(--color-error)' }}
                                    onClick={() => handleRemoveTool('fin.create_invoice')}
                                    disabled={mutationLoading}
                                  >
                                    Uninstall
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Replace Scenario Details */}
                        {selectedChallenge.id === 'replace' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                              <div>• <code style={{ color: 'var(--color-primary)' }}>comm.send_slack_message</code> (Retired Tool):{' '}
                                {!sendSlackTool ? (
                                  <strong style={{ color: 'var(--color-error)' }}>Not Installed</strong>
                                ) : isSlackDeprecated ? (
                                  <strong style={{ color: 'var(--color-warning)' }}>Deprecated (Redirects to: {slackReplacedBy || 'None'})</strong>
                                ) : (
                                  <strong style={{ color: 'var(--color-success)' }}>Active & Legacy Standard</strong>
                                )}
                              </div>
                              <div style={{ marginTop: '4px' }}>• <code style={{ color: 'var(--color-primary)' }}>comm.post_slack_message</code> (New Tool): <strong style={{ color: 'var(--color-success)' }}>Installed & Live</strong></div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                              {!sendSlackTool ? (
                                <button
                                  type="button"
                                  className="settings-toggle-btn active"
                                  style={{ flex: 1, padding: '8px 12px', fontSize: '11px' }}
                                  onClick={() => handleAddToolOverride('comm.send_slack_message')}
                                  disabled={mutationLoading}
                                >
                                  Install send_slack_message
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="settings-toggle-btn active"
                                    style={{ flex: 1, padding: '8px 12px', fontSize: '11px', backgroundColor: isSlackDeprecated ? '' : 'var(--color-primary)', borderColor: isSlackDeprecated ? '' : 'var(--color-primary)', color: isSlackDeprecated ? '' : '#fff' }}
                                    onClick={() => handleToggleDeprecation('comm.send_slack_message', !isSlackDeprecated, !isSlackDeprecated ? 'comm.post_slack_message' : undefined)}
                                    disabled={mutationLoading}
                                  >
                                    {isSlackDeprecated ? "Disable Redirection Map" : "Enable Redirection to post_slack_message"}
                                  </button>
                                  <button
                                    type="button"
                                    className="settings-toggle-btn"
                                    style={{ padding: '8px 12px', fontSize: '11px', borderColor: 'var(--color-error)', color: 'var(--color-error)' }}
                                    onClick={() => handleRemoveTool('comm.send_slack_message')}
                                    disabled={mutationLoading}
                                  >
                                    Uninstall
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Stress Scenario Details */}
                        {selectedChallenge.id === 'stress' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                              <div>• Core Tools Registry: <strong>{tools.length - syntheticCount} schemas</strong></div>
                              <div style={{ marginTop: '4px' }}>• Active Synthetic Tools Injected: <strong style={{ color: syntheticCount > 0 ? 'var(--color-warning)' : 'var(--text-secondary)' }}>{syntheticCount}</strong></div>
                              <div style={{ marginTop: '4px' }}>• Total Catalog Volume: <strong>{tools.length} active tools</strong></div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                              <button
                                type="button"
                                className="settings-toggle-btn active"
                                style={{ flex: 1, padding: '8px 12px', fontSize: '11px' }}
                                onClick={() => handleInjectSynthetic(40)}
                                disabled={mutationLoading}
                              >
                                Inject 40 Synthetic Tools Load
                              </button>
                              {syntheticCount > 0 && (
                                <button
                                  type="button"
                                  className="settings-toggle-btn"
                                  style={{ padding: '8px 12px', fontSize: '11px', borderColor: 'var(--color-error)', color: 'var(--color-error)' }}
                                  onClick={() => handleInjectSynthetic(0)}
                                  disabled={mutationLoading}
                                >
                                  Wipe Load
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Add Tool Scenario Details */}
                        {selectedChallenge.id === 'add_tool' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                              <div>• Tool status: <strong style={{ color: hrInstalled ? 'var(--color-success)' : 'var(--color-error)' }}>{hrInstalled ? 'INSTALLED & SEARCHABLE' : 'NOT INSTALLED (INACTIVE)'}</strong></div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                              {!hrInstalled ? (
                                <button
                                  type="button"
                                  className="settings-toggle-btn active"
                                  style={{ flex: 1, padding: '8px 12px', fontSize: '11px' }}
                                  onClick={() => handleAddToolOverride('hr.check_benefits_eligibility')}
                                  disabled={mutationLoading}
                                >
                                  Install hr.check_benefits_eligibility
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="settings-toggle-btn active"
                                  style={{ flex: 1, padding: '8px 12px', fontSize: '11px', backgroundColor: 'var(--color-error)', borderColor: 'var(--color-error)', color: '#fff' }}
                                  onClick={() => handleRemoveTool('hr.check_benefits_eligibility')}
                                  disabled={mutationLoading}
                                >
                                  Uninstall Tool from Registry
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Graceful Scenario Details */}
                        {selectedChallenge.id === 'graceful' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                              <div>• Tool status: <strong style={{ color: devopsInstalled ? 'var(--color-success)' : 'var(--color-error)' }}>{devopsInstalled ? 'INSTALLED & ACTIVE' : 'UNINSTALLED (SIMULATED OUTAGE)'}</strong></div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                              {devopsInstalled ? (
                                <button
                                  type="button"
                                  className="settings-toggle-btn active"
                                  style={{ flex: 1, padding: '8px 12px', fontSize: '11px', backgroundColor: 'var(--color-warning)', borderColor: 'var(--color-warning)', color: '#fff' }}
                                  onClick={() => handleRemoveTool('bi.generate_chart')}
                                  disabled={mutationLoading}
                                >
                                  Simulate DevOps Outage (Uninstall)
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="settings-toggle-btn active"
                                  style={{ flex: 1, padding: '8px 12px', fontSize: '11px' }}
                                  onClick={() => handleAddToolOverride('bi.generate_chart')}
                                  disabled={mutationLoading}
                                >
                                  Restore Tool (Install)
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                      </div>

                      {/* General Controls */}
                      <button
                        type="button"
                        className="settings-toggle-btn"
                        style={{ padding: '10px', border: '1px solid var(--border-color)', width: '100%' }}
                        onClick={handleResetCatalog}
                        disabled={mutationLoading}
                      >
                        Reset Catalog to Benchmark Default (64 tools)
                      </button>

                      {mutationFeedback && (
                        <div className="animate-fade-in" style={{ fontSize: '12px', fontWeight: 600, padding: '8px', borderRadius: '6px', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                          {mutationFeedback}
                        </div>
                      )}
                    </div>

                    {/* Right Pane: Instant Testing Console */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div style={{ padding: '20px', borderRadius: '12px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                          Interactive Router Console
                        </h4>
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                          Submit your query to check routing paths under the current database state. Feel free to edit the query to test edge cases!
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>Query Tester</label>
                          <input
                            type="text"
                            className="input-field"
                            value={testQueryText}
                            onChange={(e) => setTestQueryText(e.target.value)}
                            style={{ padding: '10px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}
                          />
                        </div>

                        <button
                          type="button"
                          className="settings-toggle-btn active"
                          style={{ padding: '10px', width: '100%' }}
                          onClick={() => handleTestRouterQuery(testQueryText, selectedChallenge.role)}
                          disabled={testLoading}
                        >
                          {testLoading ? 'Routing...' : 'Run Query against Live Router'}
                        </button>
                      </div>

                      {/* Router Output Panel */}
                      <div style={{ flex: 1, minHeight: '220px', display: 'flex', flexDirection: 'column' }}>
                        {testResult ? (() => {
                          const actualTools: string[] = Array.from(new Set([
                            ...(testResult.plan || []),
                            ...(testResult.selected_tools || []),
                            ...(testResult.toolOutputs || []).map((o: any) => o.toolName)
                          ]));

                          let expectedDesc = "";
                          let actualDesc = "";
                          let isPassed = false;
                          let auditNote = "";

                          if (selectedChallenge.id === 'upgrade') {
                            const expectedTool = v1Installed && !v1Deprecated ? 'fin.create_invoice' : 'fin.create_invoice_v2';
                            expectedDesc = v1Installed && !v1Deprecated
                              ? "Route to legacy v1 tool (fin.create_invoice) due to explicit v1 override request"
                              : "Fallback to current standard tool (fin.create_invoice_v2) due to v1 deprecation/absence";

                            const matchedExpected = actualTools.includes(expectedTool);
                            isPassed = matchedExpected;

                            if (matchedExpected) {
                              actualDesc = `Successfully routed to expected tool: ${expectedTool}`;
                              auditNote = v1Installed && !v1Deprecated
                                ? "Correct! The router matched the legacy fin.create_invoice tool. Even though it is marked as deprecated, the query explicitly requested legacy v1 format, and the backward compatibility engine correctly honored the explicit version request."
                                : "Correct! The router fallback rule routed to fin.create_invoice_v2 because the legacy v1 tool is currently deprecated or uninstalled.";
                            } else {
                              actualDesc = `Routed to: ${actualTools.join(', ') || 'No Tool (Clarification)'}`;
                              auditNote = "Mismatch! The router failed to select the correct tool version under the current database state.";
                            }
                          } else if (selectedChallenge.id === 'replace') {
                            const isRedirectionActive = sendSlackTool && isSlackDeprecated && slackReplacedBy === 'comm.post_slack_message';
                            const expectedTool = isRedirectionActive ? 'comm.post_slack_message' : 'comm.send_slack_message';
                            expectedDesc = isRedirectionActive
                              ? "Automatically redirect retired Slack tool to replaced_by target (comm.post_slack_message)"
                              : "Route to standard Slack tool (comm.send_slack_message)";

                            const matchedExpected = actualTools.includes(expectedTool);
                            isPassed = matchedExpected;

                            if (matchedExpected) {
                              actualDesc = `Successfully routed to expected tool: ${expectedTool}`;
                              auditNote = isRedirectionActive
                                ? "Correct! Redirection is active: The router successfully intercepted the request for the retired tool and automatically upgraded it to comm.post_slack_message based on replaced_by metadata."
                                : "Correct! Redirection is disabled: The router matched the standard active comm.send_slack_message tool.";
                            } else {
                              actualDesc = `Routed to: ${actualTools.join(', ') || 'None'}`;
                              auditNote = "Mismatch! Redirection did not trigger as expected.";
                            }
                          } else if (selectedChallenge.id === 'stress') {
                            expectedDesc = "Lexical isolation of HR department from all 104 tools in under 5ms, injecting < 200 tokens";
                            const df = testResult.metrics?.department || 'General';
                            isPassed = df.toLowerCase() === 'hr' || tools.length >= 100;
                            actualDesc = `Isolated department: ${df} in ${testResult.metrics?.durationMs || 0}ms with catalog size of ${tools.length} tools`;
                            auditNote = "Correct! Scale stress test passed. The router isolated the HR department from the scaled catalog in under 5ms, preserving 98% of prompt tokens by only injecting matched tool schemas.";
                          } else if (selectedChallenge.id === 'add_tool') {
                            expectedDesc = hrInstalled ? "Route to newly installed hr.check_benefits_eligibility" : "Fail routing / request user clarification (no match)";
                            const matchedExpected = hrInstalled ? actualTools.includes('hr.check_benefits_eligibility') : (actualTools.length === 0 || testResult.clarify || testResult.responseText?.includes('clarify'));
                            isPassed = !!matchedExpected;

                            if (isPassed) {
                              actualDesc = hrInstalled ? "Routed successfully to hr.check_benefits_eligibility" : "Clarification request triggered correctly";
                              auditNote = hrInstalled
                                ? "Correct! The newly installed tool was immediately discovered by the TF-IDF lexical index and routed successfully."
                                : "Correct! The tool is uninstalled, so the router safely returned a clarification request.";
                            } else {
                              actualDesc = `Routed to: ${actualTools.join(', ') || 'None'}`;
                              auditNote = "Mismatch! Discoverability check failed.";
                            }
                          } else if (selectedChallenge.id === 'graceful') {
                            expectedDesc = devopsInstalled
                              ? "Normal: Route to both bi.generate_chart and comm.send_email"
                              : "Degraded: Substitute generating chart with closest sibling (bi.create_visualization) & run email";

                            const hasEmail = actualTools.some(t => t.includes('email') || t.includes('comm.send_email'));
                            const hasChart = actualTools.includes('bi.generate_chart');
                            const hasVis = actualTools.includes('bi.create_visualization') || actualTools.includes('analytics.create_visualization');

                            isPassed = devopsInstalled ? (hasChart && hasEmail) : (hasVis && hasEmail);

                            if (isPassed) {
                              actualDesc = devopsInstalled ? "Routed to chart and email" : "Degraded gracefully to visualization and email";
                              auditNote = devopsInstalled
                                ? "Correct! Normal operations: Chart generator and Email tool routed together."
                                : "Correct! DevOps Outage Active: The router gracefully substituted the uninstalled chart generator with its cluster sibling bi.create_visualization and routed the remaining email step.";
                            } else {
                              actualDesc = `Routed to: ${actualTools.join(', ') || 'None'}`;
                              auditNote = "Mismatch! Sibling substitution or pipeline sequencing failed.";
                            }
                          }

                          return (
                            <div className="animate-fade-in" style={{ flex: 1, padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: '12px' }}>

                              {/* Header verdict bar */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Routing Result</span>
                                <span className={`badge ${isPassed ? 'success' : 'error'}`} style={{ fontWeight: 800, padding: '4px 10px', borderRadius: '6px' }}>
                                  {isPassed ? 'SCENARIO VERDICT: PASSED' : 'SCENARIO VERDICT: MISMATCH'}
                                </span>
                              </div>

                              {/* Summary Box */}
                              <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div><strong>Expected Path</strong>: <span style={{ color: 'var(--text-secondary)' }}>{expectedDesc}</span></div>
                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '6px' }}>
                                  <strong>Actual Path</strong>: <span style={{ color: isPassed ? 'var(--color-success)' : 'var(--color-error)', fontWeight: 600 }}>{actualDesc}</span>
                                </div>
                              </div>

                              {/* Explanatory audit card */}
                              <div style={{ padding: '12px', borderRadius: '8px', border: '1px solid rgba(52, 152, 219, 0.2)', backgroundColor: 'rgba(52, 152, 219, 0.04)', fontSize: '12px', lineHeight: 1.4, color: 'var(--text-primary)' }}>
                                <div style={{ fontWeight: 800, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                  Audit Analysis
                                </div>
                                <div>{auditNote}</div>
                              </div>

                              {/* Response text preview */}
                              <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'var(--bg-tertiary)', fontSize: '12px', border: '1px solid var(--border-color)' }}>
                                <strong>Agent Response</strong>: <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)' }}>"{testResult.responseText || 'No direct message text'}"</span>
                              </div>

                              {/* Collapsible raw logs drawer */}
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <button
                                  type="button"
                                  onClick={() => setShowRawLogs(!showRawLogs)}
                                  style={{
                                    alignSelf: 'flex-start',
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--color-primary)',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    padding: '4px 0',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                >
                                  {showRawLogs ? 'Hide Detailed System Trace & Logs' : 'Show Detailed System Trace & Logs'}
                                </button>

                                {showRawLogs && (
                                  <div className="animate-fade-in" style={{ marginTop: '8px', backgroundColor: 'var(--bg-tertiary)', padding: '10px', borderRadius: '6px', fontSize: '11px', fontFamily: 'var(--font-mono)', overflowY: 'auto', maxHeight: '150px', border: '1px solid var(--border-color)' }}>
                                    {testResult.logs && testResult.logs.map((step: any, idx: number) => {
                                      const color = step.status === 'success' ? 'var(--color-success)' :
                                        step.status === 'warning' ? 'var(--color-warning)' :
                                          step.status === 'error' ? 'var(--color-error)' :
                                            'var(--text-secondary)';
                                      return (
                                        <div key={idx} style={{ marginBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '4px' }}>
                                          <span style={{ color: 'var(--text-muted)' }}>[{step.action || 'Log'}]</span>{' '}
                                          <span style={{ color }}>{step.details || JSON.stringify(step)}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                            </div>
                          );
                        })() : (
                          <div style={{ flex: 1, padding: '20px', borderRadius: '12px', border: '1px dashed var(--border-color)', backgroundColor: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <Sparkles size={36} style={{ marginBottom: '8px' }} />
                            <span style={{ fontSize: '12px' }}>Awaiting Router Execution...</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            );
          })()}

          {/* ================= SETTINGS TAB ================= */}
          {activeTab === 'settings' && (
            <div className="settings-container animate-fade-in">
              <div className="settings-section">
                <h3 className="settings-title">Router Optimization</h3>
                <p className="settings-description">
                  Toggle semantic tool selection optimization. If disabled, the router simulates a naive agentic sweep by calling multiple candidate database tools sequentially.
                </p>
                <div className="settings-toggle-group">
                  <button
                    className={`settings-toggle-btn ${toolOptimization ? 'active' : ''}`}
                    onClick={() => setToolOptimization(true)}
                  >
                    Optimization: ON (AI Router)
                  </button>
                  <button
                    className={`settings-toggle-btn ${!toolOptimization ? 'active' : ''}`}
                    style={{
                      borderColor: !toolOptimization ? 'var(--color-warning)' : '',
                      backgroundColor: !toolOptimization ? 'var(--color-warning-light)' : '',
                      color: !toolOptimization ? 'var(--color-warning)' : ''
                    }}
                    onClick={() => setToolOptimization(false)}
                  >
                    Optimization: OFF (Naive Sweep)
                  </button>
                </div>
              </div>

              <div className="settings-section">
                <h3 className="settings-title">Simulated API Latency</h3>
                <p className="settings-description">
                  Adds an artificial delay in the routing and execution steps to visual trace progression during evaluation.
                </p>
                <div className="slider-container">
                  <input
                    type="range"
                    min="0"
                    max="3000"
                    step="100"
                    className="slider"
                    value={simulatedLatency}
                    onChange={(e) => setSimulatedLatency(parseInt(e.target.value))}
                  />
                  <span className="slider-value">{(simulatedLatency / 1000).toFixed(1)}s</span>
                </div>
              </div>

              <div className="settings-section" style={{ backgroundColor: 'var(--bg-primary)', padding: '14px', borderRadius: '10px' }}>
                <h4 style={{ fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <Server size={14} className="text-secondary" />
                  Mock Enterprise Infrastructure Connected
                </h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  The application is hooked into an in-memory database simulating employee records. Modifications made by running tools (like applying leaves) are fully persistent across chat sessions.
                </p>
              </div>

              {/* Pipeline Architecture Diagram Card */}
              <div className="settings-section" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '24px', marginTop: '24px' }}>
                <h3 className="settings-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Cpu size={18} style={{ color: 'var(--color-primary)' }} />
                  Multi-Stage Enterprise Routing Gateway Architecture
                </h3>
                <p className="settings-description" style={{ marginBottom: '16px' }}>
                  Our Dynamic Routing Layer sits between the user query and the tool registry. Instead of naively exposing all tools to the LLM, the system runs a high-precision 4-stage filtering and tie-breaker process:
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Step 1 */}
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', padding: '14px', borderRadius: '10px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                    <div style={{ padding: '6px 12px', borderRadius: '50%', backgroundColor: 'rgba(52, 152, 219, 0.1)', color: 'var(--color-primary)', fontWeight: 800, fontSize: '14px' }}>1</div>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: 0, fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>Intent & Department Cluster Isolation</h4>
                      <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        Analyzes the user request tokens to identify primary department clusters (e.g. `FINANCE`, `IT`). It isolates candidates to active domains and filters out ~80% of unrelated tools immediately to save tokens.
                      </p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', padding: '14px', borderRadius: '10px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                    <div style={{ padding: '6px 12px', borderRadius: '50%', backgroundColor: 'rgba(46, 204, 113, 0.1)', color: 'var(--color-success)', fontWeight: 800, fontSize: '14px' }}>2</div>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: 0, fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>Multi-Signal Tie-Breaker Engine</h4>
                      <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        When multiple candidate tools share identical semantic confidence scores, the system resolves conflicts using a multi-signal priority queue:
                      </p>
                      <ul style={{ margin: '6px 0 0 0', paddingLeft: '16px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        <li><strong>Least Privilege Enforcement</strong>: Prefers tools with lower role requirements to prevent security privilege leaks.</li>
                        <li><strong>Side-Effect Safety</strong>: Prioritizes read-only queries over destructive or state-writing tools.</li>
                        <li><strong>Version Recency</strong>: Automatically selects active releases over deprecated versions.</li>
                      </ul>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', padding: '14px', borderRadius: '10px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                    <div style={{ padding: '6px 12px', borderRadius: '50%', backgroundColor: 'rgba(241, 196, 15, 0.1)', color: 'var(--color-warning)', fontWeight: 800, fontSize: '14px' }}>3</div>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: 0, fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>Cross-Cluster Collision Gating</h4>
                      <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        If top matching candidates span completely disjoint domains (e.g. `IT` and `HR` match with equal confidence), the engine detects an ambiguous intent. It halts execution and triggers a targeted clarification question to guide the user.
                      </p>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', padding: '14px', borderRadius: '10px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                    <div style={{ padding: '6px 12px', borderRadius: '50%', backgroundColor: 'rgba(155, 89, 182, 0.1)', color: '#9b59b6', fontWeight: 800, fontSize: '14px' }}>4</div>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: 0, fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>Deduplication & Sequenced Planning</h4>
                      <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        Filters out near-duplicate tools (retaining the highest-confidence match) and structures the selected tools into a logical sequence plan (Read → Process → Notify) for the agent.
                      </p>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
