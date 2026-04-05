import React, { useState } from 'react';

/* ─────────────────────────────────────────────
   Infinity OS — AI Builder
   Custom AI creation, plugin management, model
   connections, function registry, conversation
   testing, and strategy configuration.
   Zero vendor lock-in: connect any provider.
   ───────────────────────────────────────────── */

interface AIModel {
  id: string;
  provider: string;
  providerIcon: string;
  name: string;
  type: 'chat' | 'embedding' | 'image' | 'audio' | 'code' | 'multimodal';
  contextWindow: string;
  costPer1kTokens: string;
  status: 'active' | 'inactive' | 'rate-limited';
  latencyMs: number;
  description: string;
}

interface AIPlugin {
  id: string;
  name: string;
  icon: string;
  description: string;
  version: string;
  author: string;
  category: 'tool' | 'memory' | 'retrieval' | 'output' | 'guard' | 'transform';
  enabled: boolean;
  functions: string[];
  config: Record<string, string>;
}

interface CustomAI {
  id: string;
  name: string;
  icon: string;
  description: string;
  baseModel: string;
  plugins: string[];
  functions: string[];
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  strategy: 'direct' | 'chain-of-thought' | 'react' | 'tree-of-thought' | 'self-consistency';
  guardrails: string[];
  status: 'active' | 'draft' | 'testing';
  createdAt: string;
  totalInvocations: number;
  avgLatencyMs: number;
  successRate: number;
}

interface AIFunction {
  id: string;
  name: string;
  description: string;
  parameters: { name: string; type: string; required: boolean; description: string }[];
  returnType: string;
  category: 'data' | 'action' | 'query' | 'transform' | 'external';
  policyGated: boolean;
}

interface ConversationMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  functionName?: string;
  timestamp: string;
  tokens?: number;
  latencyMs?: number;
}

const MODELS: AIModel[] = [
  { id: 'm1', provider: 'OpenAI', providerIcon: '🧠', name: 'GPT-4o', type: 'multimodal', contextWindow: '128K', costPer1kTokens: '$0.005', status: 'active', latencyMs: 320, description: 'Latest multimodal model with vision, audio, and tool use capabilities' },
  { id: 'm2', provider: 'OpenAI', providerIcon: '🧠', name: 'GPT-4o-mini', type: 'chat', contextWindow: '128K', costPer1kTokens: '$0.00015', status: 'active', latencyMs: 180, description: 'Cost-efficient model for most tasks with strong reasoning' },
  { id: 'm3', provider: 'Anthropic', providerIcon: '🔮', name: 'Claude 3.5 Sonnet', type: 'chat', contextWindow: '200K', costPer1kTokens: '$0.003', status: 'active', latencyMs: 280, description: 'Advanced reasoning with constitutional AI safety and extended context' },
  { id: 'm4', provider: 'Anthropic', providerIcon: '🔮', name: 'Claude 3.5 Haiku', type: 'chat', contextWindow: '200K', costPer1kTokens: '$0.00025', status: 'active', latencyMs: 120, description: 'Fast and efficient for high-throughput tasks' },
  { id: 'm5', provider: 'Google', providerIcon: '🌐', name: 'Gemini 2.0 Flash', type: 'multimodal', contextWindow: '1M', costPer1kTokens: '$0.0001', status: 'active', latencyMs: 150, description: 'Ultra-fast multimodal with million-token context window' },
  { id: 'm6', provider: 'Meta', providerIcon: '🦙', name: 'Llama 3.3 70B', type: 'chat', contextWindow: '128K', costPer1kTokens: '$0.00', status: 'active', latencyMs: 450, description: 'Open-weight model, self-hosted on Oracle Always Free ARM instances' },
  { id: 'm7', provider: 'Mistral', providerIcon: '🌬️', name: 'Mixtral 8x22B', type: 'chat', contextWindow: '64K', costPer1kTokens: '$0.00', status: 'inactive', latencyMs: 380, description: 'Open-weight MoE model for diverse task handling' },
  { id: 'm8', provider: 'OpenAI', providerIcon: '🧠', name: 'text-embedding-3-large', type: 'embedding', contextWindow: '8K', costPer1kTokens: '$0.00013', status: 'active', latencyMs: 45, description: 'High-dimensional embeddings for semantic search and RAG' },
  { id: 'm9', provider: 'Cloudflare', providerIcon: '☁️', name: 'Workers AI (Llama)', type: 'chat', contextWindow: '4K', costPer1kTokens: '$0.00', status: 'active', latencyMs: 200, description: 'Free-tier inference on Cloudflare edge network — zero cost' },
];

const PLUGINS: AIPlugin[] = [
  { id: 'p1', name: 'Web Search', icon: '🔍', description: 'Search the web and extract content from URLs for grounded responses', version: '2.1.0', author: 'infinity-os', category: 'retrieval', enabled: true, functions: ['web_search', 'scrape_url', 'extract_content'], config: { engine: 'duckduckgo', maxResults: '10' } },
  { id: 'p2', name: 'Vector Memory', icon: '🧬', description: 'Long-term vector memory with semantic retrieval using pgvector', version: '1.4.0', author: 'infinity-os', category: 'memory', enabled: true, functions: ['memory_store', 'memory_recall', 'memory_forget'], config: { dimensions: '1536', similarity: 'cosine' } },
  { id: 'p3', name: 'Code Executor', icon: '⚡', description: 'Execute code in WASM sandboxes with resource limits and output capture', version: '1.2.0', author: 'infinity-os', category: 'tool', enabled: true, functions: ['execute_code', 'install_package', 'read_output'], config: { runtime: 'wasm', timeout: '30s', memoryLimit: '256MB' } },
  { id: 'p4', name: 'File System', icon: '📁', description: 'Read, write, and manage files in Cloudflare R2 object storage', version: '1.0.0', author: 'infinity-os', category: 'tool', enabled: true, functions: ['read_file', 'write_file', 'list_files', 'delete_file'], config: { bucket: 'infinity-fs', maxSize: '100MB' } },
  { id: 'p5', name: 'Policy Guard', icon: '🛡️', description: 'Rust/WASM policy engine for deterministic action gating and safety', version: '3.0.0', author: 'infinity-os', category: 'guard', enabled: true, functions: ['check_policy', 'audit_action', 'enforce_limit'], config: { engine: 'rust-wasm', strictMode: 'true' } },
  { id: 'p6', name: 'Output Formatter', icon: '📝', description: 'Transform AI outputs into structured formats: JSON, Markdown, HTML, CSV', version: '1.1.0', author: 'infinity-os', category: 'transform', enabled: false, functions: ['format_json', 'format_markdown', 'format_html', 'format_csv'], config: { defaultFormat: 'markdown' } },
  { id: 'p7', name: 'Database Query', icon: '🗄️', description: 'Execute read-only SQL queries against Supabase PostgreSQL with RLS', version: '1.3.0', author: 'infinity-os', category: 'tool', enabled: true, functions: ['query_sql', 'describe_table', 'list_tables'], config: { readOnly: 'true', timeout: '10s' } },
  { id: 'p8', name: 'Image Generator', icon: '🎨', description: 'Generate and edit images using connected AI image models', version: '1.0.0', author: 'infinity-os', category: 'output', enabled: false, functions: ['generate_image', 'edit_image', 'describe_image'], config: { defaultSize: '1024x1024', format: 'png' } },
];

const CUSTOM_AIS: CustomAI[] = [
  {
    id: 'ai1', name: 'InfinityAssist', icon: '🤖', description: 'General-purpose assistant for Infinity OS with full system access',
    baseModel: 'GPT-4o', plugins: ['p1', 'p2', 'p3', 'p4', 'p5', 'p7'],
    functions: ['web_search', 'memory_store', 'memory_recall', 'execute_code', 'read_file', 'write_file', 'query_sql'],
    systemPrompt: 'You are InfinityAssist, the primary AI assistant for Infinity OS. You have access to the filesystem, database, code execution, and web search. Always verify actions through the policy engine before executing.',
    temperature: 0.7, maxTokens: 4096, strategy: 'react',
    guardrails: ['No destructive file operations without confirmation', 'SQL queries must be read-only', 'Code execution limited to WASM sandbox', 'PII must be redacted from logs'],
    status: 'active', createdAt: '2025-01-15T10:00:00Z', totalInvocations: 12847, avgLatencyMs: 1250, successRate: 98.7
  },
  {
    id: 'ai2', name: 'SecurityBot', icon: '🛡️', description: 'Automated security scanning, CVE analysis, and incident response',
    baseModel: 'Claude 3.5 Sonnet', plugins: ['p1', 'p5', 'p7'],
    functions: ['web_search', 'check_policy', 'audit_action', 'query_sql'],
    systemPrompt: 'You are SecurityBot, responsible for continuous security monitoring of Infinity OS. Analyze CVEs, audit configurations, and recommend remediations. Never execute fixes without human approval.',
    temperature: 0.2, maxTokens: 8192, strategy: 'chain-of-thought',
    guardrails: ['Never auto-apply security patches', 'Escalate critical CVEs to PagerDuty', 'All findings must include CVSS score', 'Maintain audit trail for ISO 27001'],
    status: 'active', createdAt: '2025-01-20T14:00:00Z', totalInvocations: 5623, avgLatencyMs: 2100, successRate: 99.2
  },
  {
    id: 'ai3', name: 'CodeReviewer', icon: '👁️', description: 'Automated code review with security, performance, and style analysis',
    baseModel: 'GPT-4o', plugins: ['p3', 'p5'],
    functions: ['execute_code', 'check_policy'],
    systemPrompt: 'You are CodeReviewer. Analyze pull requests for security vulnerabilities, performance issues, code style violations, and architectural concerns. Provide actionable feedback with code examples.',
    temperature: 0.3, maxTokens: 4096, strategy: 'chain-of-thought',
    guardrails: ['Focus on security issues first', 'Never approve PRs automatically', 'Flag any hardcoded secrets', 'Check for WCAG 2.2 AA compliance in UI code'],
    status: 'active', createdAt: '2025-02-01T09:00:00Z', totalInvocations: 3421, avgLatencyMs: 1800, successRate: 97.5
  },
  {
    id: 'ai4', name: 'DataAnalyst', icon: '📊', description: 'Data analysis, visualization generation, and report creation',
    baseModel: 'Gemini 2.0 Flash', plugins: ['p2', 'p4', 'p6', 'p7'],
    functions: ['memory_recall', 'read_file', 'write_file', 'format_json', 'format_csv', 'query_sql'],
    systemPrompt: 'You are DataAnalyst. Query databases, analyze datasets, generate visualizations, and create reports. Use SQL for data extraction and Python for analysis. Always cite data sources.',
    temperature: 0.4, maxTokens: 16384, strategy: 'react',
    guardrails: ['SQL queries must be read-only', 'No PII in generated reports', 'Include data freshness timestamps', 'Validate statistical claims'],
    status: 'testing', createdAt: '2025-02-15T11:00:00Z', totalInvocations: 892, avgLatencyMs: 950, successRate: 95.8
  },
  {
    id: 'ai5', name: 'IncomeBot', icon: '💰', description: 'Passive income agent: content generation, SEO optimization, and monetization',
    baseModel: 'GPT-4o-mini', plugins: ['p1', 'p2', 'p4', 'p6'],
    functions: ['web_search', 'memory_store', 'memory_recall', 'write_file', 'format_markdown', 'format_html'],
    systemPrompt: 'You are IncomeBot, an autonomous agent focused on generating passive income through content creation, SEO optimization, and digital product development. Track all earnings and report weekly.',
    temperature: 0.8, maxTokens: 4096, strategy: 'tree-of-thought',
    guardrails: ['No spam or black-hat SEO', 'Content must be original', 'Disclose AI-generated content', 'Maximum $0 infrastructure cost'],
    status: 'draft', createdAt: '2025-03-01T16:00:00Z', totalInvocations: 0, avgLatencyMs: 0, successRate: 0
  },
];

const FUNCTIONS: AIFunction[] = [
  { id: 'f1', name: 'web_search', description: 'Search the web using DuckDuckGo and return structured results', parameters: [{ name: 'query', type: 'string', required: true, description: 'Search query' }, { name: 'maxResults', type: 'number', required: false, description: 'Maximum results (default: 10)' }], returnType: 'SearchResult[]', category: 'query', policyGated: false },
  { id: 'f2', name: 'execute_code', description: 'Execute code in a WASM sandbox with resource limits', parameters: [{ name: 'language', type: 'string', required: true, description: 'Programming language' }, { name: 'code', type: 'string', required: true, description: 'Source code to execute' }, { name: 'timeout', type: 'number', required: false, description: 'Timeout in seconds' }], returnType: 'ExecutionResult', category: 'action', policyGated: true },
  { id: 'f3', name: 'read_file', description: 'Read a file from Cloudflare R2 storage', parameters: [{ name: 'path', type: 'string', required: true, description: 'File path in R2' }], returnType: 'FileContent', category: 'query', policyGated: false },
  { id: 'f4', name: 'write_file', description: 'Write content to a file in R2 storage', parameters: [{ name: 'path', type: 'string', required: true, description: 'File path' }, { name: 'content', type: 'string', required: true, description: 'File content' }], returnType: 'WriteResult', category: 'action', policyGated: true },
  { id: 'f5', name: 'query_sql', description: 'Execute read-only SQL against Supabase PostgreSQL', parameters: [{ name: 'sql', type: 'string', required: true, description: 'SQL query (SELECT only)' }], returnType: 'QueryResult', category: 'query', policyGated: true },
  { id: 'f6', name: 'memory_store', description: 'Store a memory vector with metadata for later retrieval', parameters: [{ name: 'content', type: 'string', required: true, description: 'Content to memorize' }, { name: 'tags', type: 'string[]', required: false, description: 'Tags for filtering' }], returnType: 'MemoryId', category: 'action', policyGated: false },
  { id: 'f7', name: 'memory_recall', description: 'Semantically search stored memories', parameters: [{ name: 'query', type: 'string', required: true, description: 'Search query' }, { name: 'limit', type: 'number', required: false, description: 'Max results' }], returnType: 'Memory[]', category: 'query', policyGated: false },
  { id: 'f8', name: 'check_policy', description: 'Validate an action against the Rust/WASM policy engine', parameters: [{ name: 'action', type: 'string', required: true, description: 'Action to validate' }, { name: 'context', type: 'object', required: true, description: 'Action context' }], returnType: 'PolicyDecision', category: 'query', policyGated: false },
  { id: 'f9', name: 'send_notification', description: 'Send a notification through the notification worker', parameters: [{ name: 'channel', type: 'string', required: true, description: 'Channel: in-app, push, email, slack' }, { name: 'message', type: 'string', required: true, description: 'Notification message' }], returnType: 'NotificationResult', category: 'action', policyGated: true },
  { id: 'f10', name: 'generate_image', description: 'Generate an image using a connected image model', parameters: [{ name: 'prompt', type: 'string', required: true, description: 'Image description' }, { name: 'size', type: 'string', required: false, description: 'Image dimensions' }], returnType: 'ImageResult', category: 'action', policyGated: true },
];

const statusColor = (s: string) => s === 'active' ? '#2ea043' : s === 'testing' ? '#d29922' : s === 'draft' ? '#8b949e' : s === 'rate-limited' ? '#d29922' : s === 'inactive' ? '#8b949e' : '#f85149';
const categoryColor = (c: string) => c === 'tool' ? '#58a6ff' : c === 'memory' ? '#a371f7' : c === 'retrieval' ? '#2ea043' : c === 'output' ? '#d29922' : c === 'guard' ? '#f85149' : '#8b949e';

export default function AIBuilder() {
  const [tab, setTab] = useState<'custom' | 'models' | 'plugins' | 'functions' | 'playground'>('custom');
  const [selectedAI, setSelectedAI] = useState<string | null>(null);
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);
  const [expandedFunction, setExpandedFunction] = useState<string | null>(null);
  const [playgroundModel, setPlaygroundModel] = useState('GPT-4o');
  const [playgroundInput, setPlaygroundInput] = useState('');
  const [playgroundMessages, setPlaygroundMessages] = useState<ConversationMessage[]>([
    { role: 'system', content: 'You are InfinityAssist, the primary AI assistant for Infinity OS.', timestamp: new Date().toISOString() },
  ]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAI, setNewAI] = useState({ name: '', description: '', baseModel: 'GPT-4o', strategy: 'react', temperature: 0.7 });

  const handleSendMessage = () => {
    if (!playgroundInput.trim()) return;
    const userMsg: ConversationMessage = { role: 'user', content: playgroundInput, timestamp: new Date().toISOString() };
    setPlaygroundMessages(prev => [...prev, userMsg]);
    setPlaygroundInput('');

    setTimeout(() => {
      const assistantMsg: ConversationMessage = {
        role: 'assistant',
        content: `I've processed your request using ${playgroundModel}. In a production environment, this would route through the AI Worker on Cloudflare, apply policy engine checks via the Rust/WASM gate, and return a streamed response. The response would include function calls if any registered tools are relevant to your query.`,
        timestamp: new Date().toISOString(),
        tokens: 87,
        latencyMs: 340,
      };
      setPlaygroundMessages(prev => [...prev, assistantMsg]);
    }, 800);
  };

  const st: Record<string, React.CSSProperties> = {
    container: { padding: '24px', maxWidth: 1400, margin: '0 auto', fontFamily: 'var(--font-family, "Inter", system-ui, sans-serif)', color: 'var(--text-primary, #e6edf3)' },
    header: { marginBottom: 24 },
    title: { fontSize: 28, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 },
    subtitle: { color: 'var(--text-secondary, #8b949e)', marginTop: 4, fontSize: 14 },
    summaryRow: { display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' as const },
    summaryCard: { flex: '1 1 160px', background: 'var(--surface-primary, #161b22)', border: '1px solid var(--border-primary, #30363d)', borderRadius: 10, padding: '14px 18px' },
    summaryLabel: { fontSize: 11, color: 'var(--text-secondary, #8b949e)', textTransform: 'uppercase' as const, letterSpacing: 1 },
    summaryValue: { fontSize: 26, fontWeight: 700, marginTop: 2 },
    tabs: { display: 'flex', gap: 0, borderBottom: '1px solid var(--border-primary, #30363d)', marginBottom: 20 },
    tab: { padding: '10px 18px', cursor: 'pointer', border: 'none', background: 'none', color: 'var(--text-secondary, #8b949e)', fontSize: 13, fontWeight: 500, borderBottom: '2px solid transparent', transition: 'all 0.2s' },
    tabActive: { color: 'var(--accent-primary, #58a6ff)', borderBottomColor: 'var(--accent-primary, #58a6ff)' },
    card: { background: 'var(--surface-primary, #161b22)', border: '1px solid var(--border-primary, #30363d)', borderRadius: 12, padding: 20, marginBottom: 12, transition: 'border-color 0.2s' },
    cardHeader: { display: 'flex', alignItems: 'center', gap: 12 },
    badge: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 },
    btn: { padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.2s' },
    btnPrimary: { background: 'var(--accent-primary, #58a6ff)', color: '#fff' },
    btnSecondary: { background: 'var(--surface-secondary, #0d1117)', color: 'var(--text-primary, #e6edf3)', border: '1px solid var(--border-primary, #30363d)' },
    btnDanger: { background: '#f8514922', color: '#f85149', border: '1px solid #f8514944' },
    btnSuccess: { background: '#2ea04322', color: '#2ea043', border: '1px solid #2ea04344' },
    tag: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, marginRight: 4, marginBottom: 4, fontFamily: 'monospace' },
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
    th: { textAlign: 'left' as const, padding: '10px 14px', borderBottom: '1px solid var(--border-primary, #30363d)', color: 'var(--text-secondary, #8b949e)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
    td: { padding: '10px 14px', borderBottom: '1px solid var(--border-primary, #30363d)' },
    input: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-primary, #30363d)', background: 'var(--surface-secondary, #0d1117)', color: 'var(--text-primary, #e6edf3)', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const },
    textarea: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-primary, #30363d)', background: 'var(--surface-secondary, #0d1117)', color: 'var(--text-primary, #e6edf3)', fontSize: 13, outline: 'none', resize: 'vertical' as const, fontFamily: 'monospace', minHeight: 80, boxSizing: 'border-box' as const },
    select: { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-primary, #30363d)', background: 'var(--surface-secondary, #0d1117)', color: 'var(--text-primary, #e6edf3)', fontSize: 13, outline: 'none' },
    chatContainer: { display: 'flex', flexDirection: 'column' as const, height: 500, background: 'var(--surface-secondary, #0d1117)', border: '1px solid var(--border-primary, #30363d)', borderRadius: 12, overflow: 'hidden' },
    chatMessages: { flex: 1, overflowY: 'auto' as const, padding: 16 },
    chatInput: { display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--border-primary, #30363d)', background: 'var(--surface-primary, #161b22)' },
    msgBubble: { padding: '10px 14px', borderRadius: 10, marginBottom: 8, maxWidth: '80%', lineHeight: 1.5, fontSize: 13 },
  };

  const renderCustomAIs = () => (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 14, color: 'var(--text-secondary, #8b949e)' }}>{CUSTOM_AIS.length} custom AIs configured</span>
        <button style={{ ...st.btn, ...st.btnPrimary }} onClick={() => setShowCreateForm(!showCreateForm)}>
          {showCreateForm ? '✕ Cancel' : '+ Create New AI'}
        </button>
      </div>

      {showCreateForm && (
        <div style={{ ...st.card, borderColor: 'var(--accent-primary, #58a6ff)', marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>🧪 Create Custom AI</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary, #8b949e)', display: 'block', marginBottom: 4 }}>Name</label>
              <input style={st.input} value={newAI.name} onChange={e => setNewAI(p => ({ ...p, name: e.target.value }))} placeholder="My Custom AI" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary, #8b949e)', display: 'block', marginBottom: 4 }}>Base Model</label>
              <select style={{ ...st.select, width: '100%' }} value={newAI.baseModel} onChange={e => setNewAI(p => ({ ...p, baseModel: e.target.value }))}>
                {MODELS.filter(m => m.type === 'chat' || m.type === 'multimodal').map(m => (
                  <option key={m.id} value={m.name}>{m.providerIcon} {m.name} ({m.provider})</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary, #8b949e)', display: 'block', marginBottom: 4 }}>Strategy</label>
              <select style={{ ...st.select, width: '100%' }} value={newAI.strategy} onChange={e => setNewAI(p => ({ ...p, strategy: e.target.value }))}>
                <option value="direct">Direct</option>
                <option value="chain-of-thought">Chain of Thought</option>
                <option value="react">ReAct (Reason + Act)</option>
                <option value="tree-of-thought">Tree of Thought</option>
                <option value="self-consistency">Self-Consistency</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary, #8b949e)', display: 'block', marginBottom: 4 }}>Temperature: {newAI.temperature}</label>
              <input type="range" min="0" max="1" step="0.1" value={newAI.temperature} onChange={e => setNewAI(p => ({ ...p, temperature: parseFloat(e.target.value) }))} style={{ width: '100%' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary, #8b949e)', display: 'block', marginBottom: 4 }}>Description</label>
              <input style={st.input} value={newAI.description} onChange={e => setNewAI(p => ({ ...p, description: e.target.value }))} placeholder="What does this AI do?" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button style={{ ...st.btn, ...st.btnPrimary }}>Create AI</button>
            <button style={{ ...st.btn, ...st.btnSecondary }} onClick={() => setShowCreateForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {CUSTOM_AIS.map(ai => {
        const expanded = selectedAI === ai.id;
        return (
          <div
            key={ai.id}
            style={{ ...st.card, cursor: 'pointer', borderColor: expanded ? 'var(--accent-primary, #58a6ff)' : undefined }}
            onClick={() => setSelectedAI(expanded ? null : ai.id)}
          >
            <div style={{ ...st.cardHeader, marginBottom: 12 }}>
              <span style={{ fontSize: 32 }}>{ai.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{ai.name}</h3>
                  <span style={{ ...st.badge, background: statusColor(ai.status) + '18', color: statusColor(ai.status) }}>
                    {ai.status}
                  </span>
                </div>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-secondary, #8b949e)' }}>{ai.description}</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--text-secondary, #8b949e)', flexWrap: 'wrap' }}>
              <span>🧠 {ai.baseModel}</span>
              <span>🎯 {ai.strategy}</span>
              <span>🔌 {ai.plugins.length} plugins</span>
              <span>⚡ {ai.functions.length} functions</span>
              <span>🌡️ {ai.temperature}</span>
              {ai.totalInvocations > 0 && (
                <>
                  <span>📊 {ai.totalInvocations.toLocaleString()} calls</span>
                  <span>⏱️ {ai.avgLatencyMs}ms avg</span>
                  <span style={{ color: ai.successRate > 98 ? '#2ea043' : ai.successRate > 95 ? '#d29922' : '#f85149' }}>
                    ✓ {ai.successRate}%
                  </span>
                </>
              )}
            </div>

            {expanded && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-primary, #30363d)' }}>
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ fontSize: 12, color: 'var(--text-secondary, #8b949e)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>System Prompt</h4>
                  <div style={{ padding: 12, background: 'var(--surface-secondary, #0d1117)', borderRadius: 8, fontSize: 12, fontFamily: 'monospace', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {ai.systemPrompt}
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ fontSize: 12, color: 'var(--text-secondary, #8b949e)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Guardrails</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {ai.guardrails.map((g, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <span style={{ color: '#f85149' }}>🛡️</span>
                        <span>{g}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ fontSize: 12, color: 'var(--text-secondary, #8b949e)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Registered Functions</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {ai.functions.map(f => (
                      <span key={f} style={{ ...st.tag, background: '#388bfd26', color: '#58a6ff' }}>{f}()</span>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 12 }} onClick={e => e.stopPropagation()}>
                  <button style={{ ...st.btn, ...st.btnPrimary }}>🧪 Test in Playground</button>
                  <button style={{ ...st.btn, ...st.btnSecondary }}>✏️ Edit</button>
                  <button style={{ ...st.btn, ...st.btnSecondary }}>📋 Duplicate</button>
                  <button style={{ ...st.btn, ...st.btnSecondary }}>📊 Analytics</button>
                  {ai.status === 'draft' && <button style={{ ...st.btn, ...st.btnSuccess }}>🚀 Deploy</button>}
                  <button style={{ ...st.btn, ...st.btnDanger }}>🗑️ Delete</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );

  const renderModels = () => (
    <div style={{ background: 'var(--surface-primary, #161b22)', border: '1px solid var(--border-primary, #30363d)', borderRadius: 12, overflow: 'hidden' }}>
      <table style={st.table}>
        <thead>
          <tr>
            <th style={st.th}>Provider</th>
            <th style={st.th}>Model</th>
            <th style={st.th}>Type</th>
            <th style={st.th}>Context</th>
            <th style={st.th}>Cost/1K</th>
            <th style={st.th}>Latency</th>
            <th style={st.th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {MODELS.map(m => (
            <tr key={m.id}>
              <td style={st.td}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{m.providerIcon}</span>
                  <span style={{ fontWeight: 500 }}>{m.provider}</span>
                </span>
              </td>
              <td style={{ ...st.td, fontWeight: 600 }}>{m.name}</td>
              <td style={st.td}>
                <span style={{ ...st.badge, background: 'var(--surface-secondary, #0d1117)', fontSize: 10 }}>{m.type}</span>
              </td>
              <td style={{ ...st.td, fontFamily: 'monospace', fontSize: 12 }}>{m.contextWindow}</td>
              <td style={{ ...st.td, fontFamily: 'monospace', fontSize: 12, color: m.costPer1kTokens === '$0.00' ? '#2ea043' : 'inherit' }}>
                {m.costPer1kTokens === '$0.00' ? '🆓 FREE' : m.costPer1kTokens}
              </td>
              <td style={{ ...st.td, fontSize: 12 }}>
                <span style={{ color: m.latencyMs < 200 ? '#2ea043' : m.latencyMs < 400 ? '#d29922' : '#f85149' }}>
                  {m.latencyMs}ms
                </span>
              </td>
              <td style={st.td}>
                <span style={{ ...st.badge, background: statusColor(m.status) + '18', color: statusColor(m.status) }}>
                  {m.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ padding: 16, borderTop: '1px solid var(--border-primary, #30363d)', fontSize: 12, color: 'var(--text-secondary, #8b949e)' }}>
        💡 Zero vendor lock-in: Models are accessed through a unified adapter layer. Switch providers without code changes.
        Self-hosted models (Llama, Mixtral) run on Oracle Always Free ARM instances at $0/month.
        Cloudflare Workers AI provides free-tier inference at the edge.
      </div>
    </div>
  );

  const renderPlugins = () => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>
        {PLUGINS.map(plugin => {
          const expanded = expandedPlugin === plugin.id;
          return (
            <div
              key={plugin.id}
              style={{ ...st.card, cursor: 'pointer', borderColor: expanded ? 'var(--accent-primary, #58a6ff)' : undefined, opacity: plugin.enabled ? 1 : 0.6 }}
              onClick={() => setExpandedPlugin(expanded ? null : plugin.id)}
            >
              <div style={{ ...st.cardHeader, marginBottom: 10 }}>
                <span style={{ fontSize: 28 }}>{plugin.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{plugin.name}</h3>
                    <span style={{ ...st.badge, background: categoryColor(plugin.category) + '18', color: categoryColor(plugin.category), fontSize: 10 }}>
                      {plugin.category}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary, #8b949e)' }}>v{plugin.version} by {plugin.author}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
                  <span style={{ fontSize: 11, color: plugin.enabled ? '#2ea043' : '#8b949e' }}>
                    {plugin.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  <div style={{
                    width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
                    background: plugin.enabled ? '#2ea043' : 'var(--border-primary, #30363d)',
                    position: 'relative', transition: 'background 0.2s'
                  }}>
                    <div style={{
                      width: 16, height: 16, borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: 2,
                      left: plugin.enabled ? 18 : 2, transition: 'left 0.2s'
                    }} />
                  </div>
                </div>
              </div>

              <p style={{ fontSize: 12, color: 'var(--text-secondary, #8b949e)', margin: '0 0 10px', lineHeight: 1.5 }}>
                {plugin.description}
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {plugin.functions.map(f => (
                  <span key={f} style={{ ...st.tag, background: '#388bfd26', color: '#58a6ff' }}>{f}()</span>
                ))}
              </div>

              {expanded && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-primary, #30363d)' }}>
                  <h4 style={{ fontSize: 12, color: 'var(--text-secondary, #8b949e)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Configuration</h4>
                  {Object.entries(plugin.config).map(([key, val]) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-primary, #30363d)', fontSize: 12 }}>
                      <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary, #8b949e)' }}>{key}</span>
                      <span style={{ fontFamily: 'monospace' }}>{val}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );

  const renderFunctions = () => (
    <>
      {FUNCTIONS.map(fn => {
        const expanded = expandedFunction === fn.id;
        return (
          <div
            key={fn.id}
            style={{ ...st.card, cursor: 'pointer', borderColor: expanded ? 'var(--accent-primary, #58a6ff)' : undefined }}
            onClick={() => setExpandedFunction(expanded ? null : fn.id)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 600, color: 'var(--accent-primary, #58a6ff)' }}>
                {fn.name}()
              </span>
              <span style={{ ...st.badge, background: categoryColor(fn.category) + '18', color: categoryColor(fn.category), fontSize: 10 }}>
                {fn.category}
              </span>
              {fn.policyGated && (
                <span style={{ ...st.badge, background: '#f8514918', color: '#f85149', fontSize: 10 }}>
                  🛡️ Policy Gated
                </span>
              )}
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary, #8b949e)' }}>
                → {fn.returnType}
              </span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary, #8b949e)', margin: '6px 0 0', lineHeight: 1.5 }}>
              {fn.description}
            </p>

            {expanded && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-primary, #30363d)' }}>
                <h4 style={{ fontSize: 12, color: 'var(--text-secondary, #8b949e)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Parameters</h4>
                <div style={{ background: 'var(--surface-secondary, #0d1117)', borderRadius: 8, overflow: 'hidden' }}>
                  <table style={{ ...st.table, fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ ...st.th, fontSize: 10 }}>Name</th>
                        <th style={{ ...st.th, fontSize: 10 }}>Type</th>
                        <th style={{ ...st.th, fontSize: 10 }}>Required</th>
                        <th style={{ ...st.th, fontSize: 10 }}>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fn.parameters.map(p => (
                        <tr key={p.name}>
                          <td style={{ ...st.td, fontFamily: 'monospace', color: 'var(--accent-primary, #58a6ff)' }}>{p.name}</td>
                          <td style={{ ...st.td, fontFamily: 'monospace' }}>{p.type}</td>
                          <td style={st.td}>{p.required ? '✅' : '—'}</td>
                          <td style={{ ...st.td, color: 'var(--text-secondary, #8b949e)' }}>{p.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );

  const renderPlayground = () => (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <label style={{ fontSize: 13, color: 'var(--text-secondary, #8b949e)' }}>Model:</label>
        <select style={st.select} value={playgroundModel} onChange={e => setPlaygroundModel(e.target.value)}>
          {MODELS.filter(m => m.status === 'active' && (m.type === 'chat' || m.type === 'multimodal')).map(m => (
            <option key={m.id} value={m.name}>{m.providerIcon} {m.name}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-secondary, #8b949e)' }}>
          {MODELS.find(m => m.name === playgroundModel)?.contextWindow} context · {MODELS.find(m => m.name === playgroundModel)?.latencyMs}ms avg
        </span>
        <button style={{ ...st.btn, ...st.btnSecondary, marginLeft: 'auto' }} onClick={() => setPlaygroundMessages([playgroundMessages[0]])}>
          🗑️ Clear
        </button>
      </div>

      <div style={st.chatContainer}>
        <div style={st.chatMessages}>
          {playgroundMessages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
              <div style={{
                ...st.msgBubble,
                background: msg.role === 'user' ? 'var(--accent-primary, #58a6ff)' :
                  msg.role === 'system' ? '#30363d' :
                  msg.role === 'function' ? '#388bfd26' :
                  'var(--surface-primary, #161b22)',
                color: msg.role === 'user' ? '#fff' : 'var(--text-primary, #e6edf3)',
                border: msg.role !== 'user' ? '1px solid var(--border-primary, #30363d)' : 'none',
              }}>
                <div style={{ fontSize: 10, color: msg.role === 'user' ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary, #8b949e)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {msg.role === 'system' ? '⚙️ System' : msg.role === 'user' ? '👤 You' : msg.role === 'function' ? `⚡ ${msg.functionName}` : '🤖 Assistant'}
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                {(msg.tokens || msg.latencyMs) && (
                  <div style={{ fontSize: 10, marginTop: 6, opacity: 0.6 }}>
                    {msg.tokens && `${msg.tokens} tokens`}{msg.tokens && msg.latencyMs && ' · '}{msg.latencyMs && `${msg.latencyMs}ms`}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={st.chatInput}>
          <input
            style={{ ...st.input, flex: 1 }}
            placeholder="Type a message... (Enter to send)"
            value={playgroundInput}
            onChange={e => setPlaygroundInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
          />
          <button style={{ ...st.btn, ...st.btnPrimary }} onClick={handleSendMessage}>
            Send ↵
          </button>
        </div>
      </div>

      <div style={{ marginTop: 16, background: 'var(--surface-primary, #161b22)', border: '1px solid var(--border-primary, #30363d)', borderRadius: 10, padding: 16 }}>
        <h4 style={{ margin: '0 0 10px', fontSize: 13 }}>🔧 Playground Features</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10, fontSize: 12, color: 'var(--text-secondary, #8b949e)' }}>
          <div>🧠 Switch between any connected model in real-time</div>
          <div>⚡ Function calling with registered tools</div>
          <div>🛡️ Policy engine validation on every action</div>
          <div>📊 Token usage and latency tracking per message</div>
          <div>💾 Save conversations as test cases</div>
          <div>🔄 Compare responses across different models</div>
          <div>📝 Edit system prompts and test variations</div>
          <div>🌡️ Adjust temperature and parameters live</div>
        </div>
      </div>
    </div>
  );

  const activeModels = MODELS.filter(m => m.status === 'active').length;
  const enabledPlugins = PLUGINS.filter(p => p.enabled).length;
  const totalInvocations = CUSTOM_AIS.reduce((s, a) => s + a.totalInvocations, 0);
  const freeModels = MODELS.filter(m => m.costPer1kTokens === '$0.00').length;

  return (
    <div style={st.container}>
      <div style={st.header}>
        <h1 style={st.title}>🧠 AI Builder</h1>
        <p style={st.subtitle}>Create custom AIs, manage model connections, configure plugins, and test in the playground — zero vendor lock-in</p>
      </div>

      <div style={st.summaryRow}>
        <div style={st.summaryCard}>
          <div style={st.summaryLabel}>Custom AIs</div>
          <div style={st.summaryValue}>{CUSTOM_AIS.length}</div>
        </div>
        <div style={st.summaryCard}>
          <div style={st.summaryLabel}>Active Models</div>
          <div style={{ ...st.summaryValue, color: '#2ea043' }}>{activeModels}</div>
        </div>
        <div style={st.summaryCard}>
          <div style={st.summaryLabel}>Free Models</div>
          <div style={{ ...st.summaryValue, color: '#2ea043' }}>🆓 {freeModels}</div>
        </div>
        <div style={st.summaryCard}>
          <div style={st.summaryLabel}>Plugins</div>
          <div style={st.summaryValue}>{enabledPlugins}/{PLUGINS.length}</div>
        </div>
        <div style={st.summaryCard}>
          <div style={st.summaryLabel}>Functions</div>
          <div style={st.summaryValue}>{FUNCTIONS.length}</div>
        </div>
        <div style={st.summaryCard}>
          <div style={st.summaryLabel}>Total Calls</div>
          <div style={st.summaryValue}>{(totalInvocations / 1000).toFixed(1)}K</div>
        </div>
      </div>

      <div style={st.tabs} role="tablist">
        {([
          { id: 'custom', label: '🤖 Custom AIs', count: CUSTOM_AIS.length },
          { id: 'models', label: '🧠 Models', count: MODELS.length },
          { id: 'plugins', label: '🔌 Plugins', count: PLUGINS.length },
          { id: 'functions', label: '⚡ Functions', count: FUNCTIONS.length },
          { id: 'playground', label: '🧪 Playground' },
        ] as const).map(t => (
          <button
            key={t.id}
            style={{ ...st.tab, ...(tab === t.id ? st.tabActive : {}) }}
            onClick={() => setTab(t.id)}
            role="tab"
            aria-selected={tab === t.id}
          >
            {t.label} {'count' in t ? `(${t.count})` : ''}
          </button>
        ))}
      </div>

      {tab === 'custom' && renderCustomAIs()}
      {tab === 'models' && renderModels()}
      {tab === 'plugins' && renderPlugins()}
      {tab === 'functions' && renderFunctions()}
      {tab === 'playground' && renderPlayground()}
    </div>
  );
}