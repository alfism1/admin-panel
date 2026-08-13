import { env } from '../env';
import { createKnex, detectDialect, redact } from './connect';
import { createMongoAdapter } from './mongoAdapter';
import { createSqlAdapter } from './sqlAdapter';
import type { DatabaseAdapter } from './types';

export { HttpError } from './types';
export type { DatabaseAdapter, ListParams, ResourceSchema, Row } from './types';

/**
 * The only thing that decides which database is used is the scheme of
 * DATABASE_URL. Nothing else in the server knows or cares.
 */
export async function connectDatabase(url = env.databaseUrl): Promise<DatabaseAdapter> {
  const dialect = detectDialect(url);

  const adapter =
    dialect === 'mongodb'
      ? await createMongoAdapter(url)
      : await createSqlAdapter(createKnex(url, dialect), dialect);

  console.log(`  database  ${dialect} → ${redact(url)}`);
  console.log(
    `  resources ${
      adapter
        .resources()
        .map((schema) => schema.name)
        .join(', ') || '(none found)'
    }`,
  );

  return adapter;
}
