import { createApp } from './app';
import { ConfigurationError, loadServerConfig } from './config';
import { createDbPool } from './db/client';

function start(): void {
  try {
    const config = loadServerConfig();
    const pool = createDbPool(config.database);
    const app = createApp(config, { client: pool });
    const server = app.listen(config.port, config.bindAddress);
    server.requestTimeout = 30_000;
    server.headersTimeout = 15_000;
    server.keepAliveTimeout = 5_000;
    server.maxRequestsPerSocket = 100;

    const shutDown = (): void => {
      server.close(() => {
        void pool.end().finally(() => process.exit(0));
      });
    };
    process.once('SIGINT', shutDown);
    process.once('SIGTERM', shutDown);
  } catch (error) {
    const message = error instanceof ConfigurationError
      ? error.message
      : 'ScoutIQ API failed to start because server configuration is invalid.';
    console.error(message);
    process.exitCode = 1;
  }
}

start();
