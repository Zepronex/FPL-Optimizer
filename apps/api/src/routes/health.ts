import { Router, type Router as ExpressRouter } from 'express';

export type HealthResponse = {
  status: 'ok';
  service: string;
  timestamp: string;
  version?: string;
};

type HealthRouterOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  service?: string;
  version?: string;
};

const DEFAULT_SERVICE_NAME = 'scoutiq-api';

export function buildHealthResponse(options: HealthRouterOptions = {}): HealthResponse {
  const env = options.env ?? process.env;
  const version = readVersion(options.version ?? env.SCOUTIQ_APP_VERSION ?? env.npm_package_version);

  return {
    status: 'ok',
    service: options.service ?? DEFAULT_SERVICE_NAME,
    ...(version ? { version } : {}),
    timestamp: (options.now ?? (() => new Date()))().toISOString()
  };
}

export function createHealthRouter(options: HealthRouterOptions = {}): ExpressRouter {
  const router: ExpressRouter = Router();

  router.get('/', (_req, res) => {
    res.json(buildHealthResponse(options));
  });

  return router;
}

function readVersion(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const healthRouter = createHealthRouter();
