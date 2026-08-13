import { createServer } from 'node:http';
import { createAuth } from './auth';
import { connectDatabase } from './db';
import { assertProductionSecrets, env } from './env';
import { createRequestListener } from './http';
import { createRouter } from './routes';

async function main(): Promise<void> {
  assertProductionSecrets();

  console.log('\n  admin-panel api');
  const db = await connectDatabase();
  const auth = createAuth(db);

  const server = createServer(createRequestListener(createRouter(db, auth)));

  server.listen(env.port, () => {
    console.log(`  listening http://localhost:${env.port}\n`);
  });

  const shutdown = async () => {
    server.close();
    await db.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error(`\n  ✗ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
