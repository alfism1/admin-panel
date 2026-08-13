import { connectDatabase } from '../db';

/** `pnpm db:introspect` — shows exactly what the API will expose. */
async function main(): Promise<void> {
  const db = await connectDatabase();

  for (const schema of db.resources()) {
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
