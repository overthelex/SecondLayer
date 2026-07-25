/**
 * Database port interfaces.
 *
 * Mirrors the public API of BaseDatabase / pg.Pool without importing
 * any infrastructure module so the domain layer stays dependency-free.
 */

// ---------------------------------------------------------------------------
// Query result
// ---------------------------------------------------------------------------

export interface IQueryResult<T = any> {
  rows: T[];
  rowCount: number | null;
}

// ---------------------------------------------------------------------------
// Transaction client (structurally compatible with pg.PoolClient)
// ---------------------------------------------------------------------------

export interface ITransactionClient {
  query<T = any>(
    text: string,
    params?: unknown[],
  ): Promise<IQueryResult<T>>;
}

// ---------------------------------------------------------------------------
// Database port
// ---------------------------------------------------------------------------

export interface IDatabase {
  /** Execute a parameterised query. */
  query<T = any>(
    text: string,
    params?: unknown[],
  ): Promise<IQueryResult<T>>;

  /** Run a callback inside a transaction, auto-committing / rolling back. */
  transaction<T>(
    callback: (client: ITransactionClient) => Promise<T>,
  ): Promise<T>;

  /** Open the underlying connection pool. */
  connect(): Promise<void>;

  /** Drain connections and shut down. */
  close(): Promise<void>;

  /** Register a callback that receives pool statistics for metrics. */
  setMetricsCollector(
    callback: (stats: { total: number; idle: number; waiting: number }) => void,
  ): void;
}
