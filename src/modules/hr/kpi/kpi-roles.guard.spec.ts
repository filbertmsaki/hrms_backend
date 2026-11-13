import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { KpiRolesGuard } from './kpi-roles.guard';

describe('KPI role guard', () => {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) =>
      key === 'kpi_roles' ? ['COMPANY_ADMIN'] : ['kpi_assignments:create'],
    ),
  };
  const guard = new KpiRolesGuard(reflector as unknown as Reflector);
  function context(user?: {
    companyId?: number;
    roles: string[];
    permissions?: string[];
  }) {
    return {
      getHandler: () => null,
      getClass: () => null,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }
  it('allows an authorized company actor', () =>
    expect(
      guard.canActivate(context({ companyId: 7, roles: ['COMPANY_ADMIN'] })),
    ).toBe(true));
  it('accepts an explicit KPI permission on a custom role', () => {
    expect(
      guard.canActivate(
        context({
          companyId: 7,
          roles: ['TEST'],
          permissions: ['kpi_assignments:create'],
        }),
      ),
    ).toBe(true);
  });
  it('rejects a different role and missing tenant', () => {
    expect(() =>
      guard.canActivate(context({ companyId: 7, roles: ['EMPLOYEE'] })),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(context({ roles: ['COMPANY_ADMIN'] })),
    ).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context())).toThrow(ForbiddenException);
  });
});
