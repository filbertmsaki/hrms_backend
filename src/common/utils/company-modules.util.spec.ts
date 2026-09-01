import {
  assertCompanyModuleEnabled,
  createCompanyModuleDisabledPayload,
  mergeCompanyMetadata,
  normalizeCompanyMetadata,
  resolveCompanyModules,
} from './company-modules.util';

describe('company-modules.util', () => {
  it('defaults both modules to enabled when metadata is missing', () => {
    expect(resolveCompanyModules(undefined)).toEqual({
      roles: true,
      permissions: true,
    });

    expect(normalizeCompanyMetadata(undefined)).toEqual({
      modules: {
        roles: true,
        permissions: true,
      },
    });
  });

  it('uses legacy access_governance as the fallback for both flags', () => {
    expect(
      resolveCompanyModules({
        modules: {
          access_governance: false,
        },
      }),
    ).toEqual({
      roles: false,
      permissions: false,
    });
  });

  it('merges split module flags without dropping unrelated metadata', () => {
    expect(
      mergeCompanyMetadata(
        {
          region: 'Uganda',
          modules: {
            roles: true,
            permissions: true,
          },
        },
        {
          timezone: 'Africa/Kampala',
          modules: {
            permissions: false,
          },
        },
      ),
    ).toEqual({
      region: 'Uganda',
      timezone: 'Africa/Kampala',
      modules: {
        roles: true,
        permissions: false,
      },
    });
  });

  it('builds the disabled payload and throws it for a disabled company module', () => {
    expect(createCompanyModuleDisabledPayload('permissions')).toEqual({
      success: false,
      message: 'Permissions are not enabled for this company',
      code: 'COMPANY_MODULE_DISABLED',
      module: 'permissions',
    });

    expect(() =>
      assertCompanyModuleEnabled(
        { roles: true, permissions: false },
        'permissions',
      ),
    ).toThrow('Permissions are not enabled for this company');
  });
});
