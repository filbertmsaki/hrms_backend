process.env.DB_NAME = 'hrms_test_db';

let currentUser = {
  id: 9,
  email: 'staff@example.com',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 7,
  companyMembershipId: 11,
  roles: ['USER'],
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
import { UsersController } from '../src/modules/users/users.controller';
import { SecurityEventsService } from '../src/modules/security/security-events.service';
import { TwoFactorPolicyService } from '../src/modules/security/two-factor-policy.service';
import { UsersService } from '../src/modules/users/users.service';

describe('User Avatar Endpoints (e2e)', () => {
  let app: INestApplication;
  let usersService: {
    listMyAvailableAvatars: jest.Mock;
    updateMySelectedAvatar: jest.Mock;
    clearMySelectedAvatar: jest.Mock;
    updateUserSelectedAvatar: jest.Mock;
    clearUserSelectedAvatar: jest.Mock;
  };

  beforeEach(async () => {
    currentUser = {
      id: 9,
      email: 'staff@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 7,
      companyMembershipId: 11,
      roles: ['USER'],
      permissions: [],
    };

    usersService = {
      listMyAvailableAvatars: jest.fn().mockResolvedValue([{ id: 8 }]),
      updateMySelectedAvatar: jest.fn().mockResolvedValue({ id: 9 }),
      clearMySelectedAvatar: jest.fn().mockResolvedValue({ id: 9 }),
      updateUserSelectedAvatar: jest.fn().mockResolvedValue({ id: 15 }),
      clearUserSelectedAvatar: jest.fn().mockResolvedValue({ id: 15 }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: TwoFaService, useValue: {} },
        { provide: TwoFactorPolicyService, useValue: {} },
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

  it('lists the current user available avatars through the self-service endpoint', async () => {
    await request(app.getHttpServer() as App)
      .get('/users/me/available-avatars')
      .expect(200);

    expect(usersService.listMyAvailableAvatars).toHaveBeenCalledWith(7, 9);
  });

  it('lets a user select an avatar for themselves', async () => {
    await request(app.getHttpServer() as App)
      .patch('/users/me/avatar')
      .send({ avatar_id: 8 })
      .expect(200);

    expect(usersService.updateMySelectedAvatar).toHaveBeenCalledWith(7, 9, 8);
  });

  it('lets a user remove their selected avatar', async () => {
    await request(app.getHttpServer() as App)
      .delete('/users/me/avatar')
      .expect(200);

    expect(usersService.clearMySelectedAvatar).toHaveBeenCalledWith(7, 9);
  });

  it('prevents a normal user from changing another user avatar', async () => {
    await request(app.getHttpServer() as App)
      .patch('/users/15/avatar')
      .send({ avatar_id: 8 })
      .expect(403);

    expect(usersService.updateUserSelectedAvatar).not.toHaveBeenCalled();
  });

  it('allows an authorized administrator to change another user avatar', async () => {
    currentUser.permissions = ['users:update'];

    await request(app.getHttpServer() as App)
      .patch('/users/15/avatar')
      .send({ avatar_id: 8 })
      .expect(200);

    expect(usersService.updateUserSelectedAvatar).toHaveBeenCalledWith(
      7,
      15,
      8,
    );
  });
});
