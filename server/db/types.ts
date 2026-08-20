export type Row = Record<string, unknown>;

export type ColumnKind = 'string' | 'number' | 'boolean' | 'date' | 'json' | 'unknown';

export interface ColumnSchema {
  name: string;
  kind: ColumnKind;
  nullable: boolean;
  /** Raw type reported by the driver, kept for diagnostics. */
  rawType: string;
}

export interface RelationSchema {
  /** Foreign key column on this table, e.g. `role_id`. */
  column: string;
  /** Table it points at, e.g. `roles`. */
  target: string;
  /** Key the related record is embedded under, e.g. `role`. */
  as: string;
}

export interface ResourceSchema {
  name: string;
  primaryKey: string;
  columns: ColumnSchema[];
  /** Text columns global search runs against. */
  searchable: string[];
  /**
   * A `tsvector` column, when the table has one. Search uses it instead of
   * `LIKE`-ing every text column, and it is hidden from output and from
   * `columns` — it is an index, not data.
   */
  searchVector?: string;
  relations: RelationSchema[];
}

export interface ListParams {
  page: number;
  perPage: number;
  sort?: { column: string; direction: 'asc' | 'desc' };
  search?: string;
  filters: Record<string, string>;
  /**
   * Opaque marker for the last row of the previous page. When present the
   * adapter seeks from it instead of counting rows off with `offset`, which is
   * what keeps deep pages cheap. Mutually exclusive with `page`.
   */
  cursor?: string;
}

export interface ListResult {
  rows: Row[];
  total: number;
  /**
   * True when `total` came from table statistics rather than a `count(*)`.
   * Surfaced to the client so a UI can render "about 5,000,000" honestly.
   */
  approximate?: boolean;
  /** Cursor for the next page; absent once there is nothing more to fetch. */
  nextCursor?: string;
}

/**
 * The single contract every database speaks. Routes never see SQL or BSON, so
 * adding a driver means implementing this and nothing else.
 */
export interface DatabaseAdapter {
  readonly dialect: string;
  resources(): ResourceSchema[];
  schema(resource: string): ResourceSchema;
  has(resource: string): boolean;
  list(resource: string, params: ListParams): Promise<ListResult>;
  find(resource: string, id: string): Promise<Row | null>;
  findBy(resource: string, column: string, value: unknown): Promise<Row | null>;
  insert(resource: string, data: Row): Promise<Row>;
  update(resource: string, id: string, data: Row): Promise<Row>;
  remove(resource: string, id: string): Promise<void>;
  removeMany(resource: string, ids: string[]): Promise<number>;
  count(resource: string, where?: Row): Promise<number>;
  close(): Promise<void>;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly errors?: Record<string, string[]>,
    /** Seconds a 429 asks the caller to wait; sent as the `Retry-After` header. */
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}
