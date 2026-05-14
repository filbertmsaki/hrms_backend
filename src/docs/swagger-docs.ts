import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { organizeOpenApiDocument } from './openapi-organizer';

export const SWAGGER_DOCS_PATH = 'api-swagger-documentation';
export const OPENAPI_JSON_PATH = '/openapi.json';

export function createSwaggerDocument(app: INestApplication): OpenAPIObject {
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
    .addTag('Authentication', 'Authentication and session APIs')
    .addTag('Users', 'System user management APIs')
    .addTag('Roles', 'Role definition and assignment APIs')
    .addTag('Permissions', 'Permission definition and authorization APIs')
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
    .addTag('Offboarding', 'Offboarding workflow, clearance, and exit APIs')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) =>
      `${controllerKey}_${methodKey}`,
  });

  return organizeOpenApiDocument(document);
}

export function setupSwaggerDocumentation(
  app: INestApplication,
  document: OpenAPIObject,
): void {
  SwaggerModule.setup(SWAGGER_DOCS_PATH, app, document, {
    customSiteTitle: 'HRMS API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      displayOperationId: true,
      docExpansion: 'list',
      filter: true,
    },
  });
}

export function setupOpenApiJson(
  app: INestApplication,
  document: OpenAPIObject,
): void {
  app.use(OPENAPI_JSON_PATH, (_req, res) => {
    res.type('application/json').send(document);
  });
}
