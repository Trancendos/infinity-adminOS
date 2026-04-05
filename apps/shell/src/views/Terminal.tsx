import React, { useState, useRef, useEffect } from 'react';

interface TerminalLine {
  id: string;
  type: 'input' | 'output' | 'error' | 'system';
  content: string;
  timestamp: string;
}

const WELCOME = `╔══════════════════════════════════════════╗
║         ∞  INFINITY OS  TERMINAL  ∞     ║
║         v0.1.0 — Zero-Cost Virtual OS   ║
╚══════════════════════════════════════════╝

Type 'help' for available commands.
`;

const COMMANDS: Record<string, (args: string[]) => string> = {
  help: () => `Available commands:
  help          Show this help message
  clear         Clear terminal
  whoami        Show current user
  uname         Show system information
  uptime        Show system uptime
  ls            List files in current directory
  pwd           Print working directory
  cat <file>    Display file contents
  echo <text>   Print text
  date          Show current date/time
  health        Check service health
  scan          Run security scan
  agents        List active agents
  modules       List installed modules
  neofetch      System information display
  version       Show Infinity OS version`,

  whoami: () => 'drew@infinity-os',
  pwd: () => '/home/drew',
  date: () => new Date().toISOString(),
  version: () => 'Infinity OS v0.1.0 (build a3f8c21)',
  uname: () => 'InfinityOS 0.1.0 WASM/aarch64 Cloudflare-Workers/K3s',
  uptime: () => `up ${Math.floor(Math.random() * 30) + 1} days, ${Math.floor(Math.random() * 24)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`,

  ls: () => `drwxr-xr-x  Documents/
drwxr-xr-x  Downloads/
drwxr-xr-x  Projects/
drwxr-xr-x  .config/
-rw-r--r--  .profile
-rw-r--r--  README.md`,

  neofetch: () => `        ∞∞∞∞∞∞∞∞          drew@infinity-os
       ∞∞      ∞∞         ─────────────────
      ∞∞   OS   ∞∞        OS: Infinity OS 0.1.0
     ∞∞          ∞∞       Kernel: Microkernel v1
    ∞∞    ∞∞∞∞    ∞∞      Shell: infinity-shell
   ∞∞    ∞∞  ∞∞    ∞∞     Runtime: WASM + Workers
  ∞∞    ∞∞    ∞∞    ∞∞    CPU: Cloudflare Edge
   ∞∞    ∞∞  ∞∞    ∞∞     Memory: 256MB (sandbox)
    ∞∞    ∞∞∞∞    ∞∞      Storage: R2 (10GB free)
     ∞∞          ∞∞       DB: PostgreSQL 15
      ∞∞        ∞∞        Uptime: 99.99%
       ∞∞∞∞∞∞∞∞∞∞         Cost: $0.00/month`,

  health: () => `Service Health Check:
  🟢 Identity      12ms   UP
  🟢 Filesystem    24ms   UP
  🟢 Registry      18ms   UP
  🟢 Search        45ms   UP
  🟡 AI           230ms   DEGRADED
  🟢 Notifications  15ms   UP

Overall: 5/6 healthy`,

  scan: () => `🔍 Security Scan Results:
  ✅ No critical CVEs found
  ✅ No secrets in codebase
  ✅ All dependencies up to date
  ✅ RLS policies active on all tables
  ✅ SBOM generated: sbom.cdx.json
  
  Last scan: ${new Date().toISOString()}`,

  agents: () => `Active Agents:
  🟢 Content Writer Alpha    342 tasks   $127.50
  🟢 Market Analyst          156 tasks    $89.30
  🟢 Support Bot            1247 tasks    $45.00
  🟡 Data Scraper (paused)    89 tasks    $23.10
  🟢 Infra Monitor          5678 tasks     $0.00`,

  modules: () => `Installed Modules:
  📝 Code Editor      v2.1.0  (WASM)
  💻 Terminal Pro     v1.5.2  (WASM)
  🤖 AI Assistant     v3.0.1  (WASM)

  3 installed, 9 available in marketplace`,

  echo: (args: string[]) => args.join(' '),
  cat: (args: string[]) => args[0] ? `Contents of ${args[0]}:\n[File content would be displayed here]` : 'Usage: cat <filename>',
};

export default function Terminal() {
  const [lines, setLines] = useState<TerminalLine[]>([
    { id: '0', type: 'system', content: WELCOME, timestamp: new Date().toISOString() },
  ]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const executeCommand = (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    const newLines: TerminalLine[] = [
      { id: crypto.randomUUID(), type: 'input', content: `drew@infinity-os:~$ ${trimmed}`, timestamp: new Date().toISOString() },
    ];

    if (trimmed === 'clear') {
      setLines([]);
      setInput('');
      setHistory(prev => [...prev, trimmed]);
      setHistoryIndex(-1);
      return;
    }

    const [command, ...args] = trimmed.split(' ');
    const handler = COMMANDS[command];

    if (handler) {
      newLines.push({ id: crypto.randomUUID(), type: 'output', content: handler(args), timestamp: new Date().toISOString() });
    } else {
      newLines.push({ id: crypto.randomUUID(), type: 'error', content: `infinity: command not found: ${command}`, timestamp: new Date().toISOString() });
    }

    setLines(prev => [...prev, ...newLines]);
    setInput('');
    setHistory(prev => [...prev, trimmed]);
    setHistoryIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      executeCommand(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(history[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1;
        if (newIndex >= history.length) {
          setHistoryIndex(-1);
          setInput('');
        } else {
          setHistoryIndex(newIndex);
          setInput(history[newIndex]);
        }
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const partial = input.trim().toLowerCase();
      const match = Object.keys(COMMANDS).find(c => c.startsWith(partial));
      if (match) setInput(match);
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    }
  };

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      style={{ height: '100%', background: '#0d1117', color: '#c9d1d9', fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)', fontSize: '0.8125rem', display: 'flex', flexDirection: 'column', cursor: 'text' }}
    >
      <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
        {lines.map(line => (
          <div key={line.id} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: line.type === 'error' ? '#f85149' : line.type === 'input' ? '#58a6ff' : line.type === 'system' ? '#8b949e' : '#c9d1d9' }}>
            {line.content}
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', lineHeight: 1.6 }}>
          <span style={{ color: '#58a6ff' }}>drew@infinity-os:~$ </span>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            spellCheck={false}
            style={{ flex: 1, background: 'transparent', border: 'none', color: '#c9d1d9', fontFamily: 'inherit', fontSize: 'inherit', outline: 'none', padding: 0, caretColor: '#58a6ff' }}
          />
        </div>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}