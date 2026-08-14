import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Knex } from 'knex';
import { env } from '../env';
import { createKnex, detectDialect, type Dialect } from './connect';

/**
 * Schema migrations for the SQL dialects. Knex owns the bookkeeping — the
 * `knex_migrations` table, batch numbers and the advisory lock — so what lives
 * here is the policy around it: where files come from, which operations are
 * safe to run unattended, and how to adopt a database that already has a
 * schema.
 */

export type SqlDialect = Exclude<Dialect, 'mongodb'>;

/** Resolved from this module, never the cwd, so the CLI works from any directory. */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

/** `<utc-timestamp>_<snake_case>.ts` — the timestamp is what orders a batch. */
const MIGRATION_FILE = /^\d{14}_[a-z0-9_]+\.ts$/;

/**
 * MySQL and MariaDB commit DDL implicitly, so a migration that fails halfway
 * leaves the schema partially changed and knex cannot undo it. Every other
 * dialect here runs each migration inside a transaction.
 */
const TRANSACTIONAL_DDL: ReadonlySet<Dialect> = new Set(['postgres', 'sqlite', 'mssql']);

interface MigrationModule {
  up(knex: Knex): Promise<void>;
  down?(knex: Knex): Promise<void>;
}

/** Loads `server/migrations/*.ts` by URL, which works under both tsx and plain node. */
class DirectoryMigrationSource implements Knex.MigrationSource<string> {
  getMigrations(): Promise<string[]> {
    return listMigrationFiles();
  }

  getMigrationName(migration: string): string {
    return migration;
  }

  async getMigration(migration: string): Promise<Knex.Migration> {
    const module = (await import(
      pathToFileURL(`${MIGRATIONS_DIR}${migration}`).href
    )) as Partial<MigrationModule>;

    if (typeof module.up !== 'function') {
      throw new Error(`Migration ${migration} does not export an "up" function.`);
    }

    return module as Knex.Migration;
  }
}

/**
 * Yields migrations whose `up` does nothing. Running a batch through this
 * source records the names as applied without touching the schema, which is
 * how `baseline` adopts a database that already matches.
 */
class RecordOnlyMigrationSource implements Knex.MigrationSource<string> {
  constructor(private readonly names: readonly string[]) {}

  getMigrations(): Promise<string[]> {
    return Promise.resolve([...this.names]);
  }

  getMigrationName(migration: string): string {
    return migration;
  }

  getMigration(): Promise<Knex.Migration> {
    return Promise.resolve({ up: () => Promise.resolve(), down: () => Promise.resolve() });
  }
}

export async function listMigrationFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR).catch(() => [] as string[]);
  return entries.filter((name) => MIGRATION_FILE.test(name)).sort();
}

export interface MigrationSession {
  readonly knex: Knex;
  readonly dialect: SqlDialect;
  readonly config: Knex.MigratorConfig;
  /** False on MySQL/MariaDB, where a failed migration cannot be undone. */
  readonly transactional: boolean;
  close(): Promise<void>;
}

export function openMigrations(url = env.databaseUrl): MigrationSession {
  const dialect = detectDialect(url);

  if (dialect === 'mongodb') {
    throw new Error(
      'Migrations are SQL-only. MongoDB collections have no fixed schema, so there is ' +
        'nothing to migrate — write a one-off script if you need to reshape documents.',
    );
  }

  const knex = createKnex(url, dialect);
  const config: Knex.MigratorConfig = {
    tableName: env.migrations.table,
    migrationSource: new DirectoryMigrationSource(),
  };

  if (dialect === 'postgres' && env.schema) config.schemaName = env.schema;

  return {
    knex,
    dialect,
    config,
    transactional: TRANSACTIONAL_DDL.has(dialect),
    close: () => knex.destroy(),
  };
}

/**
 * Whether this database is under migration control at all. Checked with a bare
 * `hasTable` because knex creates its bookkeeping tables as a side effect of
 * listing — a database the panel merely reads must not grow two tables just
 * because someone asked for status.
 */
export async function isManaged(session: MigrationSession): Promise<boolean> {
  const { schemaName } = session.config;
  const schema = schemaName ? session.knex.schema.withSchema(schemaName) : session.knex.schema;
  return schema.hasTable(env.migrations.table);
}

export interface MigrationStatus {
  managed: boolean;
  applied: string[];
  pending: string[];
}

export async function inspect(session: MigrationSession): Promise<MigrationStatus> {
  const all = await listMigrationFiles();

  if (!(await isManaged(session))) return { managed: false, applied: [], pending: all };

  const [completed, pending] = (await session.knex.migrate.list(session.config)) as [
    Array<{ name: string } | string>,
    string[],
  ];

  return {
    managed: true,
    applied: completed.map((row) => (typeof row === 'string' ? row : row.name)),
    pending,
  };
}

export interface MigrationRun {
  batch: number;
  names: string[];
}

function toRun(result: unknown): MigrationRun {
  const [batch, names] = result as [number, string[]];
  return { batch, names };
}

export async function runLatest(session: MigrationSession): Promise<MigrationRun> {
  const managed = await isManaged(session);

  try {
    return toRun(await session.knex.migrate.latest(session.config));
  } catch (error) {
    throw managed ? error : withAdoptionHint(error);
  }
}

/** Rolls back the last batch, or every applied migration when `all` is set. */
export async function rollback(session: MigrationSession, all = false): Promise<MigrationRun> {
  return toRun(await session.knex.migrate.rollback(session.config, all));
}

/** Rolls back exactly one migration, regardless of the batch it belongs to. */
export async function rollbackOne(session: MigrationSession): Promise<MigrationRun> {
  return toRun(await session.knex.migrate.down(session.config));
}

/**
 * Records every pending migration as applied without running it — how to adopt
 * a database whose schema already matches, such as one built by an older
 * `pnpm db:seed`. The full file list is handed to knex so it still diffs
 * against what is applied and validates the list, and so batch numbering and
 * locking stay identical to a real run.
 */
export async function baseline(session: MigrationSession): Promise<MigrationRun> {
  const source = new RecordOnlyMigrationSource(await listMigrationFiles());
  return toRun(await session.knex.migrate.latest({ ...session.config, migrationSource: source }));
}

/** Clears a lock left behind by a runner that was killed mid-migration. */
export async function unlock(session: MigrationSession): Promise<void> {
  await session.knex.migrate.forceFreeMigrationsLock(session.config);
}

/**
 * A database created before the runner existed already has the tables the first
 * migration wants to create. Point at `baseline` rather than leaving the raw
 * driver error as the whole explanation.
 */
function withAdoptionHint(error: unknown): Error {
  const cause = error instanceof Error ? error : new Error(String(error));
  if (!/already exists|duplicate table|there is already an object/i.test(cause.message)) {
    return cause;
  }

  return new Error(
    `${cause.message}\n\n` +
      `  This database already has the tables a migration creates, but no "${env.migrations.table}"\n` +
      `  table recording them. If its schema is already correct, adopt it once with:\n\n` +
      `      pnpm db:migrate baseline`,
    { cause },
  );
}

/**
 * Boot-time check. A database with no migrations table is one the panel did not
 * create — sitting on top of a schema someone else owns is a supported setup,
 * so it is left alone and reported on by nothing.
 */
export async function ensureMigrationsCurrent(url = env.databaseUrl): Promise<void> {
  if (detectDialect(url) === 'mongodb') return;

  const session = openMigrations(url);

  try {
    const { managed, pending } = await inspect(session);
    if (!managed || pending.length === 0) return;

    if (env.migrations.auto) {
      const { names } = await runLatest(session);
      console.log(`  migrated  ${names.length} pending → ${names.at(-1)}`);
      return;
    }

    console.warn(
      `  ⚠ ${pending.length} pending migration(s): ${pending.join(', ')}\n` +
        `    run "pnpm db:migrate" — the schema the API introspected may be out of date`,
    );
  } finally {
    await session.close();
  }
}

const STUB = `import type { Knex } from 'knex';

/**
 * __NAME__
 *
 * Rename \`_knex\` to \`knex\` once a body uses it — the underscore is only there
 * to keep the empty stub past \`noUnusedParameters\`.
 */
export async function up(_knex: Knex): Promise<void> {
  // TODO: apply the change.
}

export async function down(_knex: Knex): Promise<void> {
  // TODO: undo exactly what \`up\` did, in reverse order.
}
`;

/** Writes a timestamped stub and returns its filename. */
export async function createMigrationFile(name: string): Promise<string> {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!slug) throw new Error(`"${name}" has no usable letters or digits for a filename.`);

  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const filename = `${stamp}_${slug}.ts`;

  await mkdir(MIGRATIONS_DIR, { recursive: true });
  await writeFile(`${MIGRATIONS_DIR}${filename}`, STUB.replace('__NAME__', name.trim()), {
    flag: 'wx',
  });

  return filename;
}
