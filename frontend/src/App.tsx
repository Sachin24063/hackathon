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
  Clock, 
  Key, 
  Lock, 
  ChevronDown, 
  ChevronUp, 
  ShieldAlert,
  Server,
  Layers,
  Cpu
} from 'lucide-react';

// Interfaces matching backend models
interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'date' | 'array';
  description: string;
  required: boolean;
  enum?: string[];
}

interface Tool {
  name: string;
  title: string;
  description: string;
  department: string;
  requiredPermissions: string[];
  inputSchema: {
    [paramName: string]: ToolParameter;
  };
  outputSchema: any;
}

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
}

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
  traceSteps: TraceStep[];
}

const roleToUserMap: { [role: string]: { id: string; name: string } } = {
  'Employee': { id: 'USR-001', name: 'Amit Sharma' },
  'Manager': { id: 'USR-002', name: 'Rahul Varma' },
  'HR': { id: 'USR-003', name: 'Priya Nair' },
  'Finance': { id: 'USR-004', name: 'John Doe' },
  'IT_Admin': { id: 'USR-005', name: 'Sarah Connor' }
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'chat' | 'catalog' | 'logs' | 'settings'>('chat');
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
  const [tools, setTools] = useState<Tool[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  // Settings State
  const [routerType, setRouterType] = useState<'Local' | 'Claude'>('Local');
  const [claudeApiKey, setClaudeApiKey] = useState<string>(() => localStorage.getItem('claude_api_key') || '');
  const [simulatedLatency, setSimulatedLatency] = useState<number>(800);
  const [toolOptimization, setToolOptimization] = useState<boolean>(true);
  const [claudeModel, setClaudeModel] = useState<string>('claude-3-5-sonnet-latest');

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLog | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load API Key from localStorage
  useEffect(() => {
    localStorage.setItem('claude_api_key', claudeApiKey);
  }, [claudeApiKey]);

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

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      setAuditLogs(data);
    } catch (e) {
      console.error('Failed fetching audit logs:', e);
    }
  };

  useEffect(() => {
    fetchTools();
    fetchAuditLogs();
  }, []);

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
          apiKey: claudeApiKey,
          routerType,
          simulatedLatency,
          toolOptimization,
          claudeModel
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
          metrics: data.metrics
        }
      ]);
      
      setActiveTrace(data.logs || []);
      setActiveMetrics(data.metrics || null);
      
      // Refresh audit logs in the background
      fetchAuditLogs();
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
  const departments = ['All', ...new Set(tools.map(t => t.department))];

  // Filter tools
  const filteredTools = tools.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = selectedDept === 'All' || t.department === selectedDept;
    return matchesSearch && matchesDept;
  });

  // Calculate Metrics Summary
  const totalQueries = auditLogs.length;
  const averageLatency = totalQueries > 0 
    ? Math.round(auditLogs.reduce((acc, l) => acc + l.durationMs, 0) / totalQueries) 
    : 0;
  const successRate = totalQueries > 0
    ? ((auditLogs.filter(l => l.success).length / totalQueries) * 100).toFixed(1)
    : '100.0';
  const blockedRequests = auditLogs.filter(l => l.traceSteps.some(s => s.action.includes('Security Access Denied'))).length;

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
            className={`nav-item ${activeTab === 'catalog' ? 'active' : ''}`}
            onClick={() => setActiveTab('catalog')}
          >
            <Database size={18} />
            <span>Tool Catalog ({tools.length})</span>
          </li>
          <li 
            className={`nav-item ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <Activity size={18} />
            <span>Audit & Analytics</span>
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
          <div style={{ marginTop: '4px', fontSize: '10px' }}>Powered by Gemini & Claude</div>
        </div>
      </aside>

      {/* ================= MAIN PANEL CONTENT ================= */}
      <main className="main-content">
        {/* Top Header Bar */}
        <header className="top-header">
          <div className="header-title-container">
            <h2 className="header-title">
              {activeTab === 'chat' && 'Assistant & Router Simulator'}
              {activeTab === 'catalog' && 'Enterprise Tool Registry Catalog'}
              {activeTab === 'logs' && 'System Analytics & Security Logs'}
              {activeTab === 'settings' && 'System Configuration & Keys'}
            </h2>
            <p className="header-subtitle">
              {activeTab === 'chat' && 'Send natural language requests and observe real-time AI tool routing'}
              {activeTab === 'catalog' && 'Centralized metadata store containing authorization constraints and schemas'}
              {activeTab === 'logs' && 'Real-time performance audit, average response times, and token parameters'}
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
                    ⚡ Semantic Routing Optimization
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
                              ⚡ {msg.metrics.durationMs}ms
                            </span>
                            <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: msg.role === 'user' ? 'white' : 'var(--text-secondary)' }}>
                              🎯 {(msg.metrics.confidence * 100).toFixed(0)}% Conf
                            </span>
                            <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: msg.role === 'user' ? 'white' : 'var(--text-secondary)' }}>
                              🤖 {msg.metrics.routerUsed} Router
                            </span>
                          </div>
                        )}
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
                          // Tool Call group
                          const toolMeta = tools.find(t => t.name === group.toolName);
                          const displayTitle = toolMeta ? toolMeta.title : group.toolName;
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
                                    🛠️ Tool Execution: {displayTitle}
                                  </span>
                                  <span className={`status-pill ${hasFailed ? 'failed' : 'success'}`} style={{ fontSize: '10px' }}>
                                    {hasFailed ? 'Failed / Blocked' : 'Success (200 OK)'}
                                  </span>
                                </div>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingLeft: '8px', borderLeft: '2px dashed var(--border-color)' }}>
                                  {group.steps.map((subStep, sIdx) => {
                                    // Make sub-step action label cleaner
                                    let cleanAction = subStep.action;
                                    if (cleanAction === 'Tool Security Verification') cleanAction = '🔐 Role Permission Access Vetted';
                                    if (cleanAction === 'Tool Parameters Validation') cleanAction = '📋 Parameters Validated';
                                    if (cleanAction === 'Executing Tool API Call') cleanAction = '🌐 Transmitted API Payload';
                                    if (cleanAction === 'Executed Tool Successfully') cleanAction = '✅ API Response Output';
                                    if (cleanAction === 'Tool Execution Failed') cleanAction = '❌ API Execution Failure';

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
                  const isAuthorized = tool.requiredPermissions.includes(role);
                  const isExpanded = expandedTool === tool.name;
                  
                  return (
                    <div key={tool.name} className="tool-card animate-fade-in">
                      <div className="tool-card-header">
                        <span className="tool-dept-badge">{tool.department}</span>
                        <span className={`tool-auth-badge ${isAuthorized ? 'authorized' : 'unauthorized'}`}>
                          {isAuthorized ? 'Authorized' : 'Locked'}
                        </span>
                      </div>
                      
                      <h4 className="tool-card-title">{tool.title}</h4>
                      <div className="tool-card-name">{tool.name}</div>
                      <p className="tool-card-desc">{tool.description}</p>
                      
                      <button 
                        className="tool-card-expand-btn"
                        onClick={() => setExpandedTool(isExpanded ? null : tool.name)}
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
                            {tool.requiredPermissions.map((perm, pIdx) => (
                              <span key={pIdx} className={`badge ${role === perm ? 'primary' : ''}`}>
                                {perm}
                              </span>
                            ))}
                          </div>

                          <div className="schema-section-title">Input Parameters</div>
                          {Object.keys(tool.inputSchema).length === 0 ? (
                            <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '8px' }}>No parameters required.</div>
                          ) : (
                            Object.entries(tool.inputSchema).map(([pName, pMeta]) => (
                              <div key={pName} className="schema-param-row">
                                <div className="schema-param-header">
                                  <span className="schema-param-name">{pName}</span>
                                  <span className="schema-param-type">({pMeta.type})</span>
                                  {pMeta.required && <span className="schema-param-req">*required</span>}
                                </div>
                                <div className="schema-param-desc">{pMeta.description}</div>
                                {pMeta.enum && (
                                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                                    Allowed options: {pMeta.enum.map(e => `"${e}"`).join(', ')}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================= ANALYTICS TAB ================= */}
          {activeTab === 'logs' && (
            <div>
              {/* Stats overview cards */}
              <div className="analytics-stats-grid">
                <div className="stat-card">
                  <div className="stat-icon">
                    <Activity size={24} />
                  </div>
                  <div className="stat-content">
                    <span className="stat-label">Total Simulated Queries</span>
                    <span className="stat-value">{totalQueries}</span>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon" style={{ backgroundColor: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
                    <Clock size={24} />
                  </div>
                  <div className="stat-content">
                    <span className="stat-label">Average Response Latency</span>
                    <span className="stat-value">{averageLatency}ms</span>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon" style={{ backgroundColor: 'var(--color-success-light)', color: 'var(--color-success)' }}>
                    <CheckCircle2 size={24} />
                  </div>
                  <div className="stat-content">
                    <span className="stat-label">Transaction Success Rate</span>
                    <span className="stat-value">{successRate}%</span>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon" style={{ backgroundColor: 'var(--color-error-light)', color: 'var(--color-error)' }}>
                    <Lock size={24} />
                  </div>
                  <div className="stat-content">
                    <span className="stat-label">RBAC Security Blocks</span>
                    <span className="stat-value">{blockedRequests}</span>
                  </div>
                </div>
              </div>

              <h3 style={{ fontWeight: 700, fontSize: '16px', marginBottom: '14px' }}>Transaction History Audit Logs</h3>
              
              <div className="logs-table-container">
                <table className="logs-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Query</th>
                      <th>User Role</th>
                      <th>Department Route</th>
                      <th>Confidence</th>
                      <th>Latency</th>
                      <th>Tools Executed</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                          No audit logs recorded yet. Execute queries in the Chat tab to start logging.
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => (
                        <tr 
                          key={log.id} 
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelectedAuditLog(log)}
                          title="Click to view execution details"
                        >
                          <td>{new Date(log.timestamp).toLocaleTimeString()}</td>
                          <td style={{ fontWeight: 600, maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {log.query}
                          </td>
                          <td>
                            <span className="badge">{log.role}</span>
                          </td>
                          <td>
                            <span className="badge secondary">{log.department}</span>
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{(log.confidence * 100).toFixed(0)}%</td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{log.durationMs}ms</td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>{log.toolCallsCount}</td>
                          <td>
                            <span className={`status-pill ${log.success ? 'success' : 'failed'}`}>
                              {log.success ? 'Success' : 'Blocked/Failed'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* LOG OVERLAY MODAL */}
              {selectedAuditLog && (
                <div style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 100,
                  padding: '24px'
                }}
                onClick={() => setSelectedAuditLog(null)}
                >
                  <div style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: '16px',
                    width: '100%',
                    maxWidth: '650px',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    padding: '24px',
                    boxShadow: 'var(--shadow-lg)'
                  }}
                  onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '20px' }}>
                      <h4 style={{ fontWeight: 800, fontSize: '16px' }}>Audit Log ID: {selectedAuditLog.id}</h4>
                      <button 
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold' }}
                        onClick={() => setSelectedAuditLog(null)}
                      >
                        &times;
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px', fontSize: '13px' }}>
                      <div><strong>User Query:</strong> "{selectedAuditLog.query}"</div>
                      <div><strong>Executed By:</strong> {selectedAuditLog.userName} ({selectedAuditLog.role})</div>
                      <div><strong>Routing Mode:</strong> {selectedAuditLog.routerType} Router</div>
                      <div><strong>Department Route:</strong> {selectedAuditLog.department}</div>
                      <div><strong>Confidence Level:</strong> {(selectedAuditLog.confidence * 100).toFixed(1)}%</div>
                      <div><strong>Total Latency:</strong> {selectedAuditLog.durationMs}ms</div>
                    </div>

                    <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '10px' }}>Simulation Timeline Steps:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {selectedAuditLog.traceSteps.map((step, sIdx) => (
                        <div key={sIdx} style={{ display: 'flex', gap: '12px', fontSize: '13px' }}>
                          <span style={{ 
                            width: '12px', 
                            height: '12px', 
                            borderRadius: '50%', 
                            backgroundColor: step.status === 'success' ? 'var(--color-success)' : step.status === 'error' ? 'var(--color-error)' : step.status === 'warning' ? 'var(--color-warning)' : 'var(--color-info)',
                            marginTop: '4px',
                            flexShrink: 0
                          }} />
                          <div>
                            <div style={{ fontWeight: 700 }}>{step.action} &middot; <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{step.target}</span></div>
                            <div style={{ color: 'var(--text-secondary)', marginTop: '2px', wordBreak: 'break-all' }}>{step.details}</div>
                            
                            {(step.details.startsWith('{') || step.details.startsWith('[')) && (
                              <pre style={{
                                backgroundColor: '#1E293B',
                                color: '#E2E8F0',
                                padding: '10px',
                                borderRadius: '6px',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '11px',
                                overflowX: 'auto',
                                marginTop: '6px',
                                whiteSpace: 'pre-wrap'
                              }}>
                                {JSON.stringify(JSON.parse(step.details), null, 2)}
                              </pre>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= SETTINGS TAB ================= */}
          {activeTab === 'settings' && (
            <div className="settings-container animate-fade-in">
              <div className="settings-section">
                <h3 className="settings-title">Active AI Routing Model</h3>
                <p className="settings-description">
                  Choose between the fast local semantic matcher or Claude LLM orchestration.
                </p>
                <div className="settings-toggle-group">
                  <button 
                    className={`settings-toggle-btn ${routerType === 'Local' ? 'active' : ''}`}
                    onClick={() => setRouterType('Local')}
                  >
                    Local Semantic Router
                  </button>
                  <button 
                    className={`settings-toggle-btn ${routerType === 'Claude' ? 'active' : ''}`}
                    onClick={() => setRouterType('Claude')}
                  >
                    Claude AI Router
                  </button>
                </div>
              </div>

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

              {routerType === 'Claude' && (
                <div className="settings-section animate-fade-in">
                  <h3 className="settings-title">Anthropic API Key</h3>
                  <p className="settings-description">
                    Provide your Claude API Key. This will be transmitted dynamically in requests and is NOT saved persistently to any server.
                  </p>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ position: 'relative', flexGrow: 1 }}>
                      <Key style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} size={16} />
                      <input 
                        type="password" 
                        className="input-field"
                        style={{ paddingLeft: '38px' }}
                        placeholder="sk-ant-..."
                        value={claudeApiKey}
                        onChange={(e) => setClaudeApiKey(e.target.value)}
                      />
                    </div>
                  </div>
                  {claudeApiKey ? (
                    <div style={{ color: 'var(--color-success)', fontSize: '12px', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={12} /> Active API Key Loaded.
                    </div>
                  ) : (
                    <div style={{ color: 'var(--color-warning)', fontSize: '12px', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <AlertTriangle size={12} /> Key missing. Claude routing will fallback to the Local Semantic Router.
                    </div>
                  )}

                  {/* Claude Model Selection Dropdown */}
                  <div style={{ marginTop: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                      Claude Model Selection
                    </label>
                    <select 
                      className="role-select" 
                      value={claudeModel} 
                      onChange={(e) => setClaudeModel(e.target.value)}
                      style={{ maxWidth: '350px' }}
                    >
                      <option value="claude-3-5-sonnet-latest">claude-3-5-sonnet-latest (Recommended)</option>
                      <option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet-20241022 (New Sonnet)</option>
                      <option value="claude-3-5-sonnet-20240620">claude-3-5-sonnet-20240620 (Original Sonnet)</option>
                      <option value="claude-3-5-haiku-20241022">claude-3-5-haiku-20241022 (New Haiku)</option>
                      <option value="claude-3-haiku-20240307">claude-3-haiku-20240307 (Legacy Haiku)</option>
                      <option value="claude-3-opus-20240229">claude-3-opus-20240229 (Opus)</option>
                    </select>
                  </div>
                </div>
              )}

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
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
