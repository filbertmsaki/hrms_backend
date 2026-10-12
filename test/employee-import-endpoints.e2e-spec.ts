process.env.DB_NAME = process.env.DB_NAME ?? 'hrms_test_db';

let currentUser = {
  id: 9,
  email: 'hr@example.com',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 10,
  companyMembershipId: 33,
  roles: ['HR'],
  permissions: [
    'employees.import.history.view',
    'employees.import.result.download',
  ],
};

jest.mock('@nestjs/passport', () => ({
  AuthGuard: () =>
    class MockJwtAuthGuard {
      canActivate(context: {
        switchToHttp: () => { getRequest: () => Record<string, unknown> };
      }) {
        const request = context.switchToHttp().getRequest();
        request.user = currentUser;
        return true;
      }
    },
}));
jest.mock('digest-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { IncomingMessage } from 'http';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { TenantGuard } from '../src/common/guards/tenant.guard';
import { EmployeesController } from '../src/modules/hr/employees/employees.controller';
import { EmployeeImportService } from '../src/modules/hr/employees/import/employee-import.service';
import { EmployeePermanentDeletionService } from '../src/modules/hr/employees/employee-permanent-deletion.service';
import { EmployeesService } from '../src/modules/hr/employees/employees.service';
import { EmployeeAssignmentService } from '../src/modules/hr/employees/employee-assignment.service';
import { SecurityEventsService } from '../src/modules/security/security-events.service';

describe('Employee Import Endpoints (e2e)', () => {
  let app: INestApplication;
  let employeeImportService: {
    getPreview: jest.Mock;
    getResult: jest.Mock;
    downloadResult: jest.Mock;
  };

  function readBinaryResponse(
    res: IncomingMessage,
    callback: (error: Error | null, body: Buffer) => void,
  ) {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer | string | Uint8Array) => {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
        return;
      }
      if (typeof chunk === 'string') {
        chunks.push(Buffer.from(chunk));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    res.on('end', () => callback(null, Buffer.concat(chunks)));
  }

  beforeEach(async () => {
    currentUser = {
      id: 9,
      email: 'hr@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 10,
      companyMembershipId: 33,
      roles: ['HR'],
      permissions: [
        'employees.import.history.view',
        'employees.import.result.download',
      ],
    };

    employeeImportService = {
      getPreview: jest.fn().mockResolvedValue({
        batchId: 'IMPORT-20260730-PREVIEW',
        previewToken: 'preview-token',
        status: 'PREVIEW_READY',
        importMode: 'CREATE_OR_UPDATE',
        totalRows: 2,
        validRows: 1,
        invalidRows: 1,
        duplicateRows: 0,
        rowsReadyForImport: 1,
        process_valid_rows_only: true,
        summary: {
          readyForImport: 1,
          invalidRecords: 1,
        },
        rows: [
          {
            rowId: 101,
            rowNumber: 2,
            identifier: 'Jane Doe',
            employeeNumber: 'EMP-0001',
            status: 'READY_FOR_IMPORT',
          },
        ],
      }),
      getResult: jest.fn().mockResolvedValue({
        batchId: 'IMPORT-20260730-RESULT',
        status: 'COMPLETED_WITH_ERRORS',
        summary: {
          selectedForImport: 1,
          successfullyImported: 1,
        },
        rows: [
          {
            rowId: 201,
            rowNumber: 2,
            status: 'IMPORTED',
          },
        ],
      }),
      downloadResult: jest.fn().mockResolvedValue({
        buffer: Buffer.from('fake-xlsx-binary'),
        fileName: 'employee-import-result-20260730-101500.xlsx',
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [EmployeesController],
      providers: [
        { provide: EmployeesService, useValue: {} },
        { provide: EmployeeAssignmentService, useValue: {} },
        { provide: EmployeeImportService, useValue: employeeImportService },
        { provide: EmployeePermanentDeletionService, useValue: {} },
        PermissionsGuard,
        TenantGuard,
        Reflector,
        {
          provide: SecurityEventsService,
          useValue: { logBestEffort: jest.fn() },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns the stored preview for an import batch', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/employees/import/IMPORT-20260730-PREVIEW/preview')
      .expect(200);

    expect(employeeImportService.getPreview).toHaveBeenCalledWith(
      10,
      'IMPORT-20260730-PREVIEW',
    );
    expect(response.body).toEqual(
      expect.objectContaining({
        batchId: 'IMPORT-20260730-PREVIEW',
        previewToken: 'preview-token',
        process_valid_rows_only: true,
      }),
    );
  });

  it('returns the JSON result summary for an import batch', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/employees/import/IMPORT-20260730-RESULT/result')
      .expect(200);
    const body = response.body as {
      batchId: string;
      summary: {
        successfullyImported: number;
      };
    };

    expect(employeeImportService.getResult).toHaveBeenCalledWith(
      10,
      'IMPORT-20260730-RESULT',
    );
    expect(body.batchId).toBe('IMPORT-20260730-RESULT');
    expect(body.summary.successfullyImported).toBe(1);
  });

  it('downloads the Excel error report for an import batch', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/employees/import/IMPORT-20260730-RESULT/errors/download')
      .buffer(true)
      .parse(readBinaryResponse)
      .expect(200);

    expect(employeeImportService.downloadResult).toHaveBeenCalledWith(
      10,
      'IMPORT-20260730-RESULT',
    );
    expect(response.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.headers['content-disposition']).toContain(
      'attachment; filename=employee-import-result-20260730-101500.xlsx',
    );
    expect(Buffer.isBuffer(response.body)).toBe(true);
    if (!Buffer.isBuffer(response.body)) {
      throw new Error('Expected binary response body');
    }
    expect(response.body.equals(Buffer.from('fake-xlsx-binary'))).toBe(true);
  });

  it('blocks access when the actor lacks preview history permission', async () => {
    currentUser.permissions = ['employees.import.result.download'];

    await request(app.getHttpServer() as App)
      .get('/employees/import/IMPORT-20260730-PREVIEW/preview')
      .expect(403);

    expect(employeeImportService.getPreview).not.toHaveBeenCalled();
  });
});
