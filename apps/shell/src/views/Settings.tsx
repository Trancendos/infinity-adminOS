import React, { useState } from 'react';

type SettingsSection = 'general' | 'appearance' | 'security' | 'privacy' | 'integrations' | 'advanced';

export default function Settings() {
  const [section, setSection] = useState<SettingsSection>('general');
  const [theme, setTheme] = useState('system');
  const [language, setLanguage] = useState('en');
  const [notifications, setNotifications] = useState(true);
  const [sounds, setSounds] = useState(true);
  const [mfaEnabled, setMfaEnabled] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState('30');
  const [telemetry, setTelemetry] = useState(false);
  const [gdprConsent, setGdprConsent] = useState(true);
  const [dataRetention, setDataRetention] = useState('90');
  const [fontSize, setFontSize] = useState('14');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [highContrast, setHighContrast] = useState(false);

  const sections: Array<{ id: SettingsSection; label: string; icon: string }> = [
    { id: 'general', label: 'General', icon: '⚙️' },
    { id: 'appearance', label: 'Appearance', icon: '🎨' },
    { id: 'security', label: 'Security', icon: '🔒' },
    { id: 'privacy', label: 'Privacy & GDPR', icon: '🛡️' },
    { id: 'integrations', label: 'Integrations', icon: '🔗' },
    { id: 'advanced', label: 'Advanced', icon: '🔧' },
  ];

  const SettingRow = ({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0', borderBottom: '1px solid var(--color-border)' }}>
      <div>
        <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{label}</div>
        {description && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.125rem' }}>{description}</div>}
      </div>
      <div>{children}</div>
    </div>
  );

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer', position: 'relative',
        background: checked ? 'var(--color-primary)' : 'var(--color-border)', transition: 'background 0.2s',
      }}
    >
      <div style={{
        width: '20px', height: '20px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '2px',
        left: checked ? '22px' : '2px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  );

  return (
    <div style={{ height: '100%', display: 'flex', background: 'var(--color-surface)', color: 'var(--color-text)' }}>
      {/* Sidebar */}
      <div style={{ width: '220px', borderRight: '1px solid var(--color-border)', background: 'var(--color-bg)', padding: '1rem 0' }}>
        <h2 style={{ margin: '0 1rem 1rem', fontSize: '1.125rem', fontWeight: 700 }}>⚙️ Settings</h2>
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.625rem', width: '100%', padding: '0.625rem 1rem',
              border: 'none', cursor: 'pointer', fontSize: '0.875rem', textAlign: 'left',
              background: section === s.id ? 'rgba(99,102,241,0.1)' : 'transparent',
              color: section === s.id ? 'var(--color-primary)' : 'var(--color-text)',
              fontWeight: section === s.id ? 600 : 400,
              borderLeft: section === s.id ? '3px solid var(--color-primary)' : '3px solid transparent',
            }}
          >
            <span>{s.icon}</span> {s.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem 2rem' }}>
        {section === 'general' && (
          <div>
            <h3 style={{ margin: '0 0 1.5rem', fontSize: '1.25rem', fontWeight: 600 }}>General Settings</h3>
            <SettingRow label="Language" description="Interface language">
              <select value={language} onChange={e => setLanguage(e.target.value)} style={{ padding: '0.375rem 0.75rem', borderRadius: '0.375rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: '0.875rem' }}>
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="ja">日本語</option>
              </select>
            </SettingRow>
            <SettingRow label="Notifications" description="Enable desktop and in-app notifications">
              <Toggle checked={notifications} onChange={setNotifications} />
            </SettingRow>
            <SettingRow label="Sound Effects" description="Play sounds for notifications and actions">
              <Toggle checked={sounds} onChange={setSounds} />
            </SettingRow>
            <SettingRow label="Auto-lock" description="Lock screen after inactivity">
              <select value={sessionTimeout} onChange={e => setSessionTimeout(e.target.value)} style={{ padding: '0.375rem 0.75rem', borderRadius: '0.375rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: '0.875rem' }}>
                <option value="5">5 minutes</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="never">Never</option>
              </select>
            </SettingRow>
          </div>
        )}

        {section === 'appearance' && (
          <div>
            <h3 style={{ margin: '0 0 1.5rem', fontSize: '1.25rem', fontWeight: 600 }}>Appearance</h3>
            <SettingRow label="Theme" description="Choose your preferred color scheme">
              <select value={theme} onChange={e => setTheme(e.target.value)} style={{ padding: '0.375rem 0.75rem', borderRadius: '0.375rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: '0.875rem' }}>
                <option value="system">System Default</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="high-contrast">High Contrast</option>
              </select>
            </SettingRow>
            <SettingRow label="Font Size" description="Base font size for the interface">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="range" min="12" max="20" value={fontSize} onChange={e => setFontSize(e.target.value)} style={{ width: '120px' }} />
                <span style={{ fontSize: '0.875rem', fontFamily: 'var(--font-mono)', minWidth: '30px' }}>{fontSize}px</span>
              </div>
            </SettingRow>
            <SettingRow label="Reduced Motion" description="Minimize animations (WCAG 2.2 AA)">
              <Toggle checked={reducedMotion} onChange={setReducedMotion} />
            </SettingRow>
            <SettingRow label="High Contrast" description="Increase contrast for better visibility (WCAG 2.2 AA)">
              <Toggle checked={highContrast} onChange={setHighContrast} />
            </SettingRow>
          </div>
        )}

        {section === 'security' && (
          <div>
            <h3 style={{ margin: '0 0 1.5rem', fontSize: '1.25rem', fontWeight: 600 }}>Security</h3>
            <SettingRow label="Multi-Factor Authentication" description="Require MFA for login (WebAuthn/TOTP)">
              <Toggle checked={mfaEnabled} onChange={setMfaEnabled} />
            </SettingRow>
            <SettingRow label="Passkey Management" description="Manage registered FIDO2/WebAuthn passkeys">
              <button style={{ padding: '0.375rem 1rem', borderRadius: '0.375rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', cursor: 'pointer', fontSize: '0.8125rem' }}>
                Manage Passkeys
              </button>
            </SettingRow>
            <SettingRow label="Active Sessions" description="View and revoke active login sessions">
              <button style={{ padding: '0.375rem 1rem', borderRadius: '0.375rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', cursor: 'pointer', fontSize: '0.8125rem' }}>
                View Sessions
              </button>
            </SettingRow>
            <SettingRow label="Audit Log" description="View security events and login history">
              <button style={{ padding: '0.375rem 1rem', borderRadius: '0.375rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', cursor: 'pointer', fontSize: '0.8125rem' }}>
                View Audit Log
              </button>
            </SettingRow>
            <SettingRow label="Change Password" description="Update your account password">
              <button style={{ padding: '0.375rem 1rem', borderRadius: '0.375rem', border: '1px solid var(--color-primary)', background: 'transparent', color: 'var(--color-primary)', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600 }}>
                Change Password
              </button>
            </SettingRow>
          </div>
        )}

        {section === 'privacy' && (
          <div>
            <h3 style={{ margin: '0 0 1.5rem', fontSize: '1.25rem', fontWeight: 600 }}>Privacy & GDPR</h3>
            <div style={{ padding: '1rem', borderRadius: '0.75rem', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', marginBottom: '1.5rem', fontSize: '0.8125rem' }}>
              🛡️ Infinity OS is fully GDPR compliant. Your data is encrypted at rest and in transit. You have full control over your personal data.
            </div>
            <SettingRow label="Data Processing Consent" description="Allow processing of personal data (GDPR Art. 6)">
              <Toggle checked={gdprConsent} onChange={setGdprConsent} />
            </SettingRow>
            <SettingRow label="Analytics & Telemetry" description="Help improve Infinity OS with anonymous usage data">
              <Toggle checked={telemetry} onChange={setTelemetry} />
            </SettingRow>
            <SettingRow label="Data Retention Period" description="How long to keep your data before auto-deletion">
              <select value={dataRetention} onChange={e => setDataRetention(e.target.value)} style={{ padding: '0.375rem 0.75rem', borderRadius: '0.375rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: '0.875rem' }}>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="365">1 year</option>
                <option value="forever">Keep forever</option>
              </select>
            </SettingRow>
            <SettingRow label="Export My Data" description="Download all your personal data (GDPR Art. 20)">
              <button style={{ padding: '0.375rem 1rem', borderRadius: '0.375rem', border: '1px solid var(--color-primary)', background: 'transparent', color: 'var(--color-primary)', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600 }}>
                📥 Export Data
              </button>
            </SettingRow>
            <SettingRow label="Delete My Account" description="Permanently delete all data (GDPR Art. 17 — Right to Erasure)">
              <button style={{ padding: '0.375rem 1rem', borderRadius: '0.375rem', border: '1px solid var(--color-error)', background: 'transparent', color: 'var(--color-error)', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600 }}>
                🗑️ Delete Account
              </button>
            </SettingRow>
          </div>
        )}

        {section === 'integrations' && (
          <div>
            <h3 style={{ margin: '0 0 1.5rem', fontSize: '1.25rem', fontWeight: 600 }}>Connected Integrations</h3>
            {[
              { name: 'GitHub', icon: '🐙', status: 'connected', scopes: 'repo, workflow' },
              { name: 'Slack', icon: '💬', status: 'connected', scopes: 'chat:write, channels:read' },
              { name: 'GitLab', icon: '🦊', status: 'disconnected', scopes: '' },
              { name: 'Discord', icon: '🎮', status: 'disconnected', scopes: '' },
              { name: 'Jira', icon: '📋', status: 'disconnected', scopes: '' },
              { name: 'PagerDuty', icon: '🚨', status: 'disconnected', scopes: '' },
            ].map(integration => (
              <div key={integration.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.875rem 0', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>{integration.icon}</span>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{integration.name}</div>
                    {integration.scopes && <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>Scopes: {integration.scopes}</div>}
                  </div>
                </div>
                <button style={{
                  padding: '0.375rem 1rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                  background: integration.status === 'connected' ? 'rgba(239,68,68,0.1)' : 'var(--color-primary)',
                  color: integration.status === 'connected' ? 'var(--color-error)' : '#fff',
                }}>
                  {integration.status === 'connected' ? 'Disconnect' : 'Connect'}
                </button>
              </div>
            ))}
          </div>
        )}

        {section === 'advanced' && (
          <div>
            <h3 style={{ margin: '0 0 1.5rem', fontSize: '1.25rem', fontWeight: 600 }}>Advanced Settings</h3>
            <SettingRow label="Developer Mode" description="Enable developer tools and debug console">
              <Toggle checked={false} onChange={() => {}} />
            </SettingRow>
            <SettingRow label="Experimental Features" description="Enable beta features (may be unstable)">
              <Toggle checked={false} onChange={() => {}} />
            </SettingRow>
            <SettingRow label="API Access" description="Manage API keys for programmatic access">
              <button style={{ padding: '0.375rem 1rem', borderRadius: '0.375rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', cursor: 'pointer', fontSize: '0.8125rem' }}>
                Manage API Keys
              </button>
            </SettingRow>
            <SettingRow label="Clear Cache" description="Clear local storage and cached data">
              <button style={{ padding: '0.375rem 1rem', borderRadius: '0.375rem', border: '1px solid var(--color-warning)', background: 'transparent', color: 'var(--color-warning)', cursor: 'pointer', fontSize: '0.8125rem' }}>
                Clear Cache
              </button>
            </SettingRow>
            <div style={{ marginTop: '2rem', padding: '1rem', borderRadius: '0.75rem', background: 'var(--color-bg)', border: '1px solid var(--color-border)', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>System Information</div>
              <div>Version: Infinity OS v0.1.0</div>
              <div>Kernel: Microkernel v1 (Service Worker)</div>
              <div>Runtime: WASM + Cloudflare Workers</div>
              <div>Database: PostgreSQL 15 (Supabase)</div>
              <div>Storage: Cloudflare R2</div>
              <div>Compliance: ISO 27001, GDPR, SOC 2, WCAG 2.2 AA</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}