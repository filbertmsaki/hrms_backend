import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  const buildExecutionContext = (user?: {
    permissions: string[];
  }): ExecutionContext =>
    ({
      getClass: jest.fn(),
      getHandler: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          url: '/test',
          originalUrl: '/test',
          user,
        }),
      }),
    }) as unknown as ExecutionContext;

  it('allows employee portal requests when the employee has the required permission', async () => {
    const reflector = {
      getAllAndMerge: jest.fn().mockImplementation((key: string) => {
        if (key === PERMISSIONS_KEY) {
          return ['leave_requests:create'];
        }
        return [];
      }),
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const securityEventsService = {
      logBestEffort: jest.fn(),
    };
    const guard = new PermissionsGuard(
      reflector,
      securityEventsService as never,
    );

    await expect(
      guard.canActivate(
        buildExecutionContext({
          permissions: ['data_scope:self', 'leave_requests:create'],
        }),
      ),
    ).resolves.toBe(true);
  });

  it('denies employee portal users from modules outside their assigned permissions', async () => {
    const reflector = {
      getAllAndMerge: jest.fn().mockImplementation((key: string) => {
        if (key === PERMISSIONS_KEY) {
          return ['users:read'];
        }
        return [];
      }),
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const securityEventsService = {
      logBestEffort: jest.fn(),
    };
    const guard = new PermissionsGuard(
      reflector,
      securityEventsService as never,
    );

    await expect(
      guard.canActivate(
        buildExecutionContext({
          permissions: ['data_scope:self', 'leave_requests:create'],
        }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('blocks employee-only users from management routes despite legacy read permission', async () => {
    const reflector = {
      getAllAndMerge: jest.fn().mockReturnValue(['employees:read']),
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector, {
      logBestEffort: jest.fn(),
    } as never);
    const context = (path: string, roles: string[]) =>
      ({
        getClass: jest.fn(),
        getHandler: jest.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'GET',
            originalUrl: path,
            user: { scope: 'company', roles, permissions: ['employees:read'] },
          }),
        }),
      }) as unknown as ExecutionContext;
    await expect(
      guard.canActivate(context('/api/employees/123', ['EMPLOYEE'])),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      guard.canActivate(
        context('/api/attendance/daily-summaries', ['EMPLOYEE']),
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      guard.canActivate(context('/api/users/5/reset-password', ['EMPLOYEE'])),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      guard.canActivate(
        context('/api/offboarding/notice-policies', ['EMPLOYEE']),
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      guard.canActivate(context('/api/me/profile', ['EMPLOYEE'])),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        context('/api/employees/123', ['EMPLOYEE', 'HR_MANAGER']),
      ),
    ).resolves.toBe(true);
  });

  it('requires authentication before running permission checks', async () => {
    const reflector = {
      getAllAndMerge: jest.fn().mockImplementation((key: string) => {
        if (key === PERMISSIONS_KEY) {
          return ['leave_requests:create'];
        }
        return [];
      }),
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const securityEventsService = {
      logBestEffort: jest.fn(),
    };
    const guard = new PermissionsGuard(
      reflector,
      securityEventsService as never,
    );

    await expect(guard.canActivate(buildExecutionContext())).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
