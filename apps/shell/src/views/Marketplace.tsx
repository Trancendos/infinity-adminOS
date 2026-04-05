import React, { useState } from 'react';

type ModuleCategory = 'all' | 'productivity' | 'development' | 'communication' | 'ai-ml' | 'security' | 'media' | 'utilities';
type ModuleSource = 'all' | 'wasm' | 'flatpak' | 'snap' | 'f-droid';

interface MarketplaceModule {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: ModuleCategory;
  source: ModuleSource;
  version: string;
  author: string;
  downloads: number;
  rating: number;
  installed: boolean;
  verified: boolean;
  tags: string[];
}

const MODULES: MarketplaceModule[] = [
  { id: 'code-editor', name: 'Code Editor', description: 'Full-featured code editor with syntax highlighting, IntelliSense, and Git integration', icon: '📝', category: 'development', source: 'wasm', version: '2.1.0', author: 'Infinity OS', downloads: 12450, rating: 4.8, installed: true, verified: true, tags: ['editor', 'code', 'IDE'] },
  { id: 'terminal-pro', name: 'Terminal Pro', description: 'Advanced terminal emulator with tabs, split panes, and custom themes', icon: '💻', category: 'development', source: 'wasm', version: '1.5.2', author: 'Infinity OS', downloads: 9870, rating: 4.7, installed: true, verified: true, tags: ['terminal', 'shell', 'CLI'] },
  { id: 'markdown-studio', name: 'Markdown Studio', description: 'Beautiful markdown editor with live preview, export to PDF, and collaboration', icon: '📄', category: 'productivity', source: 'wasm', version: '1.3.0', author: 'DocTools', downloads: 6540, rating: 4.6, installed: false, verified: true, tags: ['markdown', 'writing', 'docs'] },
  { id: 'ai-assistant', name: 'AI Assistant', description: 'Conversational AI powered by multiple LLM providers with custom personas', icon: '🤖', category: 'ai-ml', source: 'wasm', version: '3.0.1', author: 'Infinity OS', downloads: 18200, rating: 4.9, installed: true, verified: true, tags: ['AI', 'chat', 'LLM'] },
  { id: 'image-gen', name: 'Image Generator', description: 'AI-powered image generation and editing with multiple model support', icon: '🎨', category: 'ai-ml', source: 'wasm', version: '1.2.0', author: 'CreativeAI', downloads: 7890, rating: 4.5, installed: false, verified: true, tags: ['AI', 'images', 'generation'] },
  { id: 'kanban-board', name: 'Kanban Board', description: 'Project management with drag-and-drop boards, sprints, and team collaboration', icon: '📋', category: 'productivity', source: 'wasm', version: '2.0.0', author: 'ProjectFlow', downloads: 5430, rating: 4.4, installed: false, verified: true, tags: ['project', 'kanban', 'agile'] },
  { id: 'chat-app', name: 'Infinity Chat', description: 'End-to-end encrypted messaging with channels, threads, and file sharing', icon: '💬', category: 'communication', source: 'wasm', version: '1.8.0', author: 'Infinity OS', downloads: 11200, rating: 4.7, installed: false, verified: true, tags: ['chat', 'messaging', 'E2EE'] },
  { id: 'password-vault', name: 'Password Vault', description: 'Zero-knowledge password manager with WebAuthn and TOTP support', icon: '🔐', category: 'security', source: 'wasm', version: '1.1.0', author: 'SecureVault', downloads: 4560, rating: 4.8, installed: false, verified: true, tags: ['passwords', 'security', '2FA'] },
  { id: 'media-player', name: 'Media Player', description: 'Universal media player supporting audio, video, and streaming protocols', icon: '🎵', category: 'media', source: 'flatpak', version: '3.2.1', author: 'MediaCore', downloads: 8900, rating: 4.3, installed: false, verified: false, tags: ['media', 'audio', 'video'] },
  { id: 'file-converter', name: 'File Converter', description: 'Convert between 100+ file formats including documents, images, and media', icon: '🔄', category: 'utilities', source: 'wasm', version: '1.0.5', author: 'ConvertKit', downloads: 3210, rating: 4.2, installed: false, verified: true, tags: ['convert', 'files', 'formats'] },
  { id: 'vpn-client', name: 'VPN Client', description: 'WireGuard-based VPN client with split tunneling and kill switch', icon: '🛡️', category: 'security', source: 'snap', version: '2.4.0', author: 'NetShield', downloads: 6780, rating: 4.6, installed: false, verified: false, tags: ['VPN', 'privacy', 'network'] },
  { id: 'data-viz', name: 'Data Visualizer', description: 'Interactive charts, graphs, and dashboards from CSV, JSON, and SQL data', icon: '📊', category: 'productivity', source: 'wasm', version: '1.4.0', author: 'ChartLab', downloads: 4120, rating: 4.5, installed: false, verified: true, tags: ['charts', 'data', 'visualization'] },
];

export default function Marketplace() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ModuleCategory>('all');
  const [source, setSource] = useState<ModuleSource>('all');
  const [sortBy, setSortBy] = useState<'downloads' | 'rating' | 'name'>('downloads');
  const [installing, setInstalling] = useState<string | null>(null);

  const filtered = MODULES
    .filter(m => category === 'all' || m.category === category)
    .filter(m => source === 'all' || m.source === source)
    .filter(m => !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.description.toLowerCase().includes(search.toLowerCase()) || m.tags.some(t => t.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => sortBy === 'downloads' ? b.downloads - a.downloads : sortBy === 'rating' ? b.rating - a.rating : a.name.localeCompare(b.name));

  const handleInstall = async (moduleId: string) => {
    setInstalling(moduleId);
    await new Promise(r => setTimeout(r, 1500));
    setInstalling(null);
  };

  return (
    <div style={{ padding: '1.5rem', height: '100%', overflow: 'auto', background: 'var(--color-surface)', color: 'var(--color-text)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>🏪 Marketplace</h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            {MODULES.length} modules available · {MODULES.filter(m => m.installed).length} installed
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <input
          type="text" placeholder="Search modules..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: '1 1 300px', padding: '0.625rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: '0.875rem', outline: 'none' }}
        />
        <select value={category} onChange={e => setCategory(e.target.value as ModuleCategory)} style={{ padding: '0.625rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: '0.875rem' }}>
          <option value="all">All Categories</option>
          <option value="productivity">Productivity</option>
          <option value="development">Development</option>
          <option value="communication">Communication</option>
          <option value="ai-ml">AI & ML</option>
          <option value="security">Security</option>
          <option value="media">Media</option>
          <option value="utilities">Utilities</option>
        </select>
        <select value={source} onChange={e => setSource(e.target.value as ModuleSource)} style={{ padding: '0.625rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: '0.875rem' }}>
          <option value="all">All Sources</option>
          <option value="wasm">WASM</option>
          <option value="flatpak">Flatpak</option>
          <option value="snap">Snap</option>
          <option value="f-droid">F-Droid</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as 'downloads' | 'rating' | 'name')} style={{ padding: '0.625rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: '0.875rem' }}>
          <option value="downloads">Most Popular</option>
          <option value="rating">Highest Rated</option>
          <option value="name">Alphabetical</option>
        </select>
      </div>

      {/* Module Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
        {filtered.map(mod => (
          <div key={mod.id} style={{ padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '2.5rem', lineHeight: 1, width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '0.75rem', background: 'var(--color-surface)' }}>
                {mod.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '1rem' }}>{mod.name}</span>
                  {mod.verified && <span title="Verified" style={{ fontSize: '0.75rem' }}>✓</span>}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                  by {mod.author} · v{mod.version}
                </div>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.5, flex: 1 }}>
              {mod.description}
            </p>
            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
              {mod.tags.map(tag => (
                <span key={tag} style={{ padding: '0.125rem 0.5rem', borderRadius: '1rem', background: 'var(--color-surface)', fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>
                  {tag}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem', borderTop: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                <span>⬇ {mod.downloads.toLocaleString()}</span>
                <span>⭐ {mod.rating}</span>
                <span style={{ padding: '0.0625rem 0.375rem', borderRadius: '0.25rem', background: 'var(--color-surface)', fontSize: '0.625rem', textTransform: 'uppercase' }}>{mod.source}</span>
              </div>
              <button
                onClick={() => !mod.installed && handleInstall(mod.id)}
                disabled={mod.installed || installing === mod.id}
                style={{
                  padding: '0.375rem 1rem', borderRadius: '0.5rem', border: 'none', cursor: mod.installed ? 'default' : 'pointer',
                  background: mod.installed ? 'var(--color-border)' : 'var(--color-primary)', color: mod.installed ? 'var(--color-text-secondary)' : '#fff',
                  fontSize: '0.75rem', fontWeight: 600, opacity: installing === mod.id ? 0.7 : 1,
                }}
              >
                {mod.installed ? '✓ Installed' : installing === mod.id ? '⏳ Installing...' : 'Install'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}