import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { CorrelationIdMiddleware } from '../../src/common/middleware/correlation-id.middleware';

/**
 * Boots the real AppModule (real guards, real strategies, real database
 * connection) against whatever DB_NAME/REDIS_URL are set in process.env at
 * import time. Callers must set process.env.DB_NAME to a dedicated test
 * database (e.g. hrms_test_db) before importing this helper.
 */
export async function createE2eApp(): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app: INestApplication = moduleRef.createNestApplication();
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  const correlationIdMiddleware = new CorrelationIdMiddleware();

  app.setGlobalPrefix('api');
  app.use(correlationIdMiddleware.use.bind(correlationIdMiddleware));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  await app.init();

  return app;
}
