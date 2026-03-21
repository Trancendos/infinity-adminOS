/**
 * DatabasePort — Relational Database Abstraction
 * ═══════════════════════════════════════════════════════════════
 * Abstracts Cloudflare D1, PlanetScale, Neon, Turso, SQLite,
 * or any SQL database.
 */

export interface DatabaseRow {
  [column: string]: unknown;
}

export interface DatabaseQueryResult<T = DatabaseRow> {
  rows: T[];
  rowCount: number;
  /** Columns returned by the query */
  columns?: string[];
  /** Metadata from the database engine */
  meta?: {
    duration?: number;
    rowsRead?: number;
    rowsWritten?: number;
    lastRowId?: number;
    changes?: number;
  };
}

export interface DatabaseBatchResult {
  results: DatabaseQueryResult[];
  totalDuration: number;
}

export interface PreparedStatement {
  /**
   * Bind parameters to the prepared statement.
   */
  bind(...params: unknown[]): PreparedStatement;

  /**
   * Execute and return all rows.
   */
  all<T = DatabaseRow>(): Promise<DatabaseQueryResult<T>>;

  /**
   * Execute and return the first row or null.
   */
  first<T = DatabaseRow>(column?: string): Promise<T | null>;

  /**
   * Execute without returning rows (INSERT, UPDATE, DELETE).
   */
  run(): Promise<DatabaseQueryResult>;

  /**
   * Execute and return raw results.
   */
  raw<T = unknown[]>(): Promise<T[]>;
}

export interface MigrationRecord {
  id: string;
  name: string;
  sql: string;
  appliedAt?: string;
}

export interface DatabasePort {
  readonly provider: string;

  /**
   * Prepare a SQL statement with parameter binding.
   */
  prepare(sql: string): PreparedStatement;

  /**
   * Execute a raw SQL query.
   */
  exec(sql: string): Promise<DatabaseQueryResult>;

  /**
   * Execute multiple statements in a batch (transaction-like).
   * D1 batches are atomic — all succeed or all fail.
   */
  batch(statements: PreparedStatement[]): Promise<DatabaseBatchResult>;

  /**
   * Run a function within a transaction.
   * Not all adapters support true transactions — some use batch.
   */
  transaction<T>(fn: (tx: DatabasePort) => Promise<T>): Promise<T>;

  /**
   * Apply pending migrations.
   */
  migrate?(migrations: MigrationRecord[]): Promise<void>;

  /**
   * Check database health / connectivity.
   */
  healthCheck(): Promise<{ healthy: boolean; latencyMs: number; error?: string }>;

  /**
   * Get database metadata.
   */
  describe?(): Promise<{
    tables: string[];
    provider: string;
    version?: string;
  }>;
}