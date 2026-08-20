import { writeFile } from 'node:fs/promises';
import { connectDatabase } from '../db';

/**
 * `pnpm db:introspect` — shows exactly what the API will expose.
 *
 * `--json <file>` writes the raw schema for tooling to read. It goes to a file
 * rather than stdout because connecting already logs the resolved dialect there.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const jsonIndex = args.indexOf('--json');
  const jsonPath = jsonIndex === -1 ? null : args[jsonIndex + 1];

  if (jsonIndex !== -1 && !jsonPath) {
    throw new Error('--json needs a file path, e.g. --json schema.json');
  }

  const db = await connectDatabase();
  const schemas = db.resources();

  if (jsonPath) {
    await writeFile(jsonPath, `${JSON.stringify(schemas, null, 2)}\n`);
    console.log(`\n  wrote ${schemas.length} table(s) to ${jsonPath}\n`);
    await db.close();
    return;
  }

  for (const schema of schemas) {
    console.log(`\n  ${schema.name}  (pk: ${schema.primaryKey})`);
    for (const column of schema.columns) {
      const relation = schema.relations.find((item) => item.column === column.name);
      console.log(
        `    ${column.name.padEnd(24)} ${column.kind.padEnd(8)} ${column.rawType}` +
          (relation ? `  → ${relation.target} as "${relation.as}"` : ''),
      );
    }
    if (schema.searchable.length > 0) {
      console.log(`    searchable: ${schema.searchable.join(', ')}`);
    }
  }

  console.log('');
  await db.close();
}

main().catch((error: unknown) => {
  console.error(`\n  ✗ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
