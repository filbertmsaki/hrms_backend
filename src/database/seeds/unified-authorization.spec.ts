import { PERMISSION_SEEDS } from './001-permissions.seed';
import { PLATFORM_ROLE_SEEDS } from './002-global-roles.seed';
import { COMPANY_ROLE_SEEDS } from './005-company-roles.seed';

describe('authorization seed catalog', () => {
  it('defines every permission used by the seeded roles', () => {
    const names = new Set(
      PERMISSION_SEEDS.map((permission) => permission.name),
    );
    const missing = [...PLATFORM_ROLE_SEEDS, ...COMPANY_ROLE_SEEDS].flatMap(
      (role) =>
        role.permissionNames
          .filter((name) => !names.has(name))
          .map((name) => `${role.name}: ${name}`),
    );
    expect(missing).toEqual([]);
  });
});
