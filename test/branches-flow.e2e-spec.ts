process.env.DB_NAME = process.env.DB_NAME ?? 'hrms_test_db';

type TestUser = {
  id: number;
  email: string;
  scope: 'company';
  userType: 'COMPANY_USER';
  companyId: number;
  companyMembershipId: number;
  employeeId?: number | null;
  roles: string[];
  permissions: string[];
};

let currentUser: TestUser = {
  id: 32,
  email: 'hr-branches@example.com',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 10,
  companyMembershipId: 231,
  employeeId: 701,
  roles: ['HR'],
  permissions: [],
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

import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { TenantGuard } from '../src/common/guards/tenant.guard';
import { SecurityEventsService } from '../src/modules/security/security-events.service';
import { BranchesController } from '../src/modules/hr/branches/branches.controller';
import { BranchesService } from '../src/modules/hr/branches/branches.service';

describe('Branch endpoints (e2e)', () => {
  let app: INestApplication;
  let branchesService: Record<string, jest.Mock>;
  let securityEventsService: { logBestEffort: jest.Mock };

  beforeEach(async () => {
    currentUser = {
      id: 32,
      email: 'hr-branches@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 10,
      companyMembershipId: 231,
      employeeId: 701,
      roles: ['HR'],
      permissions: [],
    };
    branchesService = {
      create: jest.fn().mockResolvedValue({ id: 11, name: 'HQ' }),
      findAll: jest.fn().mockResolvedValue([{ id: 11 }]),
      findOne: jest.fn().mockResolvedValue({ id: 11 }),
      update: jest.fn().mockResolvedValue({ id: 11, city: 'Dar es Salaam' }),
      remove: jest.fn().mockResolvedValue(undefined),
      listAccessAssignments: jest.fn().mockResolvedValue([{ user_id: 41 }]),
      grantAccess: jest.fn().mockResolvedValue({ user_id: 41 }),
      revokeAccess: jest.fn().mockResolvedValue(undefined),
    };
    securityEventsService = {
      logBestEffort: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [BranchesController],
      providers: [
        { provide: BranchesService, useValue: branchesService },
        { provide: SecurityEventsService, useValue: securityEventsService },
        PermissionsGuard,
        TenantGuard,
        Reflector,
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
    await app.close();
  });

  it('protects branch creation behind branch create permission', async () => {
    await request(app.getHttpServer() as App)
      .post('/branches')
      .send({ name: 'HQ', code: 'HQ' })
      .expect(403);

    expect(branchesService.create).not.toHaveBeenCalled();
    expect(securityEventsService.logBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Required permission check failed',
        metadata: expect.objectContaining({
          required_permissions: ['branches:create'],
        }),
      }),
    );
  });

  it('routes branch CRUD and access management through tenant-scoped service calls', async () => {
    currentUser = {
      ...currentUser,
      permissions: [
        'branches:create',
        'branches:read',
        'branches:update',
        'branches:delete',
        'branches:manage-access',
      ],
    };

    await request(app.getHttpServer() as App)
      .post('/branches')
      .send({
        name: 'HQ',
        code: 'HQ',
        country: 'TZ',
        city: 'Dar es Salaam',
        status: 'active',
      })
      .expect(201);
    expect(branchesService.create).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ code: 'HQ' }),
    );

    await request(app.getHttpServer() as App)
      .get('/branches?status=active')
      .expect(200);
    expect(branchesService.findAll).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ status: 'active' }),
      expect.objectContaining({ companyMembershipId: 231 }),
    );

    await request(app.getHttpServer() as App).get('/branches/11').expect(200);
    expect(branchesService.findOne).toHaveBeenCalledWith(
      10,
      11,
      expect.objectContaining({ companyMembershipId: 231 }),
    );

    await request(app.getHttpServer() as App)
      .patch('/branches/11')
      .send({ city: 'Dar es Salaam' })
      .expect(200);
    expect(branchesService.update).toHaveBeenCalledWith(
      10,
      11,
      expect.objectContaining({ city: 'Dar es Salaam' }),
      expect.objectContaining({ companyMembershipId: 231 }),
    );

    await request(app.getHttpServer() as App)
      .get('/branches/11/access')
      .expect(200);
    expect(branchesService.listAccessAssignments).toHaveBeenCalledWith(10, 11);

    await request(app.getHttpServer() as App)
      .post('/branches/11/access/41')
      .expect(201);
    expect(branchesService.grantAccess).toHaveBeenCalledWith(
      10,
      11,
      41,
      expect.objectContaining({ companyMembershipId: 231 }),
      expect.objectContaining({ ipAddress: expect.any(String) }),
    );

    await request(app.getHttpServer() as App)
      .delete('/branches/11/access/41')
      .expect(200);
    expect(branchesService.revokeAccess).toHaveBeenCalledWith(
      10,
      11,
      41,
      expect.objectContaining({ companyMembershipId: 231 }),
      expect.objectContaining({ ipAddress: expect.any(String) }),
    );

    await request(app.getHttpServer() as App)
      .delete('/branches/11')
      .expect(200);
    expect(branchesService.remove).toHaveBeenCalledWith(
      10,
      11,
      expect.objectContaining({ companyMembershipId: 231 }),
    );
  });
});
