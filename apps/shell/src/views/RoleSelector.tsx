/**
 * RoleSelector — Multi-role selection view
 * ============================================================
 * Displayed when a user has multiple IAM roles and needs to
 * choose their operating context before accessing the system.
 * ============================================================
 * Ticket: TRN-IAM-003b (dependency of App.tsx)
 * 2060 Standard: Cognitive ease, progressive disclosure
 * Revert: 2993380
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, type IAMRole } from '../providers/AuthProvider';

// ============================================================
// ROLE LEVEL LABELS & COLOURS
// ============================================================

const LEVEL_META: Record<number, { label: string; colour: string; icon: string }> = {
  0: { label: 'Sovereign', colour: '#FFD700', icon: '👑' },
  1: { label: 'Architect', colour: '#C0C0C0', icon: '🏗️' },
  2: { label: 'Commander', colour: '#CD7F32', icon: '⚙️' },
  3: { label: 'Specialist', colour: '#4A90D9', icon: '🔧' },
  4: { label: 'Standard', colour: '#6B7280', icon: '👤' },
  5: { label: 'Observer', colour: '#9CA3AF', icon: '👁️' },
  6: { label: 'External', colour: '#D1D5DB', icon: '🤖' },
};

function getLevelMeta(level: number) {
  return LEVEL_META[level] || LEVEL_META[4];
}

// ============================================================
// COMPONENT
// ============================================================

export function RoleSelector() {
  const { iam, user } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectRole = async (role: IAMRole) => {
    setIsLoading(true);
    setError(null);

    try {
      await iam.switchRole(role.id);
      navigate('/desktop', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch role');
    } finally {
      setIsLoading(false);
    }
  };

  // Sort roles by level (most privileged first)
  const sortedRoles = [...iam.roles].sort((a, b) => a.level - b.level);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>Select Operating Role</h1>
          <p style={styles.subtitle}>
            Welcome back, <strong>{user?.displayName || 'User'}</strong>.
            You have {iam.roles.length} assigned roles. Choose your operating context.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div style={styles.error}>
            <span>⚠️</span> {error}
          </div>
        )}

        {/* Role list */}
        <div style={styles.roleList}>
          {sortedRoles.map((role) => {
            const meta = getLevelMeta(role.level);
            const isPrimary = role.is_primary;

            return (
              <button
                key={role.id}
                onClick={() => handleSelectRole(role)}
                disabled={isLoading}
                style={{
                  ...styles.roleButton,
                  borderColor: isPrimary ? meta.colour : '#374151',
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                <div style={styles.roleIcon}>{meta.icon}</div>
                <div style={styles.roleInfo}>
                  <div style={styles.roleName}>
                    {role.display_name}
                    {isPrimary && (
                      <span style={{ ...styles.badge, backgroundColor: meta.colour }}>
                        PRIMARY
                      </span>
                    )}
                  </div>
                  <div style={styles.roleDescription}>{role.description}</div>
                  <div style={styles.roleMeta}>
                    <span style={{ color: meta.colour }}>Level {role.level}</span>
                    <span style={styles.separator}>•</span>
                    <span>{meta.label}</span>
                    <span style={styles.separator}>•</span>
                    <span style={{ textTransform: 'capitalize' }}>{role.role_type}</span>
                  </div>
                </div>
                <div style={styles.arrow}>→</div>
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <p style={styles.hint}>
          Your role determines which modules, data, and actions are available.
          You can switch roles at any time from the taskbar.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// STYLES — Inline for zero-dependency, dark theme
// ============================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#0a0a0f',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: '2rem',
  },
  card: {
    width: '100%',
    maxWidth: '640px',
    backgroundColor: '#111827',
    borderRadius: '16px',
    border: '1px solid #1F2937',
    padding: '2.5rem',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '2rem',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: 700,
    color: '#F9FAFB',
    margin: '0 0 0.5rem 0',
  },
  subtitle: {
    fontSize: '0.95rem',
    color: '#9CA3AF',
    margin: 0,
    lineHeight: 1.5,
  },
  error: {
    backgroundColor: '#7F1D1D',
    color: '#FCA5A5',
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    marginBottom: '1.5rem',
    fontSize: '0.875rem',
  },
  roleList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
    marginBottom: '1.5rem',
  },
  roleButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    width: '100%',
    padding: '1rem 1.25rem',
    backgroundColor: '#1F2937',
    border: '2px solid #374151',
    borderRadius: '12px',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'all 0.2s ease',
    color: '#F9FAFB',
    fontFamily: 'inherit',
    fontSize: '1rem',
  },
  roleIcon: {
    fontSize: '2rem',
    flexShrink: 0,
    width: '48px',
    textAlign: 'center' as const,
  },
  roleInfo: {
    flex: 1,
    minWidth: 0,
  },
  roleName: {
    fontWeight: 600,
    fontSize: '1rem',
    color: '#F9FAFB',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.25rem',
  },
  badge: {
    fontSize: '0.625rem',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '4px',
    color: '#000',
    letterSpacing: '0.05em',
  },
  roleDescription: {
    fontSize: '0.8rem',
    color: '#9CA3AF',
    marginBottom: '0.25rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  roleMeta: {
    fontSize: '0.75rem',
    color: '#6B7280',
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
  },
  separator: {
    color: '#4B5563',
  },
  arrow: {
    fontSize: '1.25rem',
    color: '#6B7280',
    flexShrink: 0,
  },
  hint: {
    textAlign: 'center' as const,
    fontSize: '0.8rem',
    color: '#6B7280',
    margin: 0,
    lineHeight: 1.5,
  },
};

export default RoleSelector;