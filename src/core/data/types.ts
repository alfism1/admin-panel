export type ID = string | number;

export type RecordShape = Record<string, unknown>;

export interface ListParams {
  page: number;
  perPage: number;
  sort?: { field: string; order: 'asc' | 'desc' };
  search?: string;
  filters?: Record<string, unknown>;
}

export interface ListMeta {
  total: number;
  page: number;
  perPage: number;
  lastPage: number;
}

export interface ListResult<T> {
  data: T[];
  meta: ListMeta;
}

export interface DataProvider {
  getList<T = RecordShape>(resource: string, params: ListParams): Promise<ListResult<T>>;
  getOne<T = RecordShape>(resource: string, id: ID): Promise<T>;
  create<T = RecordShape>(resource: string, data: Partial<T>): Promise<T>;
  update<T = RecordShape>(resource: string, id: ID, data: Partial<T>): Promise<T>;
  delete(resource: string, id: ID): Promise<void>;
  deleteMany(resource: string, ids: ID[]): Promise<void>;
  getMany<T = RecordShape>(resource: string, ids: ID[]): Promise<T[]>;
}

/** Normalized shape every transport error is mapped to before it reaches the UI. */
export interface NormalizedError {
  status: number;
  message: string;
  /** Field-scoped messages, e.g. `{ email: ['Already taken'] }`. */
  errors: Record<string, string[]>;
  isValidation: boolean;
}
