import { createServer } from 'node:http';
import { createAuth } from './auth';
import { connectDatabase } from './db';
import { ensureMigrationsCurrent } from './db/migrate';
import { assertProductionSecrets, env } from './env';
import { createRequestListener } from './http';
import { createRouter } from './routes';

async function main(): Promise<void> {
  assertProductionSecrets();

  console.log('\n  admin-panel api');

  // Before introspection: the schema read on boot has to be the migrated one.
  await ensureMigrationsCurrent();

  const db = await connectDatabase();
  const auth = createAuth(db);

  const server = createServer(createRequestListener(createRouter(db, auth)));

  server.listen(env.port, () => {
    console.log(`  listening http://localhost:${env.port}\n`);
  });

  // Long enough for in-flight requests to answer, short enough that an
  // orchestrator's own kill timer does not beat us to it.
  const DRAIN_TIMEOUT_MS = 10_000;
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n  ${signal} — draining…`);

    // `server.close` stops accepting new sockets and calls back once the last
    // in-flight response has finished. Previously this was neither awaited nor
    // followed by a pool drain, so a rolling deploy cut live requests off
    // mid-response and left their transactions to time out server-side.
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    const timedOut = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), DRAIN_TIMEOUT_MS).unref(),
    );

    if ((await Promise.race([closed, timedOut])) === 'timeout') {
      console.warn(`  drain timed out after ${DRAIN_TIMEOUT_MS}ms — closing anyway`);
      server.closeAllConnections();
    }

    await db.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  console.error(`\n  ✗ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
