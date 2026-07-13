import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import {
  createSwaggerDocument,
  OPENAPI_JSON_PATH,
  setupOpenApiJson,
  setupSwaggerDocumentation,
  SWAGGER_DOCS_PATH,
} from './docs/swagger-docs';
import { SCALAR_DOCS_PATH, setupScalarDocumentation } from './docs/scalar-docs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api', {
    exclude: [{ path: '', method: RequestMethod.GET }],
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors();

  const document = createSwaggerDocument(app);
  setupSwaggerDocumentation(app, document);
  setupOpenApiJson(app, document);
  setupScalarDocumentation(app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(
    `Swagger API Docs: http://localhost:${port}/${SWAGGER_DOCS_PATH}`,
  );
  console.log(`Scalar API Docs: http://localhost:${port}${SCALAR_DOCS_PATH}`);
  console.log(`OpenAPI JSON: http://localhost:${port}${OPENAPI_JSON_PATH}`);
}
bootstrap().catch((error) => {
  console.error('Failed to bootstrap application', error);
  process.exit(1);
});
