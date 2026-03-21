/**
 * Adapters Package — Unit Tests
 * ═══════════════════════════════════════════════════════════════
 * Tests in-memory adapters and AdaptiveService failover logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { MemoryStorageAdapter } from '../adapters/fallback/memory-storage';
import { MemoryDatabaseAdapter } from '../adapters/fallback/memory-database';
import { AdaptiveService } from '../adaptive-service';
import type { StoragePort } from '../ports/storage';
import type { DatabasePort } from '../ports/database';

// ═══════════════════════════════════════════════════════════════
// MemoryStorageAdapter Tests
// ═══════════════════════════════════════════════════════════════

describe('MemoryStorageAdapter', () => {
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
  });

  it('should report provider as memory', () => {
    expect(storage.provider).toBe('memory');
  });

  it('should put and get a string value', async () => {
    await storage.put('test.txt', 'hello world', { contentType: 'text/plain' });

    const result = await storage.get('test.txt');
    expect(result).not.toBeNull();
    expect(result!.metadata.key).toBe('test.txt');
    expect(result!.metadata.contentType).toBe('text/plain');
    expect(result!.metadata.size).toBe(11); // 'hello world'.length
  });

  it('should put and get an ArrayBuffer', async () => {
    const data = new TextEncoder().encode('binary data');
    await storage.put('data.bin', data.buffer);

    const result = await storage.get('data.bin');
    expect(result).not.toBeNull();
    expect(result!.metadata.size).toBe(11);
  });

  it('should return null for non-existent key', async () => {
    const result = await storage.get('nonexistent');
    expect(result).toBeNull();
  });

  it('should delete a key', async () => {
    await storage.put('to-delete', 'temp');
    expect(await storage.head('to-delete')).not.toBeNull();

    await storage.delete('to-delete');
    expect(await storage.head('to-delete')).toBeNull();
  });

  it('should delete multiple keys', async () => {
    await storage.put('a', '1');
    await storage.put('b', '2');
    await storage.put('c', '3');
    expect(storage.size).toBe(3);

    await storage.deleteMany(['a', 'c']);
    expect(storage.size).toBe(1);
    expect(await storage.head('b')).not.toBeNull();
  });

  it('should list objects with prefix', async () => {
    await storage.put('images/cat.jpg', 'cat');
    await storage.put('images/dog.jpg', 'dog');
    await storage.put('docs/readme.md', 'readme');

    const result = await storage.list({ prefix: 'images/' });
    expect(result.objects).toHaveLength(2);
    expect(result.objects.map((o) => o.key)).toContain('images/cat.jpg');
    expect(result.objects.map((o) => o.key)).toContain('images/dog.jpg');
  });

  it('should list with limit and pagination', async () => {
    for (let i = 0; i < 10; i++) {
      await storage.put(`file-${i.toString().padStart(2, '0')}`, `content-${i}`);
    }

    const page1 = await storage.list({ limit: 3 });
    expect(page1.objects).toHaveLength(3);
    expect(page1.truncated).toBe(true);
    expect(page1.cursor).toBeDefined();

    const page2 = await storage.list({ limit: 3, cursor: page1.cursor });
    expect(page2.objects).toHaveLength(3);
    expect(page2.truncated).toBe(true);
  });

  it('should head return metadata without body', async () => {
    await storage.put('meta.txt', 'metadata test', {
      contentType: 'text/plain',
      metadata: { author: 'test' },
    });

    const head = await storage.head('meta.txt');
    expect(head).not.toBeNull();
    expect(head!.key).toBe('meta.txt');
    expect(head!.contentType).toBe('text/plain');
    expect(head!.metadata).toEqual({ author: 'test' });
  });

  it('should clear all objects', async () => {
    await storage.put('a', '1');
    await storage.put('b', '2');
    expect(storage.size).toBe(2);

    storage.clear();
    expect(storage.size).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// MemoryDatabaseAdapter Tests
// ═══════════════════════════════════════════════════════════════

describe('MemoryDatabaseAdapter', () => {
  let db: MemoryDatabaseAdapter;

  beforeEach(() => {
    db = new MemoryDatabaseAdapter();
  });

  it('should report provider as memory', () => {
    expect(db.provider).toBe('memory');
  });

  it('should execute SELECT 1 health check', async () => {
    const result = await db.prepare('SELECT 1').all();
    expect(result.rows).toHaveLength(1);
  });

  it('should create a table', async () => {
    await db.exec('CREATE TABLE IF NOT EXISTS users (id TEXT, name TEXT)');
    const info = await db.describe!();
    expect(info.tables).toContain('users');
  });

  it('should insert and select rows', async () => {
    await db.exec('CREATE TABLE users (id TEXT, name TEXT, email TEXT)');

    await db.prepare('INSERT INTO users (id, name, email) VALUES (?, ?, ?)')
      .bind('u1', 'Alice', 'alice@example.com')
      .run();

    await db.prepare('INSERT INTO users (id, name, email) VALUES (?, ?, ?)')
      .bind('u2', 'Bob', 'bob@example.com')
      .run();

    const all = await db.prepare('SELECT * FROM users').all();
    expect(all.rowCount).toBe(2);
    expect(all.rows[0]).toEqual({ id: 'u1', name: 'Alice', email: 'alice@example.com' });
  });

  it('should select first row', async () => {
    await db.exec('CREATE TABLE items (id TEXT, value TEXT)');
    await db.prepare('INSERT INTO items (id, value) VALUES (?, ?)').bind('i1', 'first').run();
    await db.prepare('INSERT INTO items (id, value) VALUES (?, ?)').bind('i2', 'second').run();

    const first = await db.prepare('SELECT * FROM items').first();
    expect(first).toEqual({ id: 'i1', value: 'first' });
  });

  it('should select with WHERE clause', async () => {
    await db.exec('CREATE TABLE products (sku TEXT, name TEXT)');
    await db.prepare('INSERT INTO products (sku, name) VALUES (?, ?)').bind('A', 'Alpha').run();
    await db.prepare('INSERT INTO products (sku, name) VALUES (?, ?)').bind('B', 'Beta').run();

    const result = await db.prepare('SELECT * FROM products WHERE sku = ?').bind('B').all();
    expect(result.rowCount).toBe(1);
    expect(result.rows[0]).toEqual({ sku: 'B', name: 'Beta' });
  });

  it('should delete rows', async () => {
    await db.exec('CREATE TABLE temp (id TEXT, data TEXT)');
    await db.prepare('INSERT INTO temp (id, data) VALUES (?, ?)').bind('1', 'a').run();
    await db.prepare('INSERT INTO temp (id, data) VALUES (?, ?)').bind('2', 'b').run();

    await db.prepare('DELETE FROM temp WHERE id = ?').bind('1').run();

    const remaining = await db.prepare('SELECT * FROM temp').all();
    expect(remaining.rowCount).toBe(1);
    expect(remaining.rows[0]).toEqual({ id: '2', data: 'b' });
  });

  it('should batch execute statements', async () => {
    await db.exec('CREATE TABLE batch_test (id TEXT, val TEXT)');

    const stmts = [
      db.prepare('INSERT INTO batch_test (id, val) VALUES (?, ?)').bind('1', 'one'),
      db.prepare('INSERT INTO batch_test (id, val) VALUES (?, ?)').bind('2', 'two'),
      db.prepare('INSERT INTO batch_test (id, val) VALUES (?, ?)').bind('3', 'three'),
    ];

    const result = await db.batch(stmts);
    expect(result.results).toHaveLength(3);
    expect(result.totalDuration).toBeGreaterThanOrEqual(0);

    const all = await db.prepare('SELECT * FROM batch_test').all();
    expect(all.rowCount).toBe(3);
  });

  it('should pass health check', async () => {
    const health = await db.healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.latencyMs).toBe(0);
  });

  it('should clear all data', async () => {
    await db.exec('CREATE TABLE clear_test (id TEXT)');
    await db.prepare('INSERT INTO clear_test (id) VALUES (?)').bind('x').run();

    db.clear();
    const info = await db.describe!();
    expect(info.tables).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// AdaptiveService Tests
// ═══════════════════════════════════════════════════════════════

describe('AdaptiveService', () => {
  it('should use highest priority adapter first', async () => {
    const primary = new MemoryStorageAdapter();
    const fallback = new MemoryStorageAdapter();

    const service = new AdaptiveService<StoragePort>([
      { adapter: fallback, priority: 99, name: 'fallback' },
      { adapter: primary, priority: 1, name: 'primary' },
    ], { verbose: false });

    // Put via adaptive service (should use primary)
    await service.execute('put', 'test', 'hello');

    // Verify primary has the data
    expect(await primary.head('test')).not.toBeNull();
    // Fallback should NOT have the data (primary succeeded)
    expect(await fallback.head('test')).toBeNull();
  });

  it('should failover to next adapter on error', async () => {
    // Create a "broken" adapter that always throws
    const broken: StoragePort = {
      provider: 'broken',
      put: async () => { throw new Error('broken'); },
      get: async () => { throw new Error('broken'); },
      delete: async () => { throw new Error('broken'); },
      deleteMany: async () => { throw new Error('broken'); },
      head: async () => { throw new Error('broken'); },
      list: async () => { throw new Error('broken'); },
    };

    const fallback = new MemoryStorageAdapter();

    const service = new AdaptiveService<StoragePort>([
      { adapter: broken, priority: 1, name: 'broken' },
      { adapter: fallback, priority: 2, name: 'fallback' },
    ], { verbose: false, maxFailures: 1 });

    // Should fail on broken, succeed on fallback
    await service.execute('put', 'key', 'value');
    expect(await fallback.head('key')).not.toBeNull();
  });

  it('should throw when all adapters fail', async () => {
    const broken1: StoragePort = {
      provider: 'broken1',
      put: async () => { throw new Error('fail1'); },
      get: async () => { throw new Error('fail1'); },
      delete: async () => { throw new Error('fail1'); },
      deleteMany: async () => { throw new Error('fail1'); },
      head: async () => { throw new Error('fail1'); },
      list: async () => { throw new Error('fail1'); },
    };

    const broken2: StoragePort = {
      provider: 'broken2',
      put: async () => { throw new Error('fail2'); },
      get: async () => { throw new Error('fail2'); },
      delete: async () => { throw new Error('fail2'); },
      deleteMany: async () => { throw new Error('fail2'); },
      head: async () => { throw new Error('fail2'); },
      list: async () => { throw new Error('fail2'); },
    };

    const service = new AdaptiveService<StoragePort>([
      { adapter: broken1, priority: 1, name: 'broken1' },
      { adapter: broken2, priority: 2, name: 'broken2' },
    ], { verbose: false });

    await expect(service.execute('put', 'key', 'value')).rejects.toThrow(
      /All adapters failed/,
    );
  });

  it('should report health status', () => {
    const storage = new MemoryStorageAdapter();
    const service = new AdaptiveService<StoragePort>([
      { adapter: storage, priority: 1, name: 'memory' },
    ], { verbose: false });

    const status = service.getHealthStatus();
    expect(status).toHaveLength(1);
    expect(status[0].name).toBe('memory');
    expect(status[0].healthy).toBe(true);
    expect(status[0].failures).toBe(0);
  });

  it('should return primary adapter', () => {
    const primary = new MemoryStorageAdapter();
    const fallback = new MemoryStorageAdapter();

    const service = new AdaptiveService<StoragePort>([
      { adapter: primary, priority: 1 },
      { adapter: fallback, priority: 99 },
    ], { verbose: false });

    expect(service.getPrimary()).toBe(primary);
  });

  it('should count adapters and healthy adapters', () => {
    const service = new AdaptiveService<StoragePort>([
      { adapter: new MemoryStorageAdapter(), priority: 1 },
      { adapter: new MemoryStorageAdapter(), priority: 2 },
      { adapter: new MemoryStorageAdapter(), priority: 3 },
    ], { verbose: false });

    expect(service.adapterCount).toBe(3);
    expect(service.healthyCount).toBe(3);
  });

  it('should reset all adapters to healthy', async () => {
    const broken: StoragePort = {
      provider: 'broken',
      put: async () => { throw new Error('broken'); },
      get: async () => { throw new Error('broken'); },
      delete: async () => { throw new Error('broken'); },
      deleteMany: async () => { throw new Error('broken'); },
      head: async () => { throw new Error('broken'); },
      list: async () => { throw new Error('broken'); },
    };

    const service = new AdaptiveService<StoragePort>([
      { adapter: broken, priority: 1, name: 'broken' },
      { adapter: new MemoryStorageAdapter(), priority: 2, name: 'memory' },
    ], { verbose: false, maxFailures: 1 });

    // Trigger failure
    await service.execute('put', 'key', 'value');

    // Broken should be unhealthy
    const status = service.getHealthStatus();
    expect(status[0].healthy).toBe(false);

    // Reset
    service.resetAll();
    const resetStatus = service.getHealthStatus();
    expect(resetStatus[0].healthy).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Port Interface Compliance Tests
// ═══════════════════════════════════════════════════════════════

describe('Port Interface Compliance', () => {
  it('MemoryStorageAdapter implements StoragePort', () => {
    const adapter = new MemoryStorageAdapter();
    expect(typeof adapter.put).toBe('function');
    expect(typeof adapter.get).toBe('function');
    expect(typeof adapter.delete).toBe('function');
    expect(typeof adapter.deleteMany).toBe('function');
    expect(typeof adapter.head).toBe('function');
    expect(typeof adapter.list).toBe('function');
    expect(typeof adapter.provider).toBe('string');
  });

  it('MemoryDatabaseAdapter implements DatabasePort', () => {
    const adapter = new MemoryDatabaseAdapter();
    expect(typeof adapter.prepare).toBe('function');
    expect(typeof adapter.exec).toBe('function');
    expect(typeof adapter.batch).toBe('function');
    expect(typeof adapter.transaction).toBe('function');
    expect(typeof adapter.healthCheck).toBe('function');
    expect(typeof adapter.provider).toBe('string');
  });
});