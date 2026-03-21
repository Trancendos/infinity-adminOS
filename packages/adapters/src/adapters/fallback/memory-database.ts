/**
 * MemoryDatabaseAdapter — In-Memory Database Implementation
 * ═══════════════════════════════════════════════════════════════
 * Implements DatabasePort using in-memory Map storage.
 * Used for testing and development when D1 is unavailable.
 *
 * NOTE: This is NOT a full SQL engine — it supports basic
 * key-value operations via a simplified PreparedStatement.
 * For full SQL support in tests, use better-sqlite3 adapter.
 */

import type {
  DatabasePort,
  DatabaseRow,
  DatabaseQueryResult,
  DatabaseBatchResult,
  PreparedStatement,
} from '../../ports/database';

class MemoryPreparedStatement implements PreparedStatement {
  private sql: string;
  private params: unknown[] = [];
  private db: MemoryDatabaseAdapter;

  constructor(sql: string, db: MemoryDatabaseAdapter) {
    this.sql = sql;
    this.db = db;
  }

  bind(...params: unknown[]): PreparedStatement {
    this.params = params;
    return this;
  }

  async all<T = DatabaseRow>(): Promise<DatabaseQueryResult<T>> {
    return this.db._execute<T>(this.sql, this.params);
  }

  async first<T = DatabaseRow>(column?: string): Promise<T | null> {
    const result = await this.db._execute<T>(this.sql, this.params);
    if (result.rows.length === 0) return null;
    if (column) return (result.rows[0] as any)[column] ?? null;
    return result.rows[0];
  }

  async run(): Promise<DatabaseQueryResult> {
    return this.db._execute(this.sql, this.params);
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    const result = await this.db._execute(this.sql, this.params);
    return result.rows.map((row) => Object.values(row as any)) as T[];
  }
}

export class MemoryDatabaseAdapter implements DatabasePort {
  readonly provider = 'memory';
  private tables = new Map<string, DatabaseRow[]>();
  private autoIncrements = new Map<string, number>();

  prepare(sql: string): PreparedStatement {
    return new MemoryPreparedStatement(sql, this);
  }

  async exec(sql: string): Promise<DatabaseQueryResult> {
    return this._execute(sql, []);
  }

  async batch(statements: PreparedStatement[]): Promise<DatabaseBatchResult> {
    const start = Date.now();
    const results: DatabaseQueryResult[] = [];

    for (const stmt of statements) {
      results.push(await stmt.run());
    }

    return {
      results,
      totalDuration: Date.now() - start,
    };
  }

  async transaction<T>(fn: (tx: DatabasePort) => Promise<T>): Promise<T> {
    // Memory adapter: just execute directly (no rollback support)
    return fn(this);
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    return { healthy: true, latencyMs: 0 };
  }

  async describe(): Promise<{ tables: string[]; provider: string }> {
    return {
      tables: Array.from(this.tables.keys()),
      provider: this.provider,
    };
  }

  /**
   * Internal execution — simplified SQL interpreter.
   * Handles SELECT 1, basic INSERT, SELECT, DELETE.
   */
  _execute<T = DatabaseRow>(sql: string, params: unknown[]): DatabaseQueryResult<T> {
    const trimmed = sql.trim().toUpperCase();

    // Health check
    if (trimmed === 'SELECT 1') {
      return { rows: [{ '1': 1 } as any], rowCount: 1 };
    }

    // CREATE TABLE (just register the table name)
    if (trimmed.startsWith('CREATE TABLE')) {
      const match = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?/i);
      if (match) {
        const tableName = match[1];
        if (!this.tables.has(tableName)) {
          this.tables.set(tableName, []);
        }
      }
      return { rows: [] as any, rowCount: 0, meta: { changes: 0 } };
    }

    // INSERT
    if (trimmed.startsWith('INSERT')) {
      const match = sql.match(/INSERT\s+INTO\s+["`]?(\w+)["`]?\s*\(([^)]+)\)/i);
      if (match) {
        const tableName = match[1];
        const columns = match[2].split(',').map((c) => c.trim().replace(/["`]/g, ''));
        const row: DatabaseRow = {};
        columns.forEach((col, i) => {
          row[col] = params[i] ?? null;
        });

        if (!this.tables.has(tableName)) {
          this.tables.set(tableName, []);
        }
        this.tables.get(tableName)!.push(row);

        const id = (this.autoIncrements.get(tableName) ?? 0) + 1;
        this.autoIncrements.set(tableName, id);

        return {
          rows: [] as any,
          rowCount: 0,
          meta: { changes: 1, lastRowId: id },
        };
      }
    }

    // SELECT
    if (trimmed.startsWith('SELECT')) {
      const match = sql.match(/FROM\s+["`]?(\w+)["`]?/i);
      if (match) {
        const tableName = match[1];
        const rows = this.tables.get(tableName) ?? [];

        // Very basic WHERE support (single column = ?)
        const whereMatch = sql.match(/WHERE\s+["`]?(\w+)["`]?\s*=\s*\?/i);
        if (whereMatch && params.length > 0) {
          const col = whereMatch[1];
          const val = params[0];
          const filtered = rows.filter((r) => r[col] === val);
          return { rows: filtered as any, rowCount: filtered.length };
        }

        return { rows: rows as any, rowCount: rows.length };
      }
    }

    // DELETE
    if (trimmed.startsWith('DELETE')) {
      const match = sql.match(/FROM\s+["`]?(\w+)["`]?/i);
      if (match) {
        const tableName = match[1];
        const before = this.tables.get(tableName)?.length ?? 0;

        const whereMatch = sql.match(/WHERE\s+["`]?(\w+)["`]?\s*=\s*\?/i);
        if (whereMatch && params.length > 0) {
          const col = whereMatch[1];
          const val = params[0];
          const rows = this.tables.get(tableName) ?? [];
          this.tables.set(tableName, rows.filter((r) => r[col] !== val));
        } else {
          this.tables.set(tableName, []);
        }

        const after = this.tables.get(tableName)?.length ?? 0;
        return { rows: [] as any, rowCount: 0, meta: { changes: before - after } };
      }
    }

    // Fallback
    return { rows: [] as any, rowCount: 0 };
  }

  /** Clear all tables (for testing) */
  clear(): void {
    this.tables.clear();
    this.autoIncrements.clear();
  }
}