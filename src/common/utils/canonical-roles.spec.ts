import {
  effectivePermissions,
  hasPermission,
  permissionKeyPattern,
} from './permission.util';
import {
  assertCanDelegatePermissions,
  platformAccess,
} from './permission-scope.util';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import type { User } from '../../modules/users/entities/user.entity';
import { COMPANY_ROLE_SEEDS } from '../../database/seeds/005-company-roles.seed';
import { PLATFORM_ROLE_SEEDS } from '../../database/seeds/002-global-roles.seed';
import {
  PERMISSION_SEEDS,
  resolvePermissionScope,
} from '../../database/seeds/001-permissions.seed';
import { PermissionScope } from '../../modules/permissions/enums/permission-scope.enum';

const catalogue = new Set(PERMISSION_SEEDS.map((item) => item.name));

describe('canonical role policies', () => {
  it.each(COMPANY_ROLE_SEEDS)(
    'keeps the $name company template inside the company catalogue',
    (role) => {
      expect(
        role.permissionNames.every(
          (key) =>
            catalogue.has(key) &&
            permissionKeyPattern.test(key) &&
            resolvePermissionScope(key) !== PermissionScope.PLATFORM,
        ),
      ).toBe(true);
    },
  );
  it.each(PLATFORM_ROLE_SEEDS)(
    'resolves the $name platform profile from platform and shared grants',
    (role) => {
      const permissions = role.permissionNames.map((name) => ({
        name,
        scope: resolvePermissionScope(name),
      }));
      const account = {
        roles: [
          { name: role.name, company_id: null, permissions },
          { name: 'FOREIGN', company_id: 29, permissions },
        ],
        permissions: [
          { name: 'employees:delete', scope: PermissionScope.COMPANY },
        ],
      } as unknown as User;
      expect(platformAccess(account)).toEqual({
        roles: [role.name],
        permissions: effectivePermissions(role.permissionNames),
      });
    },
  );
  it('preserves directional operations and refuses wider and cross-company delegation', () => {
    expect(
      hasPermission(['leave_balances:read'], 'leave_balances:manage'),
    ).toBe(false);
    expect(
      hasPermission(
        ['leave_balances:adjust-manually'],
        'leave_balances:adjust',
      ),
    ).toBe(false);
    expect(
      hasPermission(
        ['leave_balances:adjust'],
        'leave_balances:adjust-manually',
      ),
    ).toBe(true);
    const actor: AuthenticatedUser = {
      id: 1,
      email: 'admin@example.test',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 2,
      companyMembershipId: 4,
      roles: ['SUPER_ADMIN'],
      permissions: ['users:read', 'data_scope:department'],
    };
    expect(() =>
      assertCanDelegatePermissions(actor, [{ name: 'users:read' }], 2),
    ).not.toThrow();
    expect(() =>
      assertCanDelegatePermissions(actor, [{ name: 'users:read' }], 3),
    ).toThrow();
    expect(() =>
      assertCanDelegatePermissions(actor, [{ name: 'data_scope:company' }], 2),
    ).toThrow();
    expect(() =>
      assertCanDelegatePermissions(actor, [{ name: 'users:update' }], 2),
    ).toThrow();
  });
});
