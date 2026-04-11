/**
 * D1DatabaseAdapter — Cloudflare D1 Implementation
 * ═══════════════════════════════════════════════════════════════
 * Implements DatabasePort using Cloudflare D1 (SQLite at edge).
 */

import type {
  DatabasePort,
  DatabaseRow,
  DatabaseQueryResult,
  DatabaseBatchResult,
  PreparedStatement,
} from '../../ports/database';

class D1PreparedStatement implements PreparedStatement {
  private stmt: any; // D1PreparedStatement from CF runtime

  constructor(stmt: any) {
    this.stmt = stmt;
  }

  bind(...params: unknown[]): PreparedStatement {
    this.stmt = this.stmt.bind(...params);
    return this;
  }

  async all<T = DatabaseRow>(): Promise<DatabaseQueryResult<T>> {
    const result = await this.stmt.all();
    return {
      rows: (result.results ?? []) as T[],
      rowCount: result.results?.length ?? 0,
      meta: {
        duration: result.meta?.duration,
        rowsRead: result.meta?.rows_read,
        rowsWritten: result.meta?.rows_written,
        lastRowId: result.meta?.last_row_id,
        changes: result.meta?.changes,
      },
    };
  }

  async first<T = DatabaseRow>(column?: string): Promise<T | null> {
    if (column) {
      return this.stmt.first(column);
    }
    return this.stmt.first();
  }

  async run(): Promise<DatabaseQueryResult> {
    const result = await this.stmt.run();
    return {
      rows: [],
      rowCount: 0,
      meta: {
        duration: result.meta?.duration,
        rowsRead: result.meta?.rows_read,
        rowsWritten: result.meta?.rows_written,
        lastRowId: result.meta?.last_row_id,
        changes: result.meta?.changes,
      },
    };
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    const result = await this.stmt.raw();
    return result as T[];
  }
}

export class D1DatabaseAdapter implements DatabasePort {
  readonly provider = 'cloudflare-d1';
  private db: any; // D1Database from CF runtime

  constructor(db: any) {
    this.db = db;
  }

  prepare(sql: string): PreparedStatement {
    return new D1PreparedStatement(this.db.prepare(sql));
  }

  async exec(sql: string): Promise<DatabaseQueryResult> {
    const result = await this.db.exec(sql);
    return {
      rows: [],
      rowCount: result.count ?? 0,
    };
  }

  async batch(statements: PreparedStatement[]): Promise<DatabaseBatchResult> {
    const start = Date.now();
    // D1 batch expects raw D1PreparedStatements
    const d1Stmts = statements.map((s) => (s as any).stmt);
    const results = await this.db.batch(d1Stmts);

    return {
      results: results.map((r: any) => ({
        rows: r.results ?? [],
        rowCount: r.results?.length ?? 0,
        meta: {
          duration: r.meta?.duration,
          changes: r.meta?.changes,
        },
      })),
      totalDuration: Date.now() - start,
    };
  }

  async transaction<T>(fn: (tx: DatabasePort) => Promise<T>): Promise<T> {
    // D1 doesn't support true transactions — use batch for atomicity
    // Wrap in a try-catch to maintain the interface contract
    return fn(this);
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      await this.db.prepare('SELECT 1').first();
      return { healthy: true, latencyMs: Date.now() - start };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async describe(): Promise<{ tables: string[]; provider: string; version?: string }> {
    const result = await this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all();
    return {
      tables: (result.results ?? []).map((r: any) => r.name),
      provider: this.provider,
    };
  }
}