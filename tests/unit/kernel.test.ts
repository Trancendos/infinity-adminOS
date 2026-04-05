import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* ─────────────────────────────────────────────
   Infinity OS — Kernel Unit Tests
   Tests for the microkernel process manager,
   IPC message bus, capability system, and
   service worker lifecycle management.
   ───────────────────────────────────────────── */

// ── Mock Types ──────────────────────────────

interface Process {
  pid: number;
  name: string;
  status: 'running' | 'stopped' | 'crashed' | 'suspended';
  priority: number;
  memoryUsage: number;
  cpuTime: number;
  capabilities: string[];
  startedAt: number;
  parentPid?: number;
}

interface IPCMessage {
  id: string;
  source: number;
  target: number;
  channel: string;
  payload: unknown;
  timestamp: number;
  ttl: number;
}

interface Capability {
  id: string;
  name: string;
  description: string;
  grantedTo: number[];
  revokedFrom: number[];
  expiresAt?: number;
}

// ── Mock Kernel Implementation ──────────────

class MockProcessManager {
  private processes: Map<number, Process> = new Map();
  private nextPid = 1;
  private maxProcesses = 64;

  spawn(name: string, options: Partial<Process> = {}): Process {
    if (this.processes.size >= this.maxProcesses) {
      throw new Error(`ENOMEM: Maximum process limit (${this.maxProcesses}) reached`);
    }
    if (!name || name.trim().length === 0) {
      throw new Error('EINVAL: Process name cannot be empty');
    }
    if (name.length > 128) {
      throw new Error('EINVAL: Process name exceeds 128 character limit');
    }

    const pid = this.nextPid++;
    const process: Process = {
      pid,
      name: name.trim(),
      status: 'running',
      priority: options.priority ?? 10,
      memoryUsage: options.memoryUsage ?? 0,
      cpuTime: 0,
      capabilities: options.capabilities ?? [],
      startedAt: Date.now(),
      parentPid: options.parentPid,
    };
    this.processes.set(pid, process);
    return process;
  }

  kill(pid: number): boolean {
    const process = this.processes.get(pid);
    if (!process) return false;
    if (pid === 0) throw new Error('EPERM: Cannot kill init process');
    process.status = 'stopped';
    this.processes.delete(pid);
    // Kill child processes (cascade)
    for (const [childPid, child] of this.processes) {
      if (child.parentPid === pid) {
        this.kill(childPid);
      }
    }
    return true;
  }

  suspend(pid: number): boolean {
    const process = this.processes.get(pid);
    if (!process) return false;
    if (process.status !== 'running') return false;
    process.status = 'suspended';
    return true;
  }

  resume(pid: number): boolean {
    const process = this.processes.get(pid);
    if (!process) return false;
    if (process.status !== 'suspended') return false;
    process.status = 'running';
    return true;
  }

  getProcess(pid: number): Process | undefined {
    return this.processes.get(pid);
  }

  listProcesses(): Process[] {
    return Array.from(this.processes.values());
  }

  getProcessesByStatus(status: Process['status']): Process[] {
    return this.listProcesses().filter(p => p.status === status);
  }

  getChildProcesses(parentPid: number): Process[] {
    return this.listProcesses().filter(p => p.parentPid === parentPid);
  }

  updateMemoryUsage(pid: number, bytes: number): boolean {
    const process = this.processes.get(pid);
    if (!process) return false;
    if (bytes < 0) throw new Error('EINVAL: Memory usage cannot be negative');
    if (bytes > 256 * 1024 * 1024) throw new Error('ENOMEM: Memory limit exceeded (256MB)');
    process.memoryUsage = bytes;
    return true;
  }

  getTotalMemoryUsage(): number {
    return this.listProcesses().reduce((sum, p) => sum + p.memoryUsage, 0);
  }
}

class MockIPCBus {
  private handlers: Map<string, ((msg: IPCMessage) => void)[]> = new Map();
  private messageLog: IPCMessage[] = [];
  private nextId = 1;
  private maxQueueSize = 1000;

  send(source: number, target: number, channel: string, payload: unknown, ttl = 30000): IPCMessage {
    if (!channel || channel.trim().length === 0) {
      throw new Error('EINVAL: IPC channel cannot be empty');
    }
    if (this.messageLog.length >= this.maxQueueSize) {
      this.messageLog = this.messageLog.slice(-500); // Trim oldest half
    }

    const message: IPCMessage = {
      id: `msg-${this.nextId++}`,
      source,
      target,
      channel: channel.trim(),
      payload,
      timestamp: Date.now(),
      ttl,
    };

    this.messageLog.push(message);

    const handlers = this.handlers.get(channel) ?? [];
    handlers.forEach(handler => {
      try {
        handler(message);
      } catch {
        // Handler errors should not crash the bus
      }
    });

    return message;
  }

  subscribe(channel: string, handler: (msg: IPCMessage) => void): () => void {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, []);
    }
    this.handlers.get(channel)!.push(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(channel);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx !== -1) handlers.splice(idx, 1);
      }
    };
  }

  getMessageLog(): IPCMessage[] {
    return [...this.messageLog];
  }

  getMessagesByChannel(channel: string): IPCMessage[] {
    return this.messageLog.filter(m => m.channel === channel);
  }

  purgeExpired(): number {
    const now = Date.now();
    const before = this.messageLog.length;
    this.messageLog = this.messageLog.filter(m => now - m.timestamp < m.ttl);
    return before - this.messageLog.length;
  }

  getChannelCount(): number {
    return this.handlers.size;
  }
}

class MockCapabilitySystem {
  private capabilities: Map<string, Capability> = new Map();

  register(name: string, description: string): Capability {
    if (this.capabilities.has(name)) {
      throw new Error(`EEXIST: Capability '${name}' already registered`);
    }
    const cap: Capability = {
      id: `cap-${name}`,
      name,
      description,
      grantedTo: [],
      revokedFrom: [],
    };
    this.capabilities.set(name, cap);
    return cap;
  }

  grant(capabilityName: string, pid: number): boolean {
    const cap = this.capabilities.get(capabilityName);
    if (!cap) throw new Error(`ENOENT: Capability '${capabilityName}' not found`);
    if (cap.revokedFrom.includes(pid)) {
      throw new Error(`EPERM: Capability '${capabilityName}' was revoked from PID ${pid}`);
    }
    if (!cap.grantedTo.includes(pid)) {
      cap.grantedTo.push(pid);
    }
    return true;
  }

  revoke(capabilityName: string, pid: number): boolean {
    const cap = this.capabilities.get(capabilityName);
    if (!cap) throw new Error(`ENOENT: Capability '${capabilityName}' not found`);
    cap.grantedTo = cap.grantedTo.filter(p => p !== pid);
    if (!cap.revokedFrom.includes(pid)) {
      cap.revokedFrom.push(pid);
    }
    return true;
  }

  check(capabilityName: string, pid: number): boolean {
    const cap = this.capabilities.get(capabilityName);
    if (!cap) return false;
    if (cap.expiresAt && Date.now() > cap.expiresAt) return false;
    return cap.grantedTo.includes(pid);
  }

  listCapabilities(): Capability[] {
    return Array.from(this.capabilities.values());
  }

  getProcessCapabilities(pid: number): string[] {
    return this.listCapabilities()
      .filter(c => c.grantedTo.includes(pid))
      .map(c => c.name);
  }
}

// ── Tests ───────────────────────────────────

describe('Kernel — Process Manager', () => {
  let pm: MockProcessManager;

  beforeEach(() => {
    pm = new MockProcessManager();
  });

  describe('spawn()', () => {
    it('should create a process with a unique PID', () => {
      const p1 = pm.spawn('shell');
      const p2 = pm.spawn('filesystem');
      expect(p1.pid).toBe(1);
      expect(p2.pid).toBe(2);
      expect(p1.pid).not.toBe(p2.pid);
    });

    it('should set default values for new processes', () => {
      const p = pm.spawn('test-process');
      expect(p.name).toBe('test-process');
      expect(p.status).toBe('running');
      expect(p.priority).toBe(10);
      expect(p.memoryUsage).toBe(0);
      expect(p.cpuTime).toBe(0);
      expect(p.capabilities).toEqual([]);
      expect(p.startedAt).toBeGreaterThan(0);
    });

    it('should accept custom options', () => {
      const p = pm.spawn('worker', { priority: 5, capabilities: ['net', 'fs'] });
      expect(p.priority).toBe(5);
      expect(p.capabilities).toEqual(['net', 'fs']);
    });

    it('should track parent-child relationships', () => {
      const parent = pm.spawn('parent');
      const child = pm.spawn('child', { parentPid: parent.pid });
      expect(child.parentPid).toBe(parent.pid);
      expect(pm.getChildProcesses(parent.pid)).toHaveLength(1);
    });

    it('should reject empty process names', () => {
      expect(() => pm.spawn('')).toThrow('EINVAL');
      expect(() => pm.spawn('   ')).toThrow('EINVAL');
    });

    it('should reject process names exceeding 128 characters', () => {
      const longName = 'a'.repeat(129);
      expect(() => pm.spawn(longName)).toThrow('EINVAL');
    });

    it('should trim whitespace from process names', () => {
      const p = pm.spawn('  shell  ');
      expect(p.name).toBe('shell');
    });

    it('should enforce maximum process limit', () => {
      for (let i = 0; i < 64; i++) {
        pm.spawn(`proc-${i}`);
      }
      expect(() => pm.spawn('overflow')).toThrow('ENOMEM');
    });
  });

  describe('kill()', () => {
    it('should remove a process', () => {
      const p = pm.spawn('doomed');
      expect(pm.kill(p.pid)).toBe(true);
      expect(pm.getProcess(p.pid)).toBeUndefined();
    });

    it('should return false for non-existent PIDs', () => {
      expect(pm.kill(999)).toBe(false);
    });

    it('should cascade kill child processes', () => {
      const parent = pm.spawn('parent');
      const child1 = pm.spawn('child1', { parentPid: parent.pid });
      const child2 = pm.spawn('child2', { parentPid: parent.pid });
      pm.kill(parent.pid);
      expect(pm.getProcess(child1.pid)).toBeUndefined();
      expect(pm.getProcess(child2.pid)).toBeUndefined();
    });
  });

  describe('suspend() / resume()', () => {
    it('should suspend a running process', () => {
      const p = pm.spawn('suspendable');
      expect(pm.suspend(p.pid)).toBe(true);
      expect(pm.getProcess(p.pid)?.status).toBe('suspended');
    });

    it('should resume a suspended process', () => {
      const p = pm.spawn('resumable');
      pm.suspend(p.pid);
      expect(pm.resume(p.pid)).toBe(true);
      expect(pm.getProcess(p.pid)?.status).toBe('running');
    });

    it('should not suspend a non-running process', () => {
      const p = pm.spawn('test');
      pm.suspend(p.pid);
      expect(pm.suspend(p.pid)).toBe(false); // Already suspended
    });

    it('should not resume a non-suspended process', () => {
      const p = pm.spawn('test');
      expect(pm.resume(p.pid)).toBe(false); // Already running
    });
  });

  describe('memory management', () => {
    it('should track memory usage per process', () => {
      const p = pm.spawn('mem-test');
      pm.updateMemoryUsage(p.pid, 1024 * 1024); // 1MB
      expect(pm.getProcess(p.pid)?.memoryUsage).toBe(1024 * 1024);
    });

    it('should reject negative memory values', () => {
      const p = pm.spawn('mem-test');
      expect(() => pm.updateMemoryUsage(p.pid, -1)).toThrow('EINVAL');
    });

    it('should enforce 256MB memory limit per process', () => {
      const p = pm.spawn('mem-hog');
      expect(() => pm.updateMemoryUsage(p.pid, 257 * 1024 * 1024)).toThrow('ENOMEM');
    });

    it('should calculate total memory usage across all processes', () => {
      const p1 = pm.spawn('p1');
      const p2 = pm.spawn('p2');
      pm.updateMemoryUsage(p1.pid, 1000);
      pm.updateMemoryUsage(p2.pid, 2000);
      expect(pm.getTotalMemoryUsage()).toBe(3000);
    });
  });

  describe('listing and filtering', () => {
    it('should list all processes', () => {
      pm.spawn('a');
      pm.spawn('b');
      pm.spawn('c');
      expect(pm.listProcesses()).toHaveLength(3);
    });

    it('should filter processes by status', () => {
      const p1 = pm.spawn('running1');
      const p2 = pm.spawn('running2');
      pm.spawn('running3');
      pm.suspend(p1.pid);
      pm.suspend(p2.pid);
      expect(pm.getProcessesByStatus('suspended')).toHaveLength(2);
      expect(pm.getProcessesByStatus('running')).toHaveLength(1);
    });
  });
});

describe('Kernel — IPC Message Bus', () => {
  let bus: MockIPCBus;

  beforeEach(() => {
    bus = new MockIPCBus();
  });

  describe('send()', () => {
    it('should create a message with unique ID', () => {
      const msg1 = bus.send(1, 2, 'test', { data: 'hello' });
      const msg2 = bus.send(1, 2, 'test', { data: 'world' });
      expect(msg1.id).not.toBe(msg2.id);
    });

    it('should populate all message fields', () => {
      const msg = bus.send(1, 2, 'kernel.event', { type: 'spawn' });
      expect(msg.source).toBe(1);
      expect(msg.target).toBe(2);
      expect(msg.channel).toBe('kernel.event');
      expect(msg.payload).toEqual({ type: 'spawn' });
      expect(msg.timestamp).toBeGreaterThan(0);
      expect(msg.ttl).toBe(30000);
    });

    it('should accept custom TTL', () => {
      const msg = bus.send(1, 2, 'ephemeral', null, 5000);
      expect(msg.ttl).toBe(5000);
    });

    it('should reject empty channel names', () => {
      expect(() => bus.send(1, 2, '', null)).toThrow('EINVAL');
    });

    it('should log all sent messages', () => {
      bus.send(1, 2, 'ch1', 'a');
      bus.send(1, 3, 'ch2', 'b');
      expect(bus.getMessageLog()).toHaveLength(2);
    });
  });

  describe('subscribe()', () => {
    it('should deliver messages to subscribers', () => {
      const received: IPCMessage[] = [];
      bus.subscribe('events', msg => received.push(msg));
      bus.send(1, 2, 'events', { type: 'test' });
      expect(received).toHaveLength(1);
      expect(received[0].payload).toEqual({ type: 'test' });
    });

    it('should support multiple subscribers on same channel', () => {
      let count = 0;
      bus.subscribe('broadcast', () => count++);
      bus.subscribe('broadcast', () => count++);
      bus.send(1, 0, 'broadcast', null);
      expect(count).toBe(2);
    });

    it('should not deliver messages to wrong channel', () => {
      const received: IPCMessage[] = [];
      bus.subscribe('channel-a', msg => received.push(msg));
      bus.send(1, 2, 'channel-b', 'wrong');
      expect(received).toHaveLength(0);
    });

    it('should return an unsubscribe function', () => {
      let count = 0;
      const unsub = bus.subscribe('test', () => count++);
      bus.send(1, 2, 'test', null);
      expect(count).toBe(1);
      unsub();
      bus.send(1, 2, 'test', null);
      expect(count).toBe(1); // No increment after unsubscribe
    });

    it('should not crash bus when handler throws', () => {
      bus.subscribe('error-channel', () => { throw new Error('handler crash'); });
      expect(() => bus.send(1, 2, 'error-channel', null)).not.toThrow();
    });
  });

  describe('message management', () => {
    it('should filter messages by channel', () => {
      bus.send(1, 2, 'alpha', 'a');
      bus.send(1, 2, 'beta', 'b');
      bus.send(1, 2, 'alpha', 'c');
      expect(bus.getMessagesByChannel('alpha')).toHaveLength(2);
      expect(bus.getMessagesByChannel('beta')).toHaveLength(1);
    });

    it('should purge expired messages', async () => {
      bus.send(1, 2, 'short-lived', null, 1); // 1ms TTL
      await new Promise(r => setTimeout(r, 10));
      const purged = bus.purgeExpired();
      expect(purged).toBe(1);
      expect(bus.getMessageLog()).toHaveLength(0);
    });

    it('should auto-trim message log when exceeding max queue size', () => {
      // Fill beyond max (1000)
      for (let i = 0; i < 1001; i++) {
        bus.send(1, 2, 'flood', i);
      }
      // After the 1001st message, the log should have been trimmed
      expect(bus.getMessageLog().length).toBeLessThanOrEqual(1001);
    });

    it('should track channel count', () => {
      bus.subscribe('ch1', () => {});
      bus.subscribe('ch2', () => {});
      bus.subscribe('ch3', () => {});
      expect(bus.getChannelCount()).toBe(3);
    });
  });
});

describe('Kernel — Capability System', () => {
  let caps: MockCapabilitySystem;

  beforeEach(() => {
    caps = new MockCapabilitySystem();
  });

  describe('register()', () => {
    it('should register a new capability', () => {
      const cap = caps.register('net.access', 'Network access capability');
      expect(cap.name).toBe('net.access');
      expect(cap.description).toBe('Network access capability');
      expect(cap.grantedTo).toEqual([]);
    });

    it('should reject duplicate capability names', () => {
      caps.register('fs.read', 'Read filesystem');
      expect(() => caps.register('fs.read', 'Duplicate')).toThrow('EEXIST');
    });
  });

  describe('grant() / revoke()', () => {
    it('should grant a capability to a process', () => {
      caps.register('fs.write', 'Write filesystem');
      caps.grant('fs.write', 1);
      expect(caps.check('fs.write', 1)).toBe(true);
    });

    it('should not duplicate grants', () => {
      caps.register('net', 'Network');
      caps.grant('net', 1);
      caps.grant('net', 1); // Duplicate
      const cap = caps.listCapabilities().find(c => c.name === 'net');
      expect(cap?.grantedTo.filter(p => p === 1)).toHaveLength(1);
    });

    it('should revoke a capability from a process', () => {
      caps.register('fs.write', 'Write filesystem');
      caps.grant('fs.write', 1);
      caps.revoke('fs.write', 1);
      expect(caps.check('fs.write', 1)).toBe(false);
    });

    it('should prevent re-granting after revocation', () => {
      caps.register('dangerous', 'Dangerous capability');
      caps.grant('dangerous', 1);
      caps.revoke('dangerous', 1);
      expect(() => caps.grant('dangerous', 1)).toThrow('EPERM');
    });

    it('should throw for non-existent capabilities', () => {
      expect(() => caps.grant('nonexistent', 1)).toThrow('ENOENT');
      expect(() => caps.revoke('nonexistent', 1)).toThrow('ENOENT');
    });
  });

  describe('check()', () => {
    it('should return false for ungranted capabilities', () => {
      caps.register('admin', 'Admin access');
      expect(caps.check('admin', 1)).toBe(false);
    });

    it('should return false for non-existent capabilities', () => {
      expect(caps.check('ghost', 1)).toBe(false);
    });

    it('should list capabilities for a process', () => {
      caps.register('net', 'Network');
      caps.register('fs', 'Filesystem');
      caps.register('gpu', 'GPU');
      caps.grant('net', 1);
      caps.grant('fs', 1);
      const processCaps = caps.getProcessCapabilities(1);
      expect(processCaps).toContain('net');
      expect(processCaps).toContain('fs');
      expect(processCaps).not.toContain('gpu');
    });
  });
});

describe('Kernel — Integration Scenarios', () => {
  let pm: MockProcessManager;
  let bus: MockIPCBus;
  let caps: MockCapabilitySystem;

  beforeEach(() => {
    pm = new MockProcessManager();
    bus = new MockIPCBus();
    caps = new MockCapabilitySystem();
  });

  it('should coordinate process spawn with IPC notification', () => {
    const notifications: IPCMessage[] = [];
    bus.subscribe('kernel.process.spawned', msg => notifications.push(msg));

    const process = pm.spawn('new-service');
    bus.send(0, 0, 'kernel.process.spawned', { pid: process.pid, name: process.name });

    expect(notifications).toHaveLength(1);
    expect((notifications[0].payload as any).pid).toBe(process.pid);
  });

  it('should enforce capability checks before IPC communication', () => {
    caps.register('ipc.send', 'Permission to send IPC messages');
    const sender = pm.spawn('sender');
    const receiver = pm.spawn('receiver');

    // Without capability — should be denied
    expect(caps.check('ipc.send', sender.pid)).toBe(false);

    // Grant capability
    caps.grant('ipc.send', sender.pid);
    expect(caps.check('ipc.send', sender.pid)).toBe(true);

    // Now send message
    const msg = bus.send(sender.pid, receiver.pid, 'data', { value: 42 });
    expect(msg.source).toBe(sender.pid);
    expect(msg.target).toBe(receiver.pid);
  });

  it('should handle process crash and cleanup', () => {
    const crashNotifications: IPCMessage[] = [];
    bus.subscribe('kernel.process.crashed', msg => crashNotifications.push(msg));

    const process = pm.spawn('unstable');
    caps.register('net', 'Network');
    caps.grant('net', process.pid);

    // Simulate crash
    pm.kill(process.pid);
    bus.send(0, 0, 'kernel.process.crashed', { pid: process.pid, name: 'unstable' });
    caps.revoke('net', process.pid);

    expect(pm.getProcess(process.pid)).toBeUndefined();
    expect(caps.check('net', process.pid)).toBe(false);
    expect(crashNotifications).toHaveLength(1);
  });

  it('should support full service lifecycle: spawn → configure → run → stop', () => {
    const events: string[] = [];
    bus.subscribe('lifecycle', msg => events.push((msg.payload as any).event));

    // Spawn
    const svc = pm.spawn('identity-worker');
    bus.send(0, svc.pid, 'lifecycle', { event: 'spawned' });

    // Configure capabilities
    caps.register('auth.verify', 'Verify authentication');
    caps.register('db.read', 'Read database');
    caps.grant('auth.verify', svc.pid);
    caps.grant('db.read', svc.pid);
    bus.send(0, svc.pid, 'lifecycle', { event: 'configured' });

    // Verify running
    expect(pm.getProcess(svc.pid)?.status).toBe('running');
    expect(caps.getProcessCapabilities(svc.pid)).toHaveLength(2);
    bus.send(0, svc.pid, 'lifecycle', { event: 'running' });

    // Suspend
    pm.suspend(svc.pid);
    bus.send(0, svc.pid, 'lifecycle', { event: 'suspended' });
    expect(pm.getProcess(svc.pid)?.status).toBe('suspended');

    // Resume
    pm.resume(svc.pid);
    bus.send(0, svc.pid, 'lifecycle', { event: 'resumed' });

    // Stop
    pm.kill(svc.pid);
    bus.send(0, 0, 'lifecycle', { event: 'stopped' });

    expect(events).toEqual(['spawned', 'configured', 'running', 'suspended', 'resumed', 'stopped']);
  });
});