import { BadRequestException } from '@nestjs/common';
import { CompaniesService } from './companies.service';

describe('CompaniesService timezone metadata validation', () => {
  const service = Object.create(CompaniesService.prototype) as {
    assertValidTimezoneMetadata(
      metadata?: Record<string, unknown> | null,
    ): void;
  };

  it('allows timezone omission while company configuration is incomplete', () => {
    expect(() => service.assertValidTimezoneMetadata(undefined)).not.toThrow();
    expect(() =>
      service.assertValidTimezoneMetadata({ timezone: null }),
    ).not.toThrow();
  });

  it('accepts valid IANA zones and rejects invalid values', () => {
    expect(() =>
      service.assertValidTimezoneMetadata({ timezone: 'Africa/Dar_es_Salaam' }),
    ).not.toThrow();
    expect(() =>
      service.assertValidTimezoneMetadata({ timezone: 'Not/A_Timezone' }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.assertValidTimezoneMetadata({ timezone: ' ' }),
    ).toThrow(BadRequestException);
  });
});

describe('employee-only membership permissions', () => {
  const service = Object.create(CompaniesService.prototype) as {
    getMembershipPermissions(membership: unknown): string[];
  };
  const membership = (roles: string[]) => ({
    role_assignments: roles.map((name) => ({
      role: {
        name,
        permissions: [{ name: 'data_scope:self' }, { name: 'users:update' }],
      },
    })),
    permission_assignments: [
      { permission: { name: 'data_scope:company' } },
      { permission: { name: 'leave_requests:create' } },
    ],
  });
  it('removes privileged role and direct grants from employee-only access', () => {
    expect(service.getMembershipPermissions(membership(['EMPLOYEE']))).toEqual(
      expect.arrayContaining(['data_scope:self', 'leave_requests:create']),
    );
    expect(
      service.getMembershipPermissions(membership(['EMPLOYEE'])),
    ).not.toContain('data_scope:company');
    expect(
      service.getMembershipPermissions(membership(['EMPLOYEE'])),
    ).not.toContain('users:update');
  });
  it('preserves grants for users with a separate HR role', () => {
    expect(
      service.getMembershipPermissions(membership(['EMPLOYEE', 'HR_MANAGER'])),
    ).toEqual(expect.arrayContaining(['data_scope:company', 'users:update']));
  });
});
