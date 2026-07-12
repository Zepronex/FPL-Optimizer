import { randomUUID } from 'node:crypto';
import express, {
  NextFunction,
  Request,
  RequestHandler,
  Response,
  Router as ExpressRouter
} from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { explainRecommendation } from './agent/explanationService';
import { ServerConfig } from './config';
import { createDbPool, Queryable } from './db/client';
import { createAgentRouter } from './routes/agent';
import { createAnalyzeRouter } from './routes/analyze';
import { createEvaluationRouter } from './routes/evaluation';
import { createHealthRouter } from './routes/health';
import { createModelRouter } from './routes/model';
import { createOptimizerRouter } from './routes/optimizer';
import { createPlayersRouter } from './routes/players';
import { createPredictionsRouter } from './routes/predictions';

export const API_ROUTE_GROUPS = [
  '/api/players',
  '/api/analyze',
  '/api/predictions',
  '/api/model',
  '/api/evaluation',
  '/api/optimizer',
  '/api/agent',
  '/api/health'
] as const;

export const EXPENSIVE_API_ROUTES = [
  'POST /api/analyze',
  'POST /api/optimizer/starting-xi',
  'POST /api/optimizer/transfers',
  'POST /api/optimizer/squad',
  'POST /api/agent/explain-recommendation',
  'GET /api/evaluation/data-health'
] as const;

type RouteName = 'players' | 'analyze' | 'predictions' | 'model' | 'evaluation' | 'optimizer' | 'agent' | 'health';

export type AppOptions = {
  client?: Queryable;
  routers?: Partial<Record<RouteName, ExpressRouter>>;
  rateLimitKey?: (request: Request) => string;
};

type HttpError = Error & {
  status?: number;
  statusCode?: number;
  type?: string;
};

class CorsOriginError extends Error {
  constructor() {
    super('cors_origin_not_allowed');
    this.name = 'CorsOriginError';
  }
}

export function createApp(config: ServerConfig, options: AppOptions = {}): express.Express {
  const app = express();
  const client = options.client ?? createDbPool(config.database);
  const routers = buildRouters(config, client, options.routers);

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.set('query parser', 'simple');

  app.use(helmet());
  app.use(assignRequestId);
  app.use(createGlobalRateLimiter(config, options.rateLimitKey));
  app.use(createExpensiveRateLimiter(config, options.rateLimitKey));
  app.use(createCorsMiddleware(config));
  app.use(enforceUrlLimits(config));
  app.use(rejectUnsupportedContentType);
  app.use(express.json({
    limit: config.requestLimits.jsonBodyBytes,
    strict: true,
    inflate: false,
    type: ['application/json', 'application/*+json']
  }));
  app.use(express.urlencoded({
    extended: false,
    inflate: false,
    limit: config.requestLimits.urlEncodedBodyBytes,
    parameterLimit: config.requestLimits.maxQueryParameters
  }));

  app.use('/api/players', routers.players);
  app.use('/api/analyze', routers.analyze);
  app.use('/api/predictions', routers.predictions);
  app.use('/api/model', routers.model);
  app.use('/api/evaluation', routers.evaluation);
  app.use('/api/optimizer', routers.optimizer);
  app.use('/api/agent', routers.agent);
  app.use('/api/health', routers.health);

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: 'endpoint_not_found'
    });
  });

  app.use(handleError(config));
  return app;
}

function buildRouters(
  config: ServerConfig,
  client: Queryable,
  overrides: AppOptions['routers'] = {}
): Record<RouteName, ExpressRouter> {
  return {
    players: overrides.players ?? createPlayersRouter(client),
    analyze: overrides.analyze ?? createAnalyzeRouter(client),
    predictions: overrides.predictions ?? createPredictionsRouter(client),
    model: overrides.model ?? createModelRouter(client),
    evaluation: overrides.evaluation ?? createEvaluationRouter(client, {
      playerGameweekHistoryPath: config.database.defaultFplHistoryPath
    }),
    optimizer: overrides.optimizer ?? createOptimizerRouter(client),
    agent: overrides.agent ?? createAgentRouter({
      readAgentStatus: () => config.agentPublicStatus,
      explainRecommendation: input => explainRecommendation(input, { config: config.agent })
    }),
    health: overrides.health ?? createHealthRouter({
      service: 'scoutiq-api',
      version: config.appVersion
    })
  };
}

function assignRequestId(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

function createCorsMiddleware(config: ServerConfig): RequestHandler {
  const allowedOrigins = new Set(config.corsAllowedOrigins);
  return cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new CorsOriginError());
    },
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Request-Id'],
    maxAge: 600
  });
}

function createGlobalRateLimiter(
  config: ServerConfig,
  keyOverride?: (request: Request) => string
): RequestHandler {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: request => readRateLimitKey(request, keyOverride),
    handler: (_request, response) => {
      response.status(429).json({
        success: false,
        error: 'rate_limit_exceeded'
      });
    }
  });
}

function createExpensiveRateLimiter(
  config: ServerConfig,
  keyOverride?: (request: Request) => string
): RequestHandler {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.expensiveMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: request => !isExpensiveRequest(request),
    keyGenerator: request => readRateLimitKey(request, keyOverride),
    handler: (_request, response) => {
      response.status(429).json({
        success: false,
        error: 'expensive_rate_limit_exceeded'
      });
    }
  });
}

function readRateLimitKey(request: Request, override?: (request: Request) => string): string {
  const key = override?.(request) ?? request.ip ?? request.socket.remoteAddress ?? 'unknown-client';
  return ipKeyGenerator(key);
}

export function isExpensiveRequest(request: Pick<Request, 'method' | 'path'>): boolean {
  const normalizedPath = (request.path.length > 1 ? request.path.replace(/\/+$/, '') : request.path)
    .toLowerCase();
  if (request.method === 'GET' || request.method === 'HEAD') {
    return normalizedPath === '/api/evaluation/data-health';
  }
  if (request.method !== 'POST') return false;
  return normalizedPath === '/api/analyze' ||
    normalizedPath.startsWith('/api/optimizer/') ||
    normalizedPath === '/api/agent/explain-recommendation';
}

function enforceUrlLimits(config: ServerConfig): RequestHandler {
  return (request, response, next) => {
    if (request.originalUrl.length > config.requestLimits.maxUrlLength) {
      response.status(414).json({ success: false, error: 'url_too_long' });
      return;
    }

    const queryIndex = request.originalUrl.indexOf('?');
    if (queryIndex >= 0) {
      const query = new URLSearchParams(request.originalUrl.slice(queryIndex + 1));
      let count = 0;
      for (const _entry of query) count += 1;
      if (count > config.requestLimits.maxQueryParameters) {
        response.status(400).json({ success: false, error: 'too_many_query_parameters' });
        return;
      }
    }
    next();
  };
}

function rejectUnsupportedContentType(request: Request, response: Response, next: NextFunction): void {
  if (!['POST', 'PUT', 'PATCH'].includes(request.method) || !requestHasBody(request)) {
    next();
    return;
  }

  if (request.is(['application/json', 'application/*+json', 'application/x-www-form-urlencoded'])) {
    next();
    return;
  }

  response.status(415).json({
    success: false,
    error: 'unsupported_media_type'
  });
}

function requestHasBody(request: Request): boolean {
  const contentLength = request.headers['content-length'];
  if (contentLength !== undefined) return contentLength !== '0';
  return request.headers['transfer-encoding'] !== undefined;
}

function handleError(config: ServerConfig): express.ErrorRequestHandler {
  return (error: HttpError, _request, response, _next) => {
    if (error instanceof CorsOriginError) {
      response.status(403).json({ success: false, error: 'cors_origin_not_allowed' });
      return;
    }
    if (error.type === 'entity.too.large' || error.status === 413 || error.statusCode === 413) {
      response.status(413).json({ success: false, error: 'payload_too_large' });
      return;
    }
    if (error.type === 'entity.parse.failed' || error instanceof SyntaxError) {
      response.status(400).json({ success: false, error: 'malformed_json' });
      return;
    }
    if (error.status === 415 || error.statusCode === 415) {
      response.status(415).json({ success: false, error: 'unsupported_content_encoding' });
      return;
    }

    const payload: Record<string, unknown> = {
      success: false,
      error: 'internal_server_error'
    };
    if (config.environment === 'development') payload.requestId = response.locals.requestId;
    response.status(500).json(payload);
  };
}
