process.env.DB_NAME = 'hrms_test_db';

let currentUser = {
  id: 7,
  email: 'admin@example.com',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 12,
  companyMembershipId: 44,
  roles: ['COMPANY_ADMIN'],
  permissions: ['users:enable-2fa', 'users:disable-2fa'],
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
jest.mock('otplib', () => ({
  generateSecret: jest.fn(),
  generateURI: jest.fn(),
  verify: jest.fn(),
}));
jest.mock('qrcode', () => ({
  toDataURL: jest.fn(),
}));
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { TenantGuard } from '../src/common/guards/tenant.guard';
import { TwoFaService } from '../src/modules/auth/2fa/2fa.service';
import { SecurityEventsService } from '../src/modules/security/security-events.service';
import { TwoFactorPolicyService } from '../src/modules/security/two-factor-policy.service';
import { UsersController } from '../src/modules/users/users.controller';
import { UsersService } from '../src/modules/users/users.service';

describe('User Admin 2FA Endpoints (e2e)', () => {
  let app: INestApplication;
  let twoFaService: {
    adminEnable2FA: jest.Mock;
    adminDisable2FA: jest.Mock;
  };

  beforeEach(async () => {
    currentUser = {
      id: 7,
      email: 'admin@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 12,
      companyMembershipId: 44,
      roles: ['COMPANY_ADMIN'],
      permissions: ['users:enable-2fa', 'users:disable-2fa'],
    };

    twoFaService = {
      adminEnable2FA: jest.fn().mockResolvedValue({
        success: true,
        message:
          'Two-factor authentication has been enabled for the user. The user must complete 2FA setup during the next login.',
        data: {
          userId: 15,
          twoFactorEnabled: true,
          twoFactorSetupRequired: true,
        },
      }),
      adminDisable2FA: jest.fn().mockResolvedValue({
        success: true,
        message: 'Two-factor authentication has been disabled for the user.',
        data: {
          userId: 15,
          twoFactorEnabled: false,
          twoFactorSetupRequired: false,
        },
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: {} },
        { provide: TwoFaService, useValue: twoFaService },
        {
          provide: SecurityEventsService,
          useValue: { logBestEffort: jest.fn() },
        },
        {
          provide: TwoFactorPolicyService,
          useValue: { assertCanDisable: jest.fn() },
        },
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
    if (app) {
      await app.close();
    }
  });

  it('enables user 2FA through HTTP for authorized administrators', async () => {
    const response = await request(app.getHttpServer() as App)
      .patch('/users/15/two-factor/enable')
      .expect(200);
    const body = response.body as {
      data: {
        userId: number;
        twoFactorEnabled: boolean;
        twoFactorSetupRequired: boolean;
      };
    };

    const firstCall = twoFaService.adminEnable2FA.mock.calls[0] as unknown as [
      number,
      number,
      { id: number },
      { ipAddress: string | null; userAgent: string | null },
    ];

    expect(firstCall[0]).toBe(12);
    expect(firstCall[1]).toBe(15);
    expect(firstCall[2].id).toBe(7);
    expect(typeof firstCall[3].ipAddress).toBe('string');
    expect(body.data).toEqual({
      userId: 15,
      twoFactorEnabled: true,
      twoFactorSetupRequired: true,
    });
  });

  it('rejects unauthorized administrators who lack the disable permission', async () => {
    currentUser.permissions = [];

    await request(app.getHttpServer() as App)
      .patch('/users/15/two-factor/disable')
      .send({ reason: 'Lost device' })
      .expect(403);

    expect(twoFaService.adminDisable2FA).not.toHaveBeenCalled();
  });

  it('validates the disable request payload', async () => {
    currentUser.permissions = ['users:disable-2fa'];

    await request(app.getHttpServer() as App)
      .patch('/users/15/two-factor/disable')
      .send({ reason: 12345 })
      .expect(400);

    expect(twoFaService.adminDisable2FA).not.toHaveBeenCalled();
  });
});
