import { getPath } from '@/lib/utils';
import { buildSeed } from './seed';
import type { MockCollection, MockDatabase } from './types';

const STORAGE_KEY = 'admin.mock-db.v1';

function load(): MockDatabase {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as MockDatabase;
  } catch {
    // Corrupt payload: fall through to a fresh seed rather than dying at boot.
  }
  const seeded = buildSeed();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

let database = load();

export function resetDatabase(): void {
  database = buildSeed();
  persist();
}

function persist(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
}

export function collection<K extends MockCollection>(name: K): MockDatabase[K] {
  return database[name];
}

export function isCollection(name: string): name is MockCollection {
  return name === 'users' || name === 'roles' || name === 'posts';
}

type Row = Record<string, unknown>;

export function writeCollection(name: MockCollection, rows: Row[]): void {
  (database as unknown as Record<string, Row[]>)[name] = rows;
  persist();
}

export function nextId(name: MockCollection): number {
  const rows = collection(name) as unknown as Row[];
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
}

const SEARCHABLE: Record<MockCollection, string[]> = {
  users: ['name', 'email'],
  roles: ['name', 'slug', 'description'],
  posts: ['title', 'slug', 'excerpt'],
};

function matchesSearch(row: Row, name: MockCollection, term: string): boolean {
  const needle = term.toLowerCase();
  return SEARCHABLE[name].some((field) =>
    String(row[field] ?? '')
      .toLowerCase()
      .includes(needle),
  );
}

function matchesFilter(row: Row, field: string, raw: string): boolean {
  const value = row[field];

  // `created_at` style range filters arrive as `from..to` with either side optional.
  if (raw.includes('..')) {
    const [from, to] = raw.split('..');
    const timestamp = new Date(String(value ?? '')).getTime();
    if (Number.isNaN(timestamp)) return false;
    if (from && timestamp < new Date(from).getTime()) return false;
    if (to && timestamp > new Date(to).setHours(23, 59, 59, 999)) return false;
    return true;
  }

  const candidates = raw.split(',').filter(Boolean);
  return candidates.some((candidate) => {
    if (candidate === 'true' || candidate === 'false') return value === (candidate === 'true');
    return String(value) === candidate;
  });
}

export interface QueryOptions {
  page: number;
  perPage: number;
  sortField?: string;
  sortOrder: 'asc' | 'desc';
  search?: string;
  filters: Record<string, string>;
}

export function queryCollection(name: MockCollection, options: QueryOptions) {
  let rows = [...(collection(name) as unknown as Row[])];

  if (options.search) rows = rows.filter((row) => matchesSearch(row, name, options.search!));

  for (const [field, raw] of Object.entries(options.filters)) {
    if (raw === '') continue;
    if (field === 'id') {
      const ids = new Set(raw.split(','));
      rows = rows.filter((row) => ids.has(String(row.id)));
      continue;
    }
    rows = rows.filter((row) => matchesFilter(row, field, raw));
  }

  if (options.sortField) {
    const field = options.sortField;
    const direction = options.sortOrder === 'desc' ? -1 : 1;
    rows.sort((a, b) => {
      const left = getPath(a, field);
      const right = getPath(b, field);
      if (left === right) return 0;
      if (left == null) return 1;
      if (right == null) return -1;
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction;
      return String(left).localeCompare(String(right)) * direction;
    });
  }

  const total = rows.length;
  const start = (options.page - 1) * options.perPage;
  return {
    rows: rows.slice(start, start + options.perPage),
    total,
    lastPage: Math.max(1, Math.ceil(total / options.perPage)),
  };
}
