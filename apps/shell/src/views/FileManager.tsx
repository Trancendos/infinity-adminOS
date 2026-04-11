import React, { useState } from 'react';

type FileType = 'folder' | 'file' | 'image' | 'document' | 'code' | 'archive' | 'media';

interface FileNode {
  id: string;
  name: string;
  type: FileType;
  size: number;
  modified: string;
  children?: FileNode[];
}

const fileIcon = (type: FileType, name: string) => {
  if (type === 'folder') return '📁';
  const ext = name.split('.').pop()?.toLowerCase();
  if (['jpg', 'png', 'gif', 'svg', 'webp'].includes(ext || '')) return '🖼️';
  if (['mp4', 'webm', 'mov', 'mp3', 'wav'].includes(ext || '')) return '🎵';
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go'].includes(ext || '')) return '📝';
  if (['md', 'txt', 'pdf', 'doc', 'docx'].includes(ext || '')) return '📄';
  if (['zip', 'tar', 'gz', '7z'].includes(ext || '')) return '📦';
  if (['json', 'yml', 'yaml', 'toml', 'xml'].includes(ext || '')) return '⚙️';
  return '📄';
};

const formatSize = (bytes: number) => {
  if (bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const FILE_TREE: FileNode[] = [
  { id: '1', name: 'Documents', type: 'folder', size: 0, modified: '2024-03-01', children: [
    { id: '1a', name: 'Projects', type: 'folder', size: 0, modified: '2024-03-01', children: [
      { id: '1a1', name: 'infinity-os-spec.md', type: 'document', size: 45200, modified: '2024-03-01' },
      { id: '1a2', name: 'architecture-diagram.svg', type: 'image', size: 128000, modified: '2024-02-28' },
    ]},
    { id: '1b', name: 'meeting-notes.md', type: 'document', size: 12400, modified: '2024-02-25' },
    { id: '1c', name: 'budget-2024.pdf', type: 'document', size: 890000, modified: '2024-01-15' },
  ]},
  { id: '2', name: 'Downloads', type: 'folder', size: 0, modified: '2024-03-02', children: [
    { id: '2a', name: 'cloudflare-workers-guide.pdf', type: 'document', size: 2340000, modified: '2024-03-02' },
    { id: '2b', name: 'dataset-export.csv', type: 'file', size: 5670000, modified: '2024-02-20' },
  ]},
  { id: '3', name: 'Projects', type: 'folder', size: 0, modified: '2024-03-03', children: [
    { id: '3a', name: 'infinity-portal', type: 'folder', size: 0, modified: '2024-03-03', children: [
      { id: '3a1', name: 'package.json', type: 'code', size: 1200, modified: '2024-03-03' },
      { id: '3a2', name: 'tsconfig.json', type: 'code', size: 800, modified: '2024-03-03' },
      { id: '3a3', name: 'src', type: 'folder', size: 0, modified: '2024-03-03' },
    ]},
  ]},
  { id: '4', name: '.config', type: 'folder', size: 0, modified: '2024-01-10', children: [
    { id: '4a', name: 'settings.json', type: 'code', size: 2400, modified: '2024-02-15' },
    { id: '4b', name: 'theme.json', type: 'code', size: 560, modified: '2024-01-10' },
  ]},
  { id: '5', name: 'README.md', type: 'document', size: 3400, modified: '2024-03-01' },
  { id: '6', name: '.profile', type: 'file', size: 280, modified: '2024-01-10' },
  { id: '7', name: 'wallpaper.jpg', type: 'image', size: 4500000, modified: '2024-02-01' },
];

export default function FileManager() {
  const [currentPath, setCurrentPath] = useState<string[]>(['Home']);
  const [currentFiles, setCurrentFiles] = useState<FileNode[]>(FILE_TREE);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'modified'>('name');
  const [showHidden, setShowHidden] = useState(false);

  const navigateInto = (folder: FileNode) => {
    if (folder.type === 'folder' && folder.children) {
      setCurrentPath(prev => [...prev, folder.name]);
      setCurrentFiles(folder.children);
      setSelectedFile(null);
    }
  };

  const navigateUp = () => {
    if (currentPath.length > 1) {
      setCurrentPath(['Home']);
      setCurrentFiles(FILE_TREE);
      setSelectedFile(null);
    }
  };

  const navigateTo = (index: number) => {
    if (index === 0) {
      setCurrentPath(['Home']);
      setCurrentFiles(FILE_TREE);
    }
    setSelectedFile(null);
  };

  const visibleFiles = currentFiles
    .filter(f => showHidden || !f.name.startsWith('.'))
    .sort((a, b) => {
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (a.type !== 'folder' && b.type === 'folder') return 1;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'size') return b.size - a.size;
      return new Date(b.modified).getTime() - new Date(a.modified).getTime();
    });

  const totalSize = currentFiles.reduce((sum, f) => sum + f.size, 0);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--color-surface)', color: 'var(--color-text)' }}>
      {/* Toolbar */}
      <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--color-bg)' }}>
        <button onClick={navigateUp} disabled={currentPath.length <= 1} style={{ padding: '0.375rem 0.625rem', borderRadius: '0.375rem', border: '1px solid var(--color-border)', background: 'transparent', cursor: 'pointer', color: 'var(--color-text)', opacity: currentPath.length <= 1 ? 0.4 : 1 }}>
          ← Back
        </button>

        {/* Breadcrumb */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem' }}>
          {currentPath.map((segment, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ color: 'var(--color-text-secondary)' }}>/</span>}
              <button onClick={() => navigateTo(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: i === currentPath.length - 1 ? 'var(--color-text)' : 'var(--color-primary)', fontWeight: i === currentPath.length - 1 ? 600 : 400, fontSize: '0.875rem', padding: '0.125rem 0.25rem', borderRadius: '0.25rem' }}>
                {segment}
              </button>
            </React.Fragment>
          ))}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
          <input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} />
          Hidden
        </label>

        <select value={sortBy} onChange={e => setSortBy(e.target.value as 'name' | 'size' | 'modified')} style={{ padding: '0.25rem 0.5rem', borderRadius: '0.375rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: '0.75rem' }}>
          <option value="name">Name</option>
          <option value="size">Size</option>
          <option value="modified">Modified</option>
        </select>

        <div style={{ display: 'flex', border: '1px solid var(--color-border)', borderRadius: '0.375rem', overflow: 'hidden' }}>
          <button onClick={() => setViewMode('list')} style={{ padding: '0.25rem 0.5rem', border: 'none', background: viewMode === 'list' ? 'var(--color-primary)' : 'transparent', color: viewMode === 'list' ? '#fff' : 'var(--color-text)', cursor: 'pointer', fontSize: '0.75rem' }}>☰</button>
          <button onClick={() => setViewMode('grid')} style={{ padding: '0.25rem 0.5rem', border: 'none', background: viewMode === 'grid' ? 'var(--color-primary)' : 'transparent', color: viewMode === 'grid' ? '#fff' : 'var(--color-text)', cursor: 'pointer', fontSize: '0.75rem' }}>⊞</button>
        </div>
      </div>

      {/* File List */}
      <div style={{ flex: 1, overflow: 'auto', padding: viewMode === 'grid' ? '1rem' : '0' }}>
        {viewMode === 'list' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg)' }}>
                <th style={{ padding: '0.5rem 1rem', textAlign: 'left', fontWeight: 600, fontSize: '0.6875rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border)' }}>Name</th>
                <th style={{ padding: '0.5rem 1rem', textAlign: 'right', fontWeight: 600, fontSize: '0.6875rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border)', width: '100px' }}>Size</th>
                <th style={{ padding: '0.5rem 1rem', textAlign: 'right', fontWeight: 600, fontSize: '0.6875rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border)', width: '120px' }}>Modified</th>
              </tr>
            </thead>
            <tbody>
              {visibleFiles.map(file => (
                <tr
                  key={file.id}
                  onClick={() => setSelectedFile(file.id)}
                  onDoubleClick={() => file.type === 'folder' && navigateInto(file)}
                  style={{ cursor: 'pointer', background: selectedFile === file.id ? 'rgba(99,102,241,0.1)' : 'transparent' }}
                >
                  <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--color-border)' }}>
                    <span style={{ marginRight: '0.5rem' }}>{fileIcon(file.type, file.name)}</span>
                    <span style={{ fontWeight: file.type === 'folder' ? 600 : 400 }}>{file.name}</span>
                  </td>
                  <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--color-border)', textAlign: 'right', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                    {formatSize(file.size)}
                  </td>
                  <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--color-border)', textAlign: 'right', color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                    {file.modified}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '1rem' }}>
            {visibleFiles.map(file => (
              <div
                key={file.id}
                onClick={() => setSelectedFile(file.id)}
                onDoubleClick={() => file.type === 'folder' && navigateInto(file)}
                style={{
                  padding: '1rem', borderRadius: '0.75rem', textAlign: 'center', cursor: 'pointer',
                  border: `1px solid ${selectedFile === file.id ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background: selectedFile === file.id ? 'rgba(99,102,241,0.1)' : 'var(--color-bg)',
                }}
              >
                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{fileIcon(file.type, file.name)}</div>
                <div style={{ fontSize: '0.75rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                <div style={{ fontSize: '0.625rem', color: 'var(--color-text-secondary)', marginTop: '0.125rem' }}>{formatSize(file.size)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid var(--color-border)', background: 'var(--color-bg)', display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>
        <span>{visibleFiles.length} items · {formatSize(totalSize)}</span>
        <span>R2 Storage: 3.2 GB / 10 GB free</span>
      </div>
    </div>
  );
}