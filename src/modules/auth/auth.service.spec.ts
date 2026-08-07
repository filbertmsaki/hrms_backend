import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
jest.mock('otplib', () => ({
  generateSecret: jest.fn(),
  generateURI: jest.fn(),
  verify: jest.fn(),
}));
jest.mock('qrcode', () => ({
  toDataURL: jest.fn(),
}));
import { AuthService } from './auth.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { TwoFaService } from './2fa/2fa.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { CompaniesService } from '../companies/companies.service';
import { SecurityEventsService } from '../security/security-events.service';
import { TwoFactorPolicyService } from '../security/two-factor-policy.service';
import { SmsNotificationManagementService } from '../sms/sms-notification-management.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    findById: jest.Mock;
    updateLastLogin: jest.Mock;
    hasPendingImportedPasswordChange: jest.Mock;
  };
  let jwtService: {
    sign: jest.Mock;
    decode: jest.Mock;
    verify: jest.Mock;
  };
  let companiesService: {
    listUserCompanies: jest.Mock;
    setActiveMembership: jest.Mock;
  };
  let twoFaService: {
    getTwoFactorStatus: jest.Mock;
    verify2FALogin: jest.Mock;
  };
  let securityEventsService: { logBestEffort: jest.Mock };
  let twoFactorPolicyService: { isRequired: jest.Mock };
  let smsNotificationManagementService: {
    sendConfiguredNotification: jest.Mock;
  };

  beforeEach(() => {
    usersService = {
      findById: jest.fn(),
      updateLastLogin: jest.fn(),
      hasPendingImportedPasswordChange: jest.fn().mockResolvedValue(false),
    };
    jwtService = {
      sign: jest
        .fn()
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token')
        .mockReturnValue('temp-token'),
      decode: jest.fn().mockReturnValue({
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
      verify: jest.fn(),
    };
    companiesService = {
      listUserCompanies: jest.fn(),
      setActiveMembership: jest.fn(),
    };
    twoFaService = {
      getTwoFactorStatus: jest.fn(),
      verify2FALogin: jest.fn(),
    };
    securityEventsService = {
      logBestEffort: jest.fn(),
    };
    twoFactorPolicyService = {
      isRequired: jest.fn().mockReturnValue(false),
    };
    smsNotificationManagementService = {
      sendConfiguredNotification: jest.fn(),
    };

    service = new AuthService(
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
      {
        get: jest.fn((key: string) => {
          switch (key) {
            case 'ENABLE_EMAIL_VERIFICATION':
              return true;
            case 'JWT_ACCESS_EXPIRATION':
              return '15m';
            case 'JWT_REFRESH_EXPIRATION':
              return '7d';
            case 'JWT_ISSUER':
              return 'hrms';
            case 'JWT_AUDIENCE':
              return 'hrms-client';
            default:
              return undefined;
          }
        }),
        getOrThrow: jest.fn(() => 'secret'),
      } as unknown as ConfigService,
      {
        addToBlacklist: jest.fn(),
        isBlacklisted: jest.fn().mockResolvedValue(false),
      } as unknown as TokenBlacklistService,
      {} as MailService,
      twoFaService as unknown as TwoFaService,
      companiesService as unknown as CompaniesService,
      securityEventsService as unknown as SecurityEventsService,
      twoFactorPolicyService as unknown as TwoFactorPolicyService,
      smsNotificationManagementService as unknown as SmsNotificationManagementService,
    );
  });

  it('returns a setup-required login response when 2FA was enabled by an administrator', async () => {
    jest.spyOn(service, 'validateUser').mockResolvedValue({
      id: 9,
      email: 'staff@example.com',
      first_name: 'Amina',
      last_name: 'Moshi',
      status: 'active',
      user_type: 'COMPANY_USER',
      is_email_verified: true,
      is_two_factor_enabled: true,
      two_factor_setup_required: true,
    } as never);

    companiesService.listUserCompanies.mockResolvedValue([
      {
        companyId: 12,
        companyName: 'Acme HR',
        companySlug: 'acme-hr',
        membershipId: 44,
        employeeId: 81,
        employeeNo: 'EMP-0081',
        isDefault: true,
        roles: ['COMPANY_ADMIN'],
        permissions: ['users:manage-2fa'],
      },
    ]);
    companiesService.setActiveMembership.mockResolvedValue({
      companyId: 12,
      companyName: 'Acme HR',
      companySlug: 'acme-hr',
      membershipId: 44,
      employeeId: 81,
      employeeNo: 'EMP-0081',
      isDefault: true,
      roles: ['COMPANY_ADMIN'],
      permissions: ['users:manage-2fa'],
      status: 'active',
    });
    twoFaService.getTwoFactorStatus.mockResolvedValue({
      enabled: true,
      setupRequired: true,
      fullyConfigured: false,
    });

    const rawResult: unknown = await service.login(
      { email: 'staff@example.com', password: 'P@ssw0rd#2026' },
      { ipAddress: '197.250.10.22', userAgent: null, requestId: null },
    );
    const result = rawResult as {
      requires2FASetup: boolean;
      message: string;
      access_token: string;
      refresh_token: string;
      user: {
        id: number;
        isTwoFactorEnabled: boolean;
        twoFactorSetupRequired: boolean;
      };
    };

    expect(usersService.updateLastLogin).toHaveBeenCalledWith(
      9,
      expect.any(Date),
      '197.250.10.22',
    );
    expect(result.requires2FASetup).toBe(true);
    expect((result as { dashboard_type?: string }).dashboard_type).toBe(
      'employee',
    );
    expect(result.message).toBe(
      'Two-factor authentication has been enabled for your account. Complete setup now before continuing.',
    );
    expect(result.access_token).toBe('access-token');
    expect(result.refresh_token).toBe('refresh-token');
    expect(result.user).toEqual({
      id: 9,
      email: 'staff@example.com',
      first_name: 'Amina',
      last_name: 'Moshi',
      user_type: 'COMPANY_USER',
      employee_id: 81,
      employee_no: 'EMP-0081',
      my_employee_url: '/employees/me',
      dashboard_type: 'employee',
      roles: ['COMPANY_ADMIN'],
      permissions: ['users:manage-2fa'],
      requiresPasswordChange: false,
      isTwoFactorEnabled: true,
      twoFactorSetupRequired: true,
    });
  });

  it('returns a password-change-required login response for imported employee accounts', async () => {
    jest.spyOn(service, 'validateUser').mockResolvedValue({
      id: 9,
      email: 'staff@example.com',
      first_name: 'Amina',
      last_name: 'Moshi',
      status: 'active',
      user_type: 'COMPANY_USER',
      is_email_verified: true,
      is_two_factor_enabled: false,
      two_factor_setup_required: false,
    } as never);

    companiesService.listUserCompanies.mockResolvedValue([
      {
        companyId: 12,
        companyName: 'Acme HR',
        companySlug: 'acme-hr',
        membershipId: 44,
        employeeId: 81,
        employeeNo: 'EMP-0081',
        isDefault: true,
        roles: ['EMPLOYEE'],
        permissions: [],
      },
    ]);
    companiesService.setActiveMembership.mockResolvedValue({
      companyId: 12,
      companyName: 'Acme HR',
      companySlug: 'acme-hr',
      membershipId: 44,
      employeeId: 81,
      employeeNo: 'EMP-0081',
      isDefault: true,
      roles: ['EMPLOYEE'],
      permissions: [],
      status: 'active',
    });
    twoFaService.getTwoFactorStatus.mockResolvedValue({
      enabled: false,
      setupRequired: false,
      fullyConfigured: false,
    });
    usersService.hasPendingImportedPasswordChange.mockResolvedValue(true);

    const rawResult: unknown = await service.login(
      { email: 'staff@example.com', password: 'ChangeMe@123' },
      { ipAddress: '197.250.10.22', userAgent: null, requestId: null },
    );
    const result = rawResult as {
      requiresPasswordChange: boolean;
      access_token: string;
      refresh_token: string;
      message: string;
      user: {
        requiresPasswordChange: boolean;
      };
    };

    expect(result.requiresPasswordChange).toBe(true);
    expect(result.message).toBe(
      'You must change your temporary password before continuing.',
    );
    expect(result.user.requiresPasswordChange).toBe(true);
    expect(result.access_token).toBe('access-token');
    expect(result.refresh_token).toBe('refresh-token');
  });

  it('returns a temporary token when the user has fully configured 2FA', async () => {
    jest.spyOn(service, 'validateUser').mockResolvedValue({
      id: 9,
      email: 'staff@example.com',
      first_name: 'Amina',
      last_name: 'Moshi',
      status: 'active',
      user_type: 'COMPANY_USER',
      is_email_verified: true,
      is_two_factor_enabled: true,
      two_factor_setup_required: false,
    } as never);

    companiesService.listUserCompanies.mockResolvedValue([
      {
        companyId: 12,
        companyName: 'Acme HR',
        companySlug: 'acme-hr',
        membershipId: 44,
        employeeId: 81,
        employeeNo: 'EMP-0081',
        isDefault: true,
        roles: ['COMPANY_ADMIN'],
        permissions: ['users:manage-2fa'],
      },
    ]);
    twoFaService.getTwoFactorStatus.mockResolvedValue({
      enabled: true,
      setupRequired: false,
      fullyConfigured: true,
    });
    jwtService.sign.mockReturnValue('temp-token');

    const rawResult: unknown = await service.login(
      { email: 'staff@example.com', password: 'P@ssw0rd#2026' },
      { ipAddress: '197.250.10.22', userAgent: null, requestId: null },
    );
    const result = rawResult as {
      requires2FA: boolean;
      tempToken: string;
      company: {
        companyId: number;
        companyName: string;
        companySlug: string;
        membershipId: number;
        employeeId: number;
        employeeNo: string;
        isDefault: boolean;
        roles: string[];
        permissions: string[];
      };
      companies: Array<{
        companyId: number;
        companyName: string;
        companySlug: string;
        membershipId: number;
        employeeId: number;
        employeeNo: string;
        isDefault: boolean;
        roles: string[];
        permissions: string[];
      }>;
      message: string;
    };

    expect(result).toEqual({
      requires2FA: true,
      tempToken: 'access-token',
      company: {
        companyId: 12,
        companyName: 'Acme HR',
        companySlug: 'acme-hr',
        membershipId: 44,
        employeeId: 81,
        employeeNo: 'EMP-0081',
        isDefault: true,
        roles: ['COMPANY_ADMIN'],
        permissions: ['users:manage-2fa'],
      },
      companies: [
        {
          companyId: 12,
          companyName: 'Acme HR',
          companySlug: 'acme-hr',
          membershipId: 44,
          employeeId: 81,
          employeeNo: 'EMP-0081',
          isDefault: true,
          roles: ['COMPANY_ADMIN'],
          permissions: ['users:manage-2fa'],
        },
      ],
      message: 'Password verified. Please provide your 2FA code.',
    });
    expect(usersService.updateLastLogin).not.toHaveBeenCalled();
    expect(companiesService.setActiveMembership).not.toHaveBeenCalled();
  });

  it('rejects a revoked temporary 2FA login token before code verification', async () => {
    jwtService.verify.mockReturnValue({
      sub: 9,
      email: 'staff@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 12,
      temp: true,
      type: '2fa-temp',
      iat: Math.floor(new Date('2026-07-28T07:00:00Z').getTime() / 1000),
    });
    usersService.findById.mockResolvedValue({
      id: 9,
      email: 'staff@example.com',
      first_name: 'Amina',
      last_name: 'Moshi',
      status: 'active',
      user_type: 'COMPANY_USER',
      is_two_factor_enabled: true,
      two_factor_setup_required: false,
      auth_token_invalid_before: new Date('2026-07-28T08:00:00Z'),
    });

    await expect(
      service.complete2FALogin('temp-token', '123456', '197.250.10.22'),
    ).rejects.toThrow(
      new UnauthorizedException(
        'The 2FA login step is no longer valid. Please log in again.',
      ),
    );

    expect(twoFaService.verify2FALogin).not.toHaveBeenCalled();
  });
});
