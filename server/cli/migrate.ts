import { env } from '../env';
import {
  baseline,
  createMigrationFile,
  inspect,
  openMigrations,
  rollback,
  rollbackOne,
  runLatest,
  unlock,
  type MigrationSession,
} from '../db/migrate';

/** `pnpm db:migrate` — schema migrations for the SQL dialects. */

const USAGE = `
  Usage

    pnpm db:migrate [latest] [--dry]    run every pending migration
    pnpm db:migrate status [--check]    show applied and pending (--check exits 1 if pending)
    pnpm db:migrate make <name>         write a timestamped migration stub
    pnpm db:migrate rollback [--all]    undo the last batch, or everything with --all
    pnpm db:migrate down                undo exactly one migration
    pnpm db:migrate baseline            mark pending as applied without running them
    pnpm db:migrate unlock              clear a lock left by an interrupted run

  Rolling back with NODE_ENV=production needs --force or DB_ALLOW_ROLLBACK=true.
`;

const COMMANDS = [
  'latest',
  'status',
  'make',
  'rollback',
  'down',
  'baseline',
  'unlock',
  'help',
] as const;

type Command = (typeof COMMANDS)[number];

function isCommand(value: string): value is Command {
  return (COMMANDS as readonly string[]).includes(value);
}

/**
 * Destructive and irreversible are different things: rolling back runs `down`,
 * which drops what `up` created. Guarded in production unless asked twice.
 */
function assertRollbackAllowed(force: boolean): void {
  if (!env.isProduction || force || env.migrations.allowRollback) return;

  throw new Error(
    'Refusing to roll back while NODE_ENV=production. ' +
      'Re-run with --force, or set DB_ALLOW_ROLLBACK=true, if that is really the intent.',
  );
}

function warnIfNotTransactional(session: MigrationSession): void {
  if (session.transactional) return;

  console.warn(
    `  ⚠ ${session.dialect} commits DDL implicitly — a migration that fails partway\n` +
      `    cannot be rolled back automatically. Take a backup first.\n`,
  );
}

function reportStatus(applied: string[], pending: string[], managed: boolean): void {
  for (const name of applied) console.log(`    ✓ ${name}`);
  for (const name of pending) console.log(`    · ${name}  (pending)`);

  if (applied.length === 0 && pending.length === 0) {
    console.log('    (no migration files)');
  }

  console.log(`\n  ${applied.length} applied, ${pending.length} pending`);
  if (!managed && pending.length > 0) {
    console.log('  this database has no migrations table yet — "pnpm db:migrate" creates it');
  }
}

async function run(command: Command, args: string[]): Promise<number> {
  const has = (flag: string) => args.includes(flag);

  if (command === 'make') {
    const name = args.filter((arg) => !arg.startsWith('--')).join(' ');
    if (!name) throw new Error('Give the migration a name: pnpm db:migrate make add_posts_index');

    const filename = await createMigrationFile(name);
    console.log(`\n  + server/migrations/${filename}\n`);
    return 0;
  }

  const session = openMigrations();

  try {
    console.log(`\n  migrations  ${session.dialect} → ${env.migrations.table}\n`);

    switch (command) {
      case 'status': {
        const { managed, applied, pending } = await inspect(session);
        reportStatus(applied, pending, managed);
        console.log('');
        return has('--check') && pending.length > 0 ? 1 : 0;
      }

      case 'latest': {
        const { pending } = await inspect(session);

        if (pending.length === 0) {
          console.log('  ✓ already up to date\n');
          return 0;
        }

        if (has('--dry')) {
          for (const name of pending) console.log(`    · ${name}`);
          console.log(`\n  ${pending.length} would run — re-run without --dry\n`);
          return 0;
        }

        warnIfNotTransactional(session);
        const { batch, names } = await runLatest(session);
        for (const name of names) console.log(`    ↑ ${name}`);
        console.log(`\n  ✓ batch ${batch} — ${names.length} applied\n`);
        return 0;
      }

      case 'rollback': {
        assertRollbackAllowed(has('--force'));
        warnIfNotTransactional(session);

        const { batch, names } = await rollback(session, has('--all'));
        if (names.length === 0) {
          console.log('  nothing to roll back\n');
          return 0;
        }

        for (const name of names) console.log(`    ↓ ${name}`);
        console.log(`\n  ✓ rolled back batch ${batch} — ${names.length} reverted\n`);
        return 0;
      }

      case 'down': {
        assertRollbackAllowed(has('--force'));
        warnIfNotTransactional(session);

        const { names } = await rollbackOne(session);
        if (names.length === 0) {
          console.log('  nothing to roll back\n');
          return 0;
        }

        for (const name of names) console.log(`    ↓ ${name}`);
        console.log('');
        return 0;
      }

      case 'baseline': {
        const { applied, pending } = await inspect(session);

        if (pending.length === 0) {
          console.log('  ✓ nothing pending — already adopted\n');
          return 0;
        }

        console.log('  recording as applied without running them:');
        for (const name of pending) console.log(`    = ${name}`);
        if (applied.length > 0) {
          console.log(
            `\n  ⚠ ${applied.length} migration(s) already ran here — only the pending ones are adopted`,
          );
        }

        const { batch } = await baseline(session);
        console.log(`\n  ✓ batch ${batch} — ${pending.length} adopted\n`);
        return 0;
      }

      case 'unlock': {
        await unlock(session);
        console.log('  ✓ migration lock cleared\n');
        return 0;
      }

      default:
        return 0;
    }
  } finally {
    await session.close();
  }
}

async function main(): Promise<void> {
  const [first = 'latest', ...rest] = process.argv.slice(2);

  if (first === '--help' || first === '-h' || first === 'help') {
    console.log(USAGE);
    return;
  }

  // A bare flag such as `--dry` means the default command with that flag.
  const command = first.startsWith('--') ? 'latest' : first;
  const args = first.startsWith('--') ? [first, ...rest] : rest;

  if (!isCommand(command)) {
    throw new Error(`Unknown command "${command}".\n${USAGE}`);
  }

  process.exitCode = await run(command, args);
}

main().catch((error: unknown) => {
  console.error(`\n  ✗ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
