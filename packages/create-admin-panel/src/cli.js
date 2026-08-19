import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

import * as p from '@clack/prompts';

import { generateResources } from './codegen.js';
import {
  DATABASE_KEYS,
  DATABASES,
  PACKAGE_MANAGERS,
  RESOURCE_MODE_KEYS,
  RESOURCE_MODES,
  databaseFromUrl,
  detectPackageManager,
  detectPackageManagerVersion,
  runScript,
  schemesFor,
} from './databases.js';
import { exec, hasCommand, tail } from './exec.js';
import {
  applyDatabaseVariant,
  applyResourceMode,
  copyTemplate,
  ensureSqliteDirectory,
  inspectTarget,
  relativeToCwd,
  removeTemplateArtifacts,
  resolveTemplateDir,
  retargetAgentsDoc,
  writeCi,
  writeEnv,
  writePackageJson,
  writeReadme,
  writeResourceIndex,
} from './template.js';

const HELP = `
  create-admin-panel — scaffold a Filament-style React admin panel

  Usage
    npm create admin-panel@latest [directory] [options]

  Options
    --name <string>        Display name for the panel      (default: from directory)
    --db <key>             ${DATABASE_KEYS.join(' | ')}
    --database-url <url>   Connection string; implies --db
    --auth-table <name>    Table holding your users        (default: users)
    --resources <mode>     ${RESOURCE_MODE_KEYS.join(' | ')}
    --pm <manager>         ${PACKAGE_MANAGERS.join(' | ')}
    --install / --no-install
    --git / --no-git
    --force                Scaffold into a non-empty directory
    -y, --yes              Accept every default, ask nothing
    -h, --help             Show this message
    -v, --version          Print the version

  Examples
    npm create admin-panel@latest
    npm create admin-panel@latest my-panel -- --db sqlite --resources demo
    npm create admin-panel@latest crm -- --database-url postgres://localhost/crm --resources introspect
`;

export function parseCliArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      name: { type: 'string' },
      db: { type: 'string' },
      'database-url': { type: 'string' },
      'auth-table': { type: 'string' },
      resources: { type: 'string' },
      pm: { type: 'string' },
      install: { type: 'boolean' },
      'no-install': { type: 'boolean' },
      git: { type: 'boolean' },
      'no-git': { type: 'boolean' },
      force: { type: 'boolean' },
      yes: { type: 'boolean', short: 'y' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });

  return { values, directory: positionals[0] };
}

/** `--x` / `--no-x` as a tri-state, so "unset" stays distinguishable from "false". */
function tristate(values, name) {
  if (values[`no-${name}`]) return false;
  if (values[name]) return true;
  return undefined;
}

function orExit(value) {
  if (p.isCancel(value)) {
    p.cancel('Cancelled — nothing was written.');
    process.exit(0);
  }
  return value;
}

/** `my-crm-panel` → `My Crm Panel`, so the default display name is not a slug. */
function titleize(value) {
  return (
    value
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase()) || 'Admin Panel'
  );
}

function validateDatabaseKey(key) {
  if (!DATABASE_KEYS.includes(key)) {
    throw new Error(`Unknown --db "${key}". Use one of: ${DATABASE_KEYS.join(', ')}.`);
  }
  return key;
}

async function askDirectory(values) {
  if (values.directory) return values.directory;
  if (values.yes) return './admin-panel';

  return orExit(
    await p.text({
      message: 'Where should the project live?',
      placeholder: './admin-panel',
      defaultValue: './admin-panel',
      validate: (value) => (value.trim().startsWith('-') ? 'That looks like a flag.' : undefined),
    }),
  );
}

async function askDatabase(values) {
  if (values['database-url']) {
    const inferred = databaseFromUrl(values['database-url']);
    if (!inferred) {
      throw new Error(
        `Could not read a dialect from --database-url. Supported schemes: ` +
          `${DATABASE_KEYS.filter((key) => key !== 'mock')
            .flatMap((key) => schemesFor(key))
            .join(', ')}.`,
      );
    }
    if (values.db && validateDatabaseKey(values.db) !== inferred) {
      throw new Error(`--db ${values.db} contradicts the scheme in --database-url (${inferred}).`);
    }
    return inferred;
  }

  if (values.db) return validateDatabaseKey(values.db);
  if (values.yes) return 'mock';

  return orExit(
    await p.select({
      message: 'Which database will this panel talk to?',
      initialValue: 'mock',
      options: DATABASE_KEYS.map((key) => ({
        value: key,
        label: DATABASES[key].label,
        hint: DATABASES[key].hint,
      })),
    }),
  );
}

async function askDatabaseUrl(values, database) {
  if (values['database-url']) return values['database-url'];

  const fallback = DATABASES[database].defaultUrl;
  if (values.yes) return fallback;

  return orExit(
    await p.text({
      message: 'Connection string',
      initialValue: fallback,
      validate: (value) => {
        if (!value.trim()) return 'A connection string is required.';
        const inferred = databaseFromUrl(value.trim());
        if (!inferred) return `Unrecognised scheme. Try ${fallback}`;
        if (inferred !== database) {
          return `That is a ${DATABASES[inferred].label} URL, but you chose ${DATABASES[database].label}.`;
        }
        return undefined;
      },
    }),
  ).trim();
}

async function askResourceMode(values, database) {
  const supported = RESOURCE_MODE_KEYS.filter(
    (key) => key !== 'demo' || DATABASES[database].migrations,
  );

  if (values.resources) {
    if (!supported.includes(values.resources)) {
      throw new Error(
        `--resources ${values.resources} is not available for ${DATABASES[database].label}. ` +
          `Use one of: ${supported.join(', ')}.`,
      );
    }
    return values.resources;
  }

  if (values.yes) return supported[0];

  return orExit(
    await p.select({
      message: 'What should the panel start with?',
      initialValue: supported[0],
      options: supported.map((key) => ({
        value: key,
        label: RESOURCE_MODES[key].label,
        hint: RESOURCE_MODES[key].hint,
      })),
    }),
  );
}

async function interview(values) {
  const directory = await askDirectory(values);
  const targetDir = path.resolve(process.cwd(), directory);

  const target = await inspectTarget(targetDir);
  if (target.exists && !target.empty && !values.force) {
    const listed = target.entries.slice(0, 4).join(', ');
    const more = target.entries.length > 4 ? `, +${target.entries.length - 4} more` : '';

    if (values.yes) {
      throw new Error(
        `${relativeToCwd(targetDir)} is not empty (${listed}${more}). Pass --force to scaffold into it anyway.`,
      );
    }

    const proceed = orExit(
      await p.confirm({
        message: `${relativeToCwd(targetDir)} already has files (${listed}${more}). Write into it anyway?`,
        initialValue: false,
      }),
    );

    if (!proceed) {
      p.cancel('Cancelled — nothing was written.');
      process.exit(0);
    }
  }

  const defaultName = titleize(path.basename(targetDir));
  const name =
    values.name ??
    (values.yes
      ? defaultName
      : orExit(
          await p.text({
            message: 'What is this panel called?',
            initialValue: defaultName,
            validate: (value) => (value.trim() ? undefined : 'A name is required.'),
          }),
        ).trim());

  const database = await askDatabase(values);
  const isMock = database === 'mock';

  const databaseUrl = isMock ? null : await askDatabaseUrl(values, database);

  const authTable =
    values['auth-table'] ??
    (isMock || values.yes
      ? 'users'
      : orExit(
          await p.text({
            message: 'Which table holds your users?',
            initialValue: 'users',
            validate: (value) => (value.trim() ? undefined : 'A table name is required.'),
          }),
        ).trim());

  // The mock backend is fixture-driven and exists to be explored, so it always
  // ships the demo panel. Nothing to decide.
  const resources = isMock ? 'demo' : await askResourceMode(values, database);

  const detected = detectPackageManager();
  const packageManager =
    values.pm ??
    (values.yes
      ? detected
      : orExit(
          await p.select({
            message: 'Package manager?',
            initialValue: detected,
            options: PACKAGE_MANAGERS.map((pm) => ({
              value: pm,
              label: pm,
              ...(pm === detected ? { hint: 'detected' } : {}),
            })),
          }),
        ));

  if (!PACKAGE_MANAGERS.includes(packageManager)) {
    throw new Error(
      `Unknown --pm "${packageManager}". Use one of: ${PACKAGE_MANAGERS.join(', ')}.`,
    );
  }

  const install =
    tristate(values, 'install') ??
    (values.yes
      ? true
      : orExit(
          await p.confirm({
            message: `Install dependencies with ${packageManager}?`,
            initialValue: true,
          }),
        ));

  const git =
    tristate(values, 'git') ??
    (values.yes
      ? true
      : orExit(await p.confirm({ message: 'Initialise a git repository?', initialValue: true })));

  return {
    targetDir,
    name,
    database,
    databaseUrl,
    authTable,
    resources,
    packageManager,
    packageManagerVersion: detectPackageManagerVersion(packageManager),
    install,
    git,
  };
}

/** Runs a project script through the local tsx binary — identical under every manager. */
function tsx(answers, script, args = []) {
  return exec(
    process.execPath,
    [path.join(answers.targetDir, 'node_modules/tsx/dist/cli.mjs'), script, ...args],
    { cwd: answers.targetDir, env: { NODE_NO_WARNINGS: '1' } },
  );
}

async function runInstall(answers, spinner) {
  spinner.start(`Installing dependencies with ${answers.packageManager}`);
  const result = await exec(answers.packageManager, ['install'], { cwd: answers.targetDir });

  if (!result.ok) {
    spinner.stop('Install failed', 1);
    p.log.error(tail(`${result.stdout}\n${result.stderr}`));
    p.log.warn(
      `Run \`${answers.packageManager} install\` yourself once the problem above is fixed.`,
    );
    return false;
  }

  spinner.stop('Dependencies installed');
  return true;
}

async function runMigrateAndSeed(answers, spinner) {
  spinner.start('Applying migrations');
  const migrate = await tsx(answers, 'server/cli/migrate.ts');

  if (!migrate.ok) {
    spinner.stop('Migrations failed', 1);
    p.log.error(tail(`${migrate.stdout}\n${migrate.stderr}`));
    p.log.warn(
      `Check DATABASE_URL in .env, then run \`${runScript(answers.packageManager, 'db:migrate')}\`.`,
    );
    return;
  }

  spinner.stop('Migrations applied');

  spinner.start('Seeding demo data');
  const seed = await tsx(answers, 'server/cli/seed.ts');

  if (!seed.ok) {
    spinner.stop('Seeding failed', 1);
    p.log.error(tail(`${seed.stdout}\n${seed.stderr}`));
    return;
  }

  spinner.stop('Demo data seeded');
}

async function runIntrospection(answers, spinner) {
  const schemaFile = path.join(answers.targetDir, '.schema.generated.json');

  spinner.start('Reading your schema');
  const result = await tsx(answers, 'server/cli/introspect.ts', ['--json', schemaFile]);

  if (!result.ok) {
    spinner.stop('Could not read the schema', 1);
    p.log.error(tail(`${result.stdout}\n${result.stderr}`));
    p.log.warn(
      `The panel was still created. Fix DATABASE_URL in .env, then run ` +
        `\`${runScript(answers.packageManager, 'gen:resource')} <Name>\` per table.`,
    );
    return;
  }

  const schemas = JSON.parse(await readFile(schemaFile, 'utf8'));
  await rm(schemaFile, { force: true });

  const { generated, skipped } = await generateResources(answers.targetDir, schemas);
  await writeResourceIndex(answers.targetDir, generated);

  spinner.stop(`Generated ${generated.length} resource${generated.length === 1 ? '' : 's'}`);

  if (generated.length > 0) {
    p.log.info(generated.map((name) => `${name}Resource`).join(', '));
  }

  if (skipped.length > 0) {
    p.log.warn(
      `Skipped ${skipped.join(', ')} — nothing editable found (join tables and ` +
        `views usually land here). Add them by hand if you need them.`,
    );
  }
}

/**
 * Everything this CLI writes — the README, the generated resources — should be
 * indistinguishable from hand-written source, and `format:check` is a script the
 * project ships. Purely cosmetic, so a failure here is not worth reporting.
 */
async function formatProject(answers) {
  await exec(
    process.execPath,
    [
      path.join(answers.targetDir, 'node_modules/prettier/bin/prettier.cjs'),
      '--write',
      '--log-level',
      'silent',
      'README.md',
      'src/resources',
    ],
    { cwd: answers.targetDir },
  );
}

async function runGitInit(answers, spinner) {
  if (!(await hasCommand('git'))) {
    p.log.warn('git is not on PATH — skipped repository setup.');
    return;
  }

  spinner.start('Initialising git repository');

  const init = await exec('git', ['init', '-q'], { cwd: answers.targetDir });
  if (!init.ok) {
    spinner.stop('git init failed', 1);
    return;
  }

  await exec('git', ['add', '-A'], { cwd: answers.targetDir });
  const commit = await exec(
    'git',
    ['commit', '-q', '-m', 'Initial commit from create-admin-panel'],
    { cwd: answers.targetDir },
  );

  if (!commit.ok) {
    // Almost always an unconfigured user.name/user.email. The repo is still
    // useful, so this is a note rather than a failure.
    spinner.stop('Repository initialised (nothing committed)');
    p.log.warn('Could not create the first commit — check `git config user.email`.');
    return;
  }

  spinner.stop('Repository initialised');
}

function nextSteps(answers) {
  const pm = answers.packageManager;
  const rel = relativeToCwd(answers.targetDir);
  const steps = [];

  if (rel !== '.') steps.push(`cd ${rel}`);
  if (!answers.install) steps.push(`${pm} install`);

  steps.push(answers.database === 'mock' ? runScript(pm, 'dev') : runScript(pm, 'dev:full'));

  return steps;
}

export async function run(argv) {
  const { values, directory } = parseCliArgs(argv);

  if (values.help) {
    console.log(HELP);
    return;
  }

  if (values.version) {
    const pkg = JSON.parse(
      await readFile(path.join(import.meta.dirname, '..', 'package.json'), 'utf8'),
    );
    console.log(pkg.version);
    return;
  }

  p.intro('create-admin-panel');

  const answers = await interview({ ...values, directory });
  const spinner = p.spinner();

  spinner.start('Copying template');
  const templateDir = await resolveTemplateDir();
  await copyTemplate(templateDir, answers.targetDir);
  spinner.stop('Template copied');

  spinner.start('Configuring project');
  await writePackageJson(answers.targetDir, answers);
  await writeEnv(answers.targetDir, answers);
  await applyDatabaseVariant(answers.targetDir, answers.database);
  if (answers.database === 'sqlite') {
    await ensureSqliteDirectory(answers.targetDir, answers.databaseUrl);
  }
  await applyResourceMode(answers.targetDir, answers.resources);
  await retargetAgentsDoc(answers.targetDir, answers.packageManager);
  await writeCi(answers.targetDir, answers);
  await writeReadme(answers.targetDir, answers);
  await removeTemplateArtifacts(answers.targetDir);
  spinner.stop('Configured');

  const installed = answers.install ? await runInstall(answers, spinner) : false;

  if (answers.resources === 'demo' && DATABASES[answers.database].migrations) {
    if (installed) await runMigrateAndSeed(answers, spinner);
    else
      p.log.warn(
        `Skipped migrations — run \`${runScript(answers.packageManager, 'db:migrate')}\` after installing.`,
      );
  }

  if (answers.resources === 'introspect') {
    if (installed) await runIntrospection(answers, spinner);
    else {
      // Introspection runs the project's own tsx and driver; without an install
      // there is nothing to run it with.
      await writeResourceIndex(answers.targetDir, []);
      p.log.warn(
        `Skipped schema introspection — it needs dependencies. After installing, run ` +
          `\`${runScript(answers.packageManager, 'db:introspect')}\` to see your tables.`,
      );
    }
  }

  if (installed) await formatProject(answers);

  if (answers.git) await runGitInit(answers, spinner);

  const database = DATABASES[answers.database];
  p.note(nextSteps(answers).join('\n'), 'Next');

  p.outro(
    answers.database === 'mock'
      ? 'Running on in-browser fixtures — README.md covers switching to a real database.'
      : `Wired to ${database.label}. Secrets live in .env, which is git-ignored.`,
  );
}

export async function main(argv) {
  try {
    await run(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    p.log.error(message);
    p.outro('Failed.');
    process.exit(1);
  }
}
