import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { Response } from 'express';
import { organizeOpenApiDocument } from './openapi-organizer';

export const SWAGGER_DOCS_PATH = 'api-swagger-documentation';
export const OPENAPI_JSON_PATH = '/openapi.json';

/**
 * ──────────────────────────────────────────────
 *  Tag Definitions
 *  Tags are listed in NATURAL USER JOURNEY order.
 *  Each tag describes the module's role in the
 *  HRMS workflow.
 * ──────────────────────────────────────────────
 */
const API_TAGS = [
  {
    name: 'Authentication',
    description:
      'Authentication endpoints for account registration, login, 2FA, password management, and logout. ' +
      'These are the first endpoints any user or frontend consumes.',
  },
  {
    name: 'Users',
    description:
      'User profile management — self-service (me) and administrative CRUD operations on system users, ' +
      'including role assignments and 2FA settings.',
  },
  {
    name: 'Roles',
    description:
      'Role definition and permission assignment. Roles group permissions together for simplified access control.',
  },
  {
    name: 'Permissions',
    description:
      'Fine-grained permission definitions that control access to specific actions across the system.',
  },
  {
    name: 'Companies',
    description:
      'Multi-tenant company management. Create companies, list accessible companies, and manage the ' +
      'company membership context.',
  },
  {
    name: 'Branches',
    description:
      'Branch / physical-location management. CRUD for organizational branches and branch-level access control.',
  },
  {
    name: 'Departments',
    description:
      'Department hierarchy management. CRUD for departments that reflect the organizational structure.',
  },
  {
    name: 'Positions',
    description:
      'Job position management. CRUD for positions that define roles within the organizational structure.',
  },
  {
    name: 'Employees',
    description:
      'Employee master data — core profile, contacts, addresses, relatives, identifications, bank accounts, ' +
      'academic and professional qualifications, and experience history.',
  },
  {
    name: 'Employee Positions',
    description:
      'Employee position assignment history — track when an employee is assigned to or moves between positions.',
  },
  {
    name: 'Leave',
    description:
      'Complete leave management — leave types, policies, approval workflows, holiday calendars, ' +
      'leave requests, balances, approvals, and supporting documents.',
  },
  {
    name: 'Onboarding',
    description:
      'Employee onboarding — workflows, steps, requests, tasks, document verification, and progress tracking.',
  },
  {
    name: 'Offboarding',
    description:
      'Employee offboarding / exit management — workflows, steps, requests, tasks, clearances, ' +
      'approvals, and audit logs.',
  },
] as const;

export function buildSwaggerConfig(): Omit<OpenAPIObject, 'paths'> {
  const builder = new DocumentBuilder()
    .setTitle('HRMS Backend API')
    .setDescription(
      [
        '# Enterprise Human Resource Management System API',
        '',
        'This API powers a multi-tenant HRMS platform used to manage company structures, ',
        'employee records, leave workflows, onboarding, and offboarding processes.',
        '',
        '## Getting Started',
        '',
        '1. **Register** a new account (creates a company and admin profile)',
        '2. **Login** with email and password',
        '3. Use the **Bearer token** returned from login to authorize',
        '4. Navigate to the relevant module tag to perform CRUD operations',
        '',
        '## Authentication',
        '',
        'All endpoints except Registration and Login require a Bearer token.',
        'Click the **Authorize** button at the top of this page to set your token.',
        '',
        '## Base URL',
        '',
        '```',
        'https://your-instance/api/',
        '```',
      ].join('\n'),
    )
    .setVersion('1.0')
    .setContact(
      'HRMS Support Team',
      'https://example.com',
      'support@example.com',
    )
    .setLicense('Proprietary - UNLICENSED', '')
    .addServer('/', 'Local development server')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Paste your JWT access token here. Tokens are obtained from the login endpoint.',
      },
      'access-token',
    );

  for (const tag of API_TAGS) {
    builder.addTag(tag.name, tag.description);
  }

  return builder.build();
}

export function createSwaggerDocument(app: INestApplication): OpenAPIObject {
  const config = buildSwaggerConfig();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) => {
      // Clean up controller name: "BranchesController" -> "Branches"
      const cleanKey = controllerKey.replace(/Controller$/, '');
      return `${cleanKey}_${methodKey}`;
    },
    deepScanRoutes: true,
  });

  return organizeOpenApiDocument(document);
}

export function setupSwaggerDocumentation(
  app: INestApplication,
  document: OpenAPIObject,
): void {
  SwaggerModule.setup(SWAGGER_DOCS_PATH, app, document, {
    customSiteTitle: 'HRMS API Documentation | Enterprise HRMS',
    customfavIcon: '',
    swaggerOptions: {
      persistAuthorization: true,
      displayOperationId: false,
      docExpansion: 'list',
      filter: true,
      showExtensions: true,
      tagsSorter: 'alpha', // Will be overridden by our organizer
      operationsSorter: 'alpha', // Will be overridden by our organizer
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 1,
    },
  });
}

export function setupOpenApiJson(
  app: INestApplication,
  document: OpenAPIObject,
): void {
  app.use(OPENAPI_JSON_PATH, (_req, res: Response) => {
    res.type('application/json').send(document);
  });
}
