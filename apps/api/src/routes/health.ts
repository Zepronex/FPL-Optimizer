import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { EmptyQuerySchema } from './validation';

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
  const version = readVersion(
    options.version ?? options.env?.SCOUTIQ_APP_VERSION ?? options.env?.npm_package_version
  );

  return {
    status: 'ok',
    service: options.service ?? DEFAULT_SERVICE_NAME,
    ...(version ? { version } : {}),
    timestamp: (options.now ?? (() => new Date()))().toISOString()
  };
}

export function createHealthRouter(options: HealthRouterOptions = {}): ExpressRouter {
  const router: ExpressRouter = Router();

  router.get('/', (req, res) => {
    try {
      EmptyQuerySchema.parse(req.query);
      res.json(buildHealthResponse(options));
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'invalid_health_request',
          details: error.errors
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'health_request_failed'
      });
    }
  });

  return router;
}

function readVersion(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
