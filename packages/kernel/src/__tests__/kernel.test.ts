/**
 * Infinity OS Kernel — Unit Tests
 * ═══════════════════════════════════════════════════════════════
 * Tests kernel lifecycle, event bus, IPC bus, process manager,
 * permission manager, storage API, and singleton behavior.
 * Uses vitest's node environment (no CF runtime needed).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  InfinityKernel,
  KERNEL_VERSION,
  KERNEL_NAME,
  getKernel,
  resetKernel,
} from '../index';

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════
describe('Kernel Constants', () => {
  it('KERNEL_VERSION is a semver string', () => {
    expect(KERNEL_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('KERNEL_NAME is defined', () => {
    expect(typeof KERNEL_NAME).toBe('string');
    expect(KERNEL_NAME.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Kernel Lifecycle
// ═══════════════════════════════════════════════════════════════
describe('InfinityKernel — Lifecycle', () => {
  let kernel: InfinityKernel;

  beforeEach(() => {
    kernel = new InfinityKernel();
  });

  it('starts in stopped state', () => {
    const status = kernel.getStatus();
    expect(status.status).toBe('stopped');
  });

  it('transitions to running after start()', async () => {
    await kernel.start();
    expect(kernel.getStatus().status).toBe('running');
  });

  it('transitions to stopped after stop()', async () => {
    await kernel.start();
    await kernel.stop();
    expect(kernel.getStatus().status).toBe('stopped');
  });

  it('does not throw when started twice', async () => {
    await kernel.start();
    await expect(kernel.start()).resolves.toBeUndefined();
  });

  it('getStatus includes name and version', async () => {
    const status = kernel.getStatus();
    expect(status.name).toBe(KERNEL_NAME);
    expect(status.version).toBe(KERNEL_VERSION);
  });

  it('uptime is 0 before start', () => {
    expect(kernel.uptime).toBe(0);
  });

  it('uptime is positive after start', async () => {
    await kernel.start();
    await new Promise((r) => setTimeout(r, 5));
    expect(kernel.uptime).toBeGreaterThan(0);
  });

  it('exposes version and name as readonly properties', () => {
    expect(kernel.version).toBe(KERNEL_VERSION);
    expect(kernel.name).toBe(KERNEL_NAME);
  });
});

// ═══════════════════════════════════════════════════════════════
// User Management
// ═══════════════════════════════════════════════════════════════
describe('InfinityKernel — User Management', () => {
  let kernel: InfinityKernel;

  beforeEach(async () => {
    kernel = new InfinityKernel();
    await kernel.start();
  });

  it('getUser returns null initially', () => {
    expect(kernel.getUser()).toBeNull();
  });

  it('setUser stores the user', () => {
    const user = { id: 'usr-1', email: 'alice@example.com', name: 'Alice', role: 'admin' };
    kernel.setUser(user as Parameters<typeof kernel.setUser>[0]);
    expect(kernel.getUser()?.email).toBe('alice@example.com');
  });

  it('setUser(null) clears the user', () => {
    const user = { id: 'usr-1', email: 'alice@example.com', name: 'Alice', role: 'admin' };
    kernel.setUser(user as Parameters<typeof kernel.setUser>[0]);
    kernel.setUser(null);
    expect(kernel.getUser()).toBeNull();
  });

  it('getStatus.currentUser shows email when user set', () => {
    const user = { id: 'usr-1', email: 'alice@example.com', name: 'Alice', role: 'admin' };
    kernel.setUser(user as Parameters<typeof kernel.setUser>[0]);
    expect(kernel.getStatus().currentUser).toBe('alice@example.com');
  });

  it('getStatus.currentUser is null when no user', () => {
    expect(kernel.getStatus().currentUser).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Event Bus
// ═══════════════════════════════════════════════════════════════
describe('InfinityKernel — Event Bus', () => {
  let kernel: InfinityKernel;

  beforeEach(async () => {
    kernel = new InfinityKernel();
    await kernel.start();
  });

  it('events property is defined', () => {
    expect(kernel.events).toBeDefined();
    expect(typeof kernel.events.on).toBe('function');
    expect(typeof kernel.events.emit).toBe('function');
    expect(typeof kernel.events.off).toBe('function');
  });

  it('on() returns an unsubscribe function', () => {
    const unsub = kernel.events.on('system:alert', vi.fn());
    expect(typeof unsub).toBe('function');
  });

  it('emits events to registered handlers', () => {
    const handler = vi.fn();
    kernel.events.on('system:alert', handler);
    kernel.events.emit({
      type: 'system:alert',
      payload: { message: 'test', level: 'info' },
      timestamp: Date.now(),
      source: 'test',
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('wildcard * handler receives all events', () => {
    const handler = vi.fn();
    kernel.events.on('*', handler);
    kernel.events.emit({ type: 'user:login', payload: {}, timestamp: Date.now(), source: 'test' });
    kernel.events.emit({ type: 'system:alert', payload: {}, timestamp: Date.now(), source: 'test' });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('off() unregisters handler', () => {
    const handler = vi.fn();
    const unsub = kernel.events.on('system:alert', handler);
    unsub(); // Unsubscribe
    kernel.events.emit({ type: 'system:alert', payload: {}, timestamp: Date.now(), source: 'test' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('setUser emits user:login event', () => {
    const handler = vi.fn();
    kernel.events.on('user:login', handler);
    const user = { id: 'usr-1', email: 'alice@example.com', name: 'Alice', role: 'user' };
    kernel.setUser(user as Parameters<typeof kernel.setUser>[0]);
    expect(handler).toHaveBeenCalled();
  });

  it('setUser(null) emits user:logout event', () => {
    const handler = vi.fn();
    kernel.events.on('user:logout', handler);
    const user = { id: 'usr-1', email: 'alice@example.com', name: 'Alice', role: 'user' };
    kernel.setUser(user as Parameters<typeof kernel.setUser>[0]);
    kernel.setUser(null);
    expect(handler).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// IPC Bus
// ═══════════════════════════════════════════════════════════════
describe('InfinityKernel — IPC Bus', () => {
  let kernel: InfinityKernel;

  beforeEach(async () => {
    kernel = new InfinityKernel();
    await kernel.start();
  });

  it('ipc property is defined', () => {
    expect(kernel.ipc).toBeDefined();
    expect(typeof kernel.ipc.register).toBe('function');
    expect(typeof kernel.ipc.send).toBe('function');
  });

  it('sends message to registered handler', async () => {
    const handler = vi.fn().mockResolvedValue({ result: 'ok' });
    kernel.ipc.register('module-a', 'ping', handler);
    const result = await kernel.ipc.send({
      id: 'msg-1',
      from: 'module-b',
      to: 'module-a',
      type: 'ping',
      payload: { data: 'hello' },
      timestamp: Date.now(),
    });
    expect(handler).toHaveBeenCalledOnce();
    expect(result).toEqual({ result: 'ok' });
  });

  it('returns null when no handler registered', async () => {
    const result = await kernel.ipc.send({
      id: 'msg-2',
      from: 'a',
      to: 'nonexistent-module',
      type: 'ping',
      payload: {},
      timestamp: Date.now(),
    });
    expect(result).toBeNull();
  });

  it('broadcast sends to all registered modules', async () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    kernel.ipc.register('mod-a', 'broadcast-event', handlerA);
    kernel.ipc.register('mod-b', 'broadcast-event', handlerB);
    await kernel.ipc.send({
      id: 'bc-1',
      from: 'kernel',
      to: 'broadcast',
      type: 'broadcast-event',
      payload: {},
      timestamp: Date.now(),
    });
    expect(handlerA).toHaveBeenCalled();
    expect(handlerB).toHaveBeenCalled();
  });

  it('unregister removes module handlers', async () => {
    const handler = vi.fn().mockResolvedValue('ok');
    kernel.ipc.register('mod-c', 'ping', handler);
    kernel.ipc.unregister('mod-c');
    const result = await kernel.ipc.send({
      id: 'msg-3',
      from: 'x',
      to: 'mod-c',
      type: 'ping',
      payload: {},
      timestamp: Date.now(),
    });
    expect(result).toBeNull();
    expect(handler).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// Storage API
// ═══════════════════════════════════════════════════════════════
describe('InfinityKernel — Storage', () => {
  let kernel: InfinityKernel;

  beforeEach(async () => {
    kernel = new InfinityKernel();
    await kernel.start();
  });

  it('storage property is defined', () => {
    expect(kernel.storage).toBeDefined();
    expect(typeof kernel.storage.get).toBe('function');
    expect(typeof kernel.storage.set).toBe('function');
    expect(typeof kernel.storage.delete).toBe('function');
  });

  it('set and get roundtrip', async () => {
    await kernel.storage.set('test:key', { value: 42 });
    const result = await kernel.storage.get<{ value: number }>('test:key');
    expect(result?.value).toBe(42);
  });

  it('get returns null for missing key', async () => {
    const result = await kernel.storage.get('nonexistent');
    expect(result).toBeNull();
  });

  it('delete removes a key', async () => {
    await kernel.storage.set('to-delete', 'data');
    await kernel.storage.delete('to-delete');
    expect(await kernel.storage.get('to-delete')).toBeNull();
  });

  it('clear with prefix removes only matching keys', async () => {
    await kernel.storage.set('ns:a', 1);
    await kernel.storage.set('ns:b', 2);
    await kernel.storage.set('other:c', 3);
    await kernel.storage.clear('ns:');
    expect(await kernel.storage.get('ns:a')).toBeNull();
    expect(await kernel.storage.get('ns:b')).toBeNull();
    expect(await kernel.storage.get('other:c')).toBe(3);
  });

  it('clear without prefix removes all keys', async () => {
    await kernel.storage.set('k1', 1);
    await kernel.storage.set('k2', 2);
    await kernel.storage.clear();
    expect(await kernel.storage.get('k1')).toBeNull();
    expect(await kernel.storage.get('k2')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Process Manager
// ═══════════════════════════════════════════════════════════════
describe('InfinityKernel — Process Manager', () => {
  let kernel: InfinityKernel;

  beforeEach(async () => {
    kernel = new InfinityKernel();
    await kernel.start();
  });

  it('processes property is defined', () => {
    expect(kernel.processes).toBeDefined();
    expect(typeof kernel.processes.listProcesses).toBe('function');
  });

  it('starts with no processes', () => {
    expect(kernel.processes.listProcesses()).toHaveLength(0);
  });

  it('getStatus shows process count', () => {
    expect(kernel.getStatus().processCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Singleton — getKernel / resetKernel
// ═══════════════════════════════════════════════════════════════
describe('Kernel Singleton', () => {
  beforeEach(() => {
    resetKernel();
  });

  it('getKernel returns an InfinityKernel instance', () => {
    const k = getKernel();
    expect(k).toBeInstanceOf(InfinityKernel);
  });

  it('getKernel returns same instance on repeated calls', () => {
    const k1 = getKernel();
    const k2 = getKernel();
    expect(k1).toBe(k2);
  });

  it('resetKernel creates a fresh instance', () => {
    const k1 = getKernel();
    resetKernel();
    const k2 = getKernel();
    expect(k1).not.toBe(k2);
  });
});