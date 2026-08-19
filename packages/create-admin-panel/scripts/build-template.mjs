#!/usr/bin/env node
/**
 * Copies the repository into `template/` at pack time.
 *
 * The repo root is the single source of truth — the template is a build
 * artifact, never committed, so the two cannot drift.
 *
 * Transforms that do not depend on the user's answers happen *here* rather than
 * in the CLI. A broken anchor then fails on `pnpm pack` instead of silently
 * no-op'ing on a stranger's machine.
 */
import { cp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PACKAGE_DIR = path.resolve(import.meta.dirname, '..');
const REPO_ROOT = path.resolve(PACKAGE_DIR, '..', '..');
const TEMPLATE_DIR = path.join(PACKAGE_DIR, 'template');

/**
 * Allowlist, not denylist: a new top-level file in the repo should not leak
 * into published tarballs just because nobody remembered to exclude it.
 */
const COPY = [
  'src',
  'server',
  'tests',
  'scripts',
  'public',
  'docs',
  'index.html',
  'package.json',
  'vite.config.ts',
  'vitest.config.ts',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'tsconfig.server.json',
  'tsconfig.test.json',
  'eslint.config.js',
  '.prettierrc.json',
  'AGENTS.md',
];

/**
 * npm strips a file literally named `.gitignore` out of the published tarball,
 * so it ships prefixed and the CLI renames it back. `.env.example` rides along
 * on the same convention rather than relying on it being treated differently.
 */
const RENAME = {
  '.gitignore': '_gitignore',
  '.env.example': '_env.example',
};

const SKIP_ENTRIES = new Set(['node_modules', '.DS_Store', 'coverage', 'dist']);

const COVERAGE_THRESHOLD_ANCHOR = `      // The suite covers every branch today. Anything a test cannot reach is
      // marked \`/* v8 ignore next */\` at the source with the reason, so a drop
      // here means new code arrived without a test rather than a bad threshold.
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
`;

const COVERAGE_THRESHOLD_REPLACEMENT = `      // No thresholds by default: a freshly generated project would otherwise
      // fail its own \`test\` command the moment you add an untested resource.
      // Add \`thresholds: { lines: 80 }\` (or 100, as the framework repo does)
      // once you have decided what bar this project should hold.
`;

const DEMO_MAIN_IMPORT_ANCHOR = `import { withRepeaterRelationships } from '@/resources/data/repeaterRelationships';\n`;

const DEMO_MAIN_MOCK_ANCHOR = `    const { mockAdapter } = await import('@/core/data/mock/mockAdapter');
    const { withMockPostBlocks } = await import('@/resources/data/mockPostBlocks');
    apiClient.defaults.adapter = withMockPostBlocks(mockAdapter);
`;

const DEMO_MAIN_MOCK_REPLACEMENT = `    const { mockAdapter } = await import('@/core/data/mock/mockAdapter');
    apiClient.defaults.adapter = mockAdapter;
`;

const DEMO_MAIN_PROVIDER_ANCHOR = `  // Fills and saves every \`Repeater.relationship()\` through the seven provider
  // methods, so a child table needs no endpoint of its own.
  setDataProvider(withRepeaterRelationships(restDataProvider));
`;

const DEMO_MAIN_PROVIDER_REPLACEMENT = `  setDataProvider(restDataProvider);
`;

const MONGO_IMPORT_ANCHOR = `import { createMongoAdapter } from './mongoAdapter';\n`;

const MONGO_BRANCH_ANCHOR = `  const adapter =
    dialect === 'mongodb'
      ? await createMongoAdapter(url)
      : await createSqlAdapter(createKnex(url, dialect), dialect);
`;

const MONGO_BRANCH_REPLACEMENT = `  if (dialect === 'mongodb') {
    throw new Error(
      'This project was generated without the MongoDB adapter. ' +
        'See docs/database.md for the DatabaseAdapter contract.',
    );
  }

  const adapter = await createSqlAdapter(createKnex(url, dialect), dialect);
`;

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/** Replaces exactly once, or throws — a silent miss is the failure mode worth preventing. */
function replaceOnce(source, anchor, replacement, label) {
  const occurrences = source.split(anchor).length - 1;

  if (occurrences !== 1) {
    throw new Error(
      `build-template: expected exactly 1 occurrence of the ${label} anchor, found ${occurrences}.\n` +
        `The repository changed underneath this script — update the anchor in ` +
        `packages/create-admin-panel/scripts/build-template.mjs.`,
    );
  }

  return source.replace(anchor, replacement);
}

async function copyTree() {
  await rm(TEMPLATE_DIR, { recursive: true, force: true });
  await mkdir(TEMPLATE_DIR, { recursive: true });

  for (const entry of COPY) {
    const from = path.join(REPO_ROOT, entry);

    if (!(await exists(from))) {
      throw new Error(`build-template: "${entry}" is in the allowlist but missing from the repo.`);
    }

    await cp(from, path.join(TEMPLATE_DIR, entry), {
      recursive: true,
      filter: (source) => !SKIP_ENTRIES.has(path.basename(source)),
    });
  }

  for (const [from, to] of Object.entries(RENAME)) {
    const source = path.join(REPO_ROOT, from);

    if (!(await exists(source))) {
      throw new Error(`build-template: "${from}" is missing from the repo.`);
    }

    await cp(source, path.join(TEMPLATE_DIR, to));
  }
}

async function stripCoverageThresholds() {
  const file = path.join(TEMPLATE_DIR, 'vitest.config.ts');
  const source = await readFile(file, 'utf8');

  await writeFile(
    file,
    replaceOnce(
      source,
      COVERAGE_THRESHOLD_ANCHOR,
      COVERAGE_THRESHOLD_REPLACEMENT,
      'coverage threshold',
    ),
  );
}

/**
 * `server/db/mongoAdapter.ts` statically imports `mongodb`, so a project that
 * pruned that driver cannot typecheck while the adapter is present. Precompute
 * the mongo-free `server/db/index.ts` here; the CLI only has to move a file.
 */
async function buildMongoFreeVariant() {
  const file = path.join(TEMPLATE_DIR, 'server/db/index.ts');
  const source = await readFile(file, 'utf8');

  const withoutImport = replaceOnce(source, MONGO_IMPORT_ANCHOR, '', 'mongo adapter import');
  const withoutBranch = replaceOnce(
    withoutImport,
    MONGO_BRANCH_ANCHOR,
    MONGO_BRANCH_REPLACEMENT,
    'mongo dialect branch',
  );

  await writeFile(path.join(TEMPLATE_DIR, 'server/db/index.nomongo.ts'), withoutBranch);
}

/**
 * `src/main.tsx` wires two demo-only modules under `src/resources/data/`, which
 * a project without the demo panel does not have. Same trick as the mongo
 * variant: precompute the demo-free entry point, leave the CLI a rename.
 */
async function buildDemoFreeMain() {
  const source = await readFile(path.join(TEMPLATE_DIR, 'src/main.tsx'), 'utf8');

  let output = replaceOnce(source, DEMO_MAIN_IMPORT_ANCHOR, '', 'demo main import');
  output = replaceOnce(
    output,
    DEMO_MAIN_MOCK_ANCHOR,
    DEMO_MAIN_MOCK_REPLACEMENT,
    'demo mock adapter wiring',
  );
  output = replaceOnce(
    output,
    DEMO_MAIN_PROVIDER_ANCHOR,
    DEMO_MAIN_PROVIDER_REPLACEMENT,
    'demo data provider wiring',
  );

  await writeFile(path.join(TEMPLATE_DIR, 'src/main.nodemo.tsx'), output);
}

/**
 * The repo builds and formats this scaffolder; a project generated by it has no
 * `packages/` directory, so those globs would match nothing and that script
 * would point at a path that does not exist.
 */
async function trimPackageScripts() {
  const file = path.join(TEMPLATE_DIR, 'package.json');
  const pkg = JSON.parse(await readFile(file, 'utf8'));

  if (!pkg.scripts['build:template']) {
    throw new Error('build-template: expected a `build:template` script to remove.');
  }
  delete pkg.scripts['build:template'];

  for (const script of ['format', 'format:check']) {
    pkg.scripts[script] = replaceOnce(
      pkg.scripts[script],
      ' "packages/**/*.{js,mjs,md}"',
      '',
      `${script} packages glob`,
    );
  }

  await writeFile(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

/**
 * The repo's copy documents the framework's own workflow. A generated project
 * has no `packages/` directory and no create-admin-panel section.
 */
async function trimAgentsDoc() {
  const file = path.join(TEMPLATE_DIR, 'AGENTS.md');
  const source = await readFile(file, 'utf8');
  const marker = '\n## Publishing the scaffolder\n';
  const index = source.indexOf(marker);

  if (index !== -1) {
    await writeFile(file, source.slice(0, index).trimEnd() + '\n');
  }
}

async function main() {
  await copyTree();
  await stripCoverageThresholds();
  await buildMongoFreeVariant();
  await buildDemoFreeMain();
  await trimPackageScripts();
  await trimAgentsDoc();

  console.log(`✓ template built at ${path.relative(process.cwd(), TEMPLATE_DIR)}`);
}

main().catch((error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
