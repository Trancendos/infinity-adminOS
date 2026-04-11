/**
 * ServiceShortcuts — Desktop shortcuts for all deployed services
 * ============================================================
 * Displays all Infinity OS services as clickable desktop tiles
 * Links to live deployed workers and external services
 * ============================================================
 */

import React, { useState } from 'react';

// ============================================================
// TYPES
// ============================================================

interface ServiceTile {
  id: string;
  label: string;
  icon: string;
  url: string;
  category: 'core' | 'ai' | 'finance' | 'storage' | 'infra' | 'external';
  status: 'online' | 'degraded' | 'offline';
  description: string;
}

// ============================================================
// SERVICE REGISTRY — ALL DEPLOYED SERVICES
// ============================================================

const SERVICE_TILES: ServiceTile[] = [
  // ─────────────────────────── Core Platform ───────────────────────────
  {
    id: 'infinity-one',
    label: 'Infinity-One',
    icon: '∞',
    url: 'https://infinity-portal.pages.dev/#infinity-one',
    category: 'core',
    status: 'online',
    description: 'Account & Identity Hub',
  },
  {
    id: 'lighthouse',
    label: 'Lighthouse',
    icon: '⬡',
    url: 'https://infinity-portal.pages.dev/#lighthouse',
    category: 'core',
    status: 'online',
    description: 'Cryptographic Token Hub',
  },
  {
    id: 'hive',
    label: 'The HIVE',
    icon: '⬢',
    url: 'https://infinity-portal.pages.dev/#hive',
    category: 'core',
    status: 'online',
    description: 'Swarm Data Router',
  },
  {
    id: 'void',
    label: 'The Void',
    icon: '◈',
    url: 'https://infinity-portal.pages.dev/#void',
    category: 'core',
    status: 'online',
    description: 'Secure Secret Store',
  },

  // ─────────────────────────── AI Services ───────────────────────────
  {
    id: 'adaptive-intelligence',
    label: 'Adaptive Intelligence',
    icon: '🧠',
    url: 'https://infinity-adaptive-intelligence.luminous-aimastermind.workers.dev',
    category: 'ai',
    status: 'online',
    description: 'Self-populating service discovery & AI engine',
  },
  {
    id: 'ai-api',
    label: 'AI API',
    icon: '🤖',
    url: 'https://infinity-ai-api.luminous-aimastermind.workers.dev',
    category: 'ai',
    status: 'online',
    description: 'Artificial Intelligence Gateway',
  },

  // ─────────────────────────── Finance ───────────────────────────
  {
    id: 'arcadia-exchange',
    label: 'Arcadia Exchange',
    icon: '📈',
    url: 'https://exchange.trancendos.com',
    category: 'finance',
    status: 'online',
    description: 'Cryptocurrency Trading Platform',
  },
  {
    id: 'royal-bank',
    label: 'Royal Bank of Arcadia',
    icon: '🏦',
    url: 'https://royal-bank.luminous-aimastermind.workers.dev',
    category: 'finance',
    status: 'online',
    description: 'Digital Banking Services',
  },

  // ─────────────────────────── Storage ───────────────────────────
  {
    id: 'infinity-drive',
    label: 'Infinity Drive',
    icon: '💾',
    url: 'https://infinity-drive.luminous-aimastermind.workers.dev',
    category: 'storage',
    status: 'online',
    description: 'Distributed File Storage',
  },
  {
    id: 'infinity-cdn',
    label: 'Infinity CDN',
    icon: '🌐',
    url: 'https://infinity-cdn.luminous-aimastermind.workers.dev',
    category: 'storage',
    status: 'online',
    description: 'Content Delivery Network',
  },
  {
    id: 'backup-service',
    label: 'Backup Service',
    icon: '💿',
    url: 'https://infinity-backup.luminous-aimastermind.workers.dev',
    category: 'storage',
    status: 'online',
    description: 'Automated Backup System',
  },

  // ─────────────────────────── Infrastructure ───────────────────────────
  {
    id: 'api-gateway',
    label: 'API Gateway',
    icon: '🚪',
    url: 'https://infinity-api-gateway.luminous-aimastermind.workers.dev',
    category: 'infra',
    status: 'online',
    description: 'Central API Management',
  },
  {
    id: 'auth-service',
    label: 'Auth Service',
    icon: '🔐',
    url: 'https://infinity-auth-api.luminous-aimastermind.workers.dev',
    category: 'infra',
    status: 'online',
    description: 'Authentication & Authorization',
  },
  {
    id: 'ws-api',
    label: 'WebSocket API',
    icon: '🔌',
    url: 'https://infinity-ws-api.luminous-aimastermind.workers.dev',
    category: 'infra',
    status: 'online',
    description: 'Real-time Communication',
  },
  {
    id: 'orchestrator',
    label: 'Orchestrator',
    icon: '🎛',
    url: 'https://infinity-orchestrator.luminous-aimastermind.workers.dev',
    category: 'infra',
    status: 'online',
    description: 'Service Orchestration',
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    icon: '📊',
    url: 'https://status.trancendos.com',
    category: 'infra',
    status: 'online',
    description: 'System Status Dashboard',
  },
  {
    id: 'cost-monitor',
    label: 'Cost Monitor',
    icon: '💰',
    url: 'https://infinity-cost-monitor.luminous-aimastermind.workers.dev',
    category: 'infra',
    status: 'online',
    description: 'Cloud Cost Tracking',
  },

  // ─────────────────────────── External Services ───────────────────────────
  {
    id: 'cloudflare-dashboard',
    label: 'Cloudflare',
    icon: '☁️',
    url: 'https://dash.cloudflare.com',
    category: 'external',
    status: 'online',
    description: 'Cloudflare Dashboard',
  },
  {
    id: 'github-repo',
    label: 'GitHub',
    icon: '📦',
    url: 'https://github.com/trancendos/infinity-portal',
    category: 'external',
    status: 'online',
    description: 'Source Repository',
  },
  {
    id: 'docs',
    label: 'Documentation',
    icon: '📚',
    url: 'https://docs.trancendos.com',
    category: 'external',
    status: 'online',
    description: 'Platform Documentation',
  },
];

// ============================================================
// CATEGORY COLORS
// ============================================================

const CATEGORY_COLORS: Record<ServiceTile['category'], { bg: string; border: string; accent: string }> = {
  core:     { bg: 'rgba(99,102,241,0.15)',  border: 'rgba(99,102,241,0.3)',  accent: '#6366f1' },
  ai:       { bg: 'rgba(236,72,153,0.15)',  border: 'rgba(236,72,153,0.3)',  accent: '#ec4899' },
  finance:  { bg: 'rgba(34,197,94,0.15)',   border: 'rgba(34,197,94,0.3)',   accent: '#22c55e' },
  storage:  { bg: 'rgba(59,130,246,0.15)',  border: 'rgba(59,130,246,0.3)',  accent: '#3b82f6' },
  infra:    { bg: 'rgba(249,115,22,0.15)',  border: 'rgba(249,115,22,0.3)',  accent: '#f97316' },
  external: { bg: 'rgba(139,92,246,0.15)',  border: 'rgba(139,92,246,0.3)',  accent: '#8b5cf6' },
};

// ============================================================
// SERVICE SHORTCUT COMPONENT
// ============================================================

function ServiceShortcut({ tile }: { tile: ServiceTile }) {
  const [hovered, setHovered] = useState(false);
  const colors = CATEGORY_COLORS[tile.category];

  const handleClick = () => {
    window.open(tile.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`${tile.label}\n${tile.description}\n${tile.url}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: '12px 8px',
        width: 90,
        background: hovered ? colors.bg : 'transparent',
        border: hovered ? `1px solid ${colors.border}` : '1px solid transparent',
        borderRadius: 12,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        transform: hovered ? 'scale(1.05)' : 'scale(1)',
      }}
    >
      {/* Icon */}
      <div style={{
        width: 48,
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 28,
        background: hovered ? `${colors.accent}20` : 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        filter: hovered ? `drop-shadow(0 0 8px ${colors.accent})` : 'none',
        transition: 'all 0.2s ease',
      }}>
        {tile.icon}
      </div>

      {/* Label */}
      <div style={{
        fontSize: 11,
        fontWeight: 500,
        color: hovered ? '#f1f5f9' : '#94a3b8',
        textAlign: 'center',
        lineHeight: 1.2,
        maxWidth: 80,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        transition: 'color 0.2s ease',
      }}>
        {tile.label}
      </div>

      {/* Status indicator */}
      <div style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: tile.status === 'online' ? '#22c55e' : tile.status === 'degraded' ? '#f59e0b' : '#ef4444',
        boxShadow: `0 0 4px ${tile.status === 'online' ? '#22c55e' : tile.status === 'degraded' ? '#f59e0b' : '#ef4444'}`,
      }} />
    </button>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function ServiceShortcuts() {
  return (
    <div
      aria-label="Service shortcuts"
      style={{
        position: 'absolute',
        top: 40,
        right: 40,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 8,
        pointerEvents: 'auto',
        zIndex: 1,
      }}
    >
      {SERVICE_TILES.map(tile => (
        <ServiceShortcut key={tile.id} tile={tile} />
      ))}
    </div>
  );
}

export default ServiceShortcuts;