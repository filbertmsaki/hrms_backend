import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { static as expressStatic } from 'express';
import helmet from 'helmet';
import { join, resolve } from 'path';
import { DataSource } from 'typeorm';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { isOriginAllowed } from './common/utils/allowed-origin.util';
import { runAllSeeders } from './database/seeds';
import { assertSecureSeederPasswords } from './database/seeds/seeder-guards';
import {
  createSwaggerDocument,
  OPENAPI_JSON_PATH,
  setupOpenApiJson,
  setupSwaggerDocumentation,
  SWAGGER_DOCS_PATH,
} from './docs/swagger-docs';
import { SCALAR_DOCS_PATH, setupScalarDocumentation } from './docs/scalar-docs';

async function bootstrap(): Promise<void> {
  console.log('[BOOT-1] main.ts loaded');

  const logger = new Logger('Bootstrap');

  console.log('[BOOT-2] Creating Nest application');

  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
    bodyParser: false,
  });

  console.log('[BOOT-3] Nest application created');

  const configService = app.get(ConfigService);
  console.log('[BOOT-4] ConfigService loaded');

  // Base64 uploads expand by roughly one third in JSON. Keep request parsing
  // aligned with the configured file limit so employee document uploads work
  // on web and mobile instead of silently hitting Express's 100 KB default.
  const maximumUploadBytes =
    configService.get<number>('MAX_UPLOAD_FILE_SIZE_BYTES') ?? 10 * 1024 * 1024;
  const maximumJsonBodyBytes =
    Math.ceil(maximumUploadBytes * (4 / 3)) + 256 * 1024;
  app.use(json({ limit: maximumJsonBodyBytes }));
  app.use(urlencoded({ extended: true, limit: maximumJsonBodyBytes }));

  const appEnv = configService.get<string>('APP_ENV') ?? 'development';
  const host = configService.get<string>('APP_HOST') ?? '0.0.0.0';
  const rawPort = configService.get<string | number>('APP_PORT');

  if (!rawPort) {
    throw new Error('APP_PORT is required');
  }

  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid APP_PORT value: ${String(rawPort)}`);
  }

  const globalPrefix = configService.get<string>('APP_GLOBAL_PREFIX') ?? 'api';
  const allowedOrigins =
    configService.get<string[]>('APP_ALLOWED_ORIGINS') ?? [];
  const trustProxy = configService.get<boolean>('APP_TRUST_PROXY') ?? false;
  const enableApiDocs =
    configService.get<boolean>('APP_ENABLE_API_DOCS') ?? false;
  const publicStorageRoot = resolve(
    process.cwd(),
    configService.get<string>('APP_PUBLIC_STORAGE_PATH') ?? 'uploads',
  );
  const runSeederOnStartup =
    configService.get<boolean>('RUN_SEEDER_ON_STARTUP') ?? false;

  console.log('[BOOT-5] Configuration loaded', {
    appEnv,
    host,
    port,
    globalPrefix,
    enableApiDocs,
  });

  if (trustProxy) {
    const expressApplication = app.getHttpAdapter().getInstance() as {
      set(setting: string, value: number): void;
    };
    expressApplication.set('trust proxy', 1);
  }

  app.setGlobalPrefix(globalPrefix, {
    exclude: [{ path: '', method: RequestMethod.GET }],
  });

  const correlationIdMiddleware = new CorrelationIdMiddleware();

  app.use(correlationIdMiddleware.use.bind(correlationIdMiddleware));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: false,
      transformOptions: {
        enableImplicitConversion: false,
      },
    }),
  );
  app.use(
    helmet({
      // Swagger/Scalar rely on inline assets that do not work with Helmet's
      // default CSP without a dedicated nonce/hash policy.
      contentSecurityPolicy: enableApiDocs ? false : undefined,
      // Public avatars and profile photos are consumed by the frontend on a
      // separate origin, so keep those assets loadable.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (isOriginAllowed(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Accept',
      'X-Request-Id',
      'X-Company-Id',
    ],
    exposedHeaders: ['Content-Disposition', 'Content-Length', 'X-Request-Id'],
    maxAge: 86400,
  });

  const staticOptions = {
    dotfiles: 'deny' as const,
    index: false,
    redirect: false,
    // Let Nest return a normal 404 when a media file is missing. Passing the
    // express-static ENOENT into the global exception filter surfaced missing
    // avatars as misleading 500 responses.
    fallthrough: true,
    maxAge: appEnv === 'production' ? '1d' : 0,
  };

  app.use(
    '/uploads/profile-photos',
    expressStatic(join(publicStorageRoot, 'profile-photos'), staticOptions),
  );
  app.use(
    '/uploads/default-avatars',
    expressStatic(join(publicStorageRoot, 'default-avatars'), staticOptions),
  );

  console.log('[BOOT-6] Middleware configured');

  if (runSeederOnStartup) {
    logger.log('RUN_SEEDER_ON_STARTUP enabled. Running database seeders.');
    assertSecureSeederPasswords();
    await runAllSeeders(app.get(DataSource));
    logger.log('Database seeders completed during application startup.');
  }

  if (enableApiDocs) {
    console.log('[BOOT-7] Creating Swagger document');

    const document = createSwaggerDocument(app);

    console.log('[BOOT-8] Swagger document created');

    setupSwaggerDocumentation(app, document);
    setupOpenApiJson(app, document);
    setupScalarDocumentation(app, document);

    logger.log(`Swagger documentation enabled at /${SWAGGER_DOCS_PATH}`);
    logger.log(`Scalar documentation enabled at ${SCALAR_DOCS_PATH}`);
    logger.log(`OpenAPI JSON enabled at ${OPENAPI_JSON_PATH}`);
  } else {
    console.log('[BOOT-7] API documentation disabled');
    logger.log('API documentation is disabled.');
  }

  app.enableShutdownHooks();

  console.log(`[BOOT-8] Starting HTTP listener ${host}:${port}`);

  await app.listen(port, host);

  console.log(
    `[BOOT-9] HRMS API STARTED: http://${host}:${port}/${globalPrefix}`,
  );

  logger.log(`HRMS API running in ${appEnv} mode on ${host}:${port}`);
}

bootstrap().catch((error: unknown) => {
  console.error('\n========================================');
  console.error('HRMS BOOTSTRAP FAILED');
  console.error('========================================');

  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(error);
  }

  console.error('========================================\n');

  process.exit(1);
});
