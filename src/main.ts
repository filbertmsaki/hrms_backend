import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { static as expressStatic } from 'express';
import helmet from 'helmet';
import { join, resolve } from 'path';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import {
  createSwaggerDocument,
  OPENAPI_JSON_PATH,
  setupOpenApiJson,
  setupSwaggerDocumentation,
  SWAGGER_DOCS_PATH,
} from './docs/swagger-docs';
import { SCALAR_DOCS_PATH, setupScalarDocumentation } from './docs/scalar-docs';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const appEnv = configService.get<string>('APP_ENV') ?? 'development';
  const host = configService.get<string>('APP_HOST') ?? '0.0.0.0';
  const port = configService.get<number>('APP_PORT') ?? 8888;
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

  if (trustProxy) {
    const expressApplication = app.getHttpAdapter().getInstance() as {
      set(setting: string, value: number): void;
    };
    expressApplication.set('trust proxy', 1);
  }

  app.setGlobalPrefix(globalPrefix, {
    exclude: [{ path: '', method: RequestMethod.GET }],
  });
  app.use(
    new CorrelationIdMiddleware().use.bind(new CorrelationIdMiddleware()),
  );
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

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(
        new Error(`Origin '${origin}' is not allowed by CORS policy.`),
        false,
      );
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
    fallthrough: false,
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

  if (enableApiDocs) {
    const document = createSwaggerDocument(app);

    setupSwaggerDocumentation(app, document);
    setupOpenApiJson(app, document);
    setupScalarDocumentation(app, document);

    logger.log(`Swagger documentation enabled at /${SWAGGER_DOCS_PATH}`);
    logger.log(`Scalar documentation enabled at ${SCALAR_DOCS_PATH}`);
    logger.log(`OpenAPI JSON enabled at ${OPENAPI_JSON_PATH}`);
  } else {
    logger.log('API documentation is disabled.');
  }

  app.enableShutdownHooks();

  await app.listen(port, host);

  logger.log(`HRMS API running in ${appEnv} mode on ${host}:${port}`);
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');

  logger.error(
    'Failed to bootstrap HRMS application.',
    error instanceof Error ? error.stack : String(error),
  );

  process.exit(1);
});
