process.env.DB_NAME = 'hrms_test_db';

let currentUser = {
  id: 18,
  email: 'employee@example.com',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 9,
  companyMembershipId: 77,
  roles: ['EMPLOYEE'],
  permissions: ['employees:read', 'users:delete'],
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
import {
  Controller,
  Delete,
  Get,
  INestApplication,
  Param,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Permissions } from '../src/common/decorators/permissions.decorator';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { SecurityEventType } from '../src/modules/security/enums/security-event-type.enum';
import { SecurityEventsService } from '../src/modules/security/security-events.service';

@Controller()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
class AuthorizationTestController {
  @Get('employees/me')
  @Permissions('employees:read')
  getOwnEmployee() {
    return { ok: true };
  }

  @Delete('users/:id')
  @Permissions('users:delete')
  removeUser(@Param('id') id: string) {
    return { id: Number(id), removed: true };
  }
}

describe('Authorization (e2e)', () => {
  let app: INestApplication;
  let securityEventsService: {
    logBestEffort: jest.Mock;
  };

  beforeEach(async () => {
    currentUser = {
      id: 18,
      email: 'employee@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 9,
      companyMembershipId: 77,
      roles: ['EMPLOYEE'],
      permissions: ['employees:read', 'users:delete'],
    };

    securityEventsService = {
      logBestEffort: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuthorizationTestController],
      providers: [
        PermissionsGuard,
        Reflector,
        {
          provide: SecurityEventsService,
          useValue: securityEventsService,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('allows an authorized request and revokes access on the next request after permission removal', async () => {
    await request(app.getHttpServer() as App)
      .delete('/users/42')
      .expect(200);

    currentUser.permissions = [];

    await request(app.getHttpServer() as App)
      .delete('/users/42')
      .expect(403);

    expect(securityEventsService.logBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: SecurityEventType.ACCESS_DENIED,
        actor: expect.objectContaining({
          id: 18,
          companyId: 9,
        }),
      }),
    );
  });

  it('allows access when the required permission is present', async () => {
    await request(app.getHttpServer() as App)
      .get('/employees/me')
      .expect(200);

    expect(securityEventsService.logBestEffort).not.toHaveBeenCalled();
  });
});
