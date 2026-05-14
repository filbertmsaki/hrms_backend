import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api', {
    exclude: [{ path: '', method: RequestMethod.GET }],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle('HRMS Backend API')
    .setDescription(
      [
        'Enterprise Human Resource Management System API.',
        '',
        'This API covers:',
        '- Company and user access control',
        '- Branches, departments, positions, and designations',
        '- Employee records and assignment history',
        '- Leave management workflows and approvals',
        '- Onboarding workflows and approvals',
      ].join('\n'),
    )
    .setVersion('1.0')
    .setContact('HRMS Backend Team', 'https://example.com', 'support@example.com')
    .setLicense('UNLICENSED', '')
    .addServer('/', 'Application API Base Path')
    .addBearerAuth()
    .addTag('Auth', 'Authentication and session APIs')
    .addTag('Users', 'System user management APIs')
    .addTag('Companies', 'Company and membership APIs')
    .addTag('Branches', 'Branch structure and access APIs')
    .addTag('Departments', 'Department hierarchy APIs')
    .addTag('Positions', 'Organizational position APIs')
    .addTag('Designations', 'Designation/job title APIs')
    .addTag('Employees', 'Employee profile and assignment APIs')
    .addTag('Employee Positions', 'Employee position assignment history APIs')
    .addTag(
      'Employee Designations',
      'Employee designation progression history APIs',
    )
    .addTag('Leave', 'Leave policy, request, workflow, and balance APIs')
    .addTag('Onboarding', 'Onboarding workflow and request APIs')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  app.use('/openapi.json', (_req, res) => {
    res.type('application/json').send(document);
  });

  app.use(
    '/api-documentation',
    apiReference({
      pageTitle: 'HRMS API Documentation',
      title: 'HRMS API Reference',
      content: document,
      theme: 'bluePlanet',
      layout: 'modern',
      darkMode: true,
      hideDarkModeToggle: false,
      showSidebar: true,
      hideSearch: false,
      defaultOpenFirstTag: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      operationTitleSource: 'summary',
      showOperationId: true,
      persistAuth: true,
      hideTestRequestButton: false,
      documentDownloadType: 'both',
      withDefaultFonts: true,
      metaData: {
        title: 'HRMS API Documentation',
        description:
          'Interactive documentation for HRMS backend modules and workflows.',
      },
      customCss: `
        .light-mode {
          --scalar-color-accent: #0f766e;
          --scalar-button-1: #0f766e;
          --scalar-button-1-color: #ffffff;
          --scalar-button-1-hover: #115e59;
        }
        .dark-mode {
          --scalar-color-accent: #14b8a6;
          --scalar-button-1: #14b8a6;
          --scalar-button-1-color: #042f2e;
          --scalar-button-1-hover: #2dd4bf;
        }
      `,
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Scalar API Docs: http://localhost:${port}/api-documentation`);
  console.log(`OpenAPI JSON: http://localhost:${port}/openapi.json`);
}
bootstrap();
