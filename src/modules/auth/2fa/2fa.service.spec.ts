import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
jest.mock('otplib', () => ({
  generateSecret: jest.fn(),
  generateURI: jest.fn(),
  verify: jest.fn(),
}));
jest.mock('qrcode', () => ({
  toDataURL: jest.fn(),
}));
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { CompaniesService } from '../../companies/companies.service';
import { SecurityEventsService } from '../../security/security-events.service';
import { SmsNotificationManagementService } from '../../sms/sms-notification-management.service';
import { UsersService } from '../../users/users.service';
import { UserTwoFactorAuditService } from '../../users/services/user-two-factor-audit.service';
import { TwoFaService } from './2fa.service';

describe('TwoFaService', () => {
  let service: TwoFaService;
  let usersService: {
    findByIdWithTwoFactor: jest.Mock;
    adminEnableTwoFactor: jest.Mock;
    adminDisableTwoFactor: jest.Mock;
    hasAnotherProtectedTwoFactorAdmin: jest.Mock;
  };
  let companiesService: {
    findCompanyUserContext: jest.Mock;
  };
  let auditService: {
    log: jest.Mock;
  };
  let securityEventsService: {
    logBestEffort: jest.Mock;
  };
  let smsNotificationManagementService: {
    sendConfiguredNotification: jest.Mock;
  };

  const actor: AuthenticatedUser = {
    id: 7,
    email: 'admin@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: 12,
    companyMembershipId: 55,
    roles: ['COMPANY_ADMIN'],
    permissions: ['users:manage-2fa'],
  };

  beforeEach(() => {
    usersService = {
      findByIdWithTwoFactor: jest.fn(),
      adminEnableTwoFactor: jest.fn(),
      adminDisableTwoFactor: jest.fn(),
      hasAnotherProtectedTwoFactorAdmin: jest.fn(),
    };
    companiesService = {
      findCompanyUserContext: jest.fn(),
    };
    auditService = {
      log: jest.fn(),
    };
    securityEventsService = {
      logBestEffort: jest.fn(),
    };
    smsNotificationManagementService = {
      sendConfiguredNotification: jest.fn(),
    };

    service = new TwoFaService(
      usersService as unknown as UsersService,
      {} as ConfigService,
      companiesService as unknown as CompaniesService,
      auditService as unknown as UserTwoFactorAuditService,
      securityEventsService as unknown as SecurityEventsService,
      smsNotificationManagementService as unknown as SmsNotificationManagementService,
    );
  });

  it('enables 2FA for a company user through the admin flow', async () => {
    companiesService.findCompanyUserContext.mockResolvedValue({});
    usersService.findByIdWithTwoFactor.mockResolvedValue({
      id: 15,
      user_no: 'USER-2026-00015',
      email: 'staff@example.com',
      status: 'active',
      is_two_factor_enabled: false,
      two_factor_setup_required: false,
      two_factor_secret: null,
      two_factor_backup_codes: null,
    });

    const result = await service.adminEnable2FA(12, 15, actor, {
      ipAddress: '197.250.10.22',
      userAgent: 'Jest',
    });

    expect(usersService.adminEnableTwoFactor).toHaveBeenCalledWith(15, 7);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 12,
        target_user_id: 15,
        target_user_email: 'staff@example.com',
        previous_status: false,
        new_status: true,
        action: 'user_2fa.enabled',
      }),
    );
    expect(securityEventsService.logBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'TWO_FACTOR_ENABLED',
        companyId: 12,
        targetUserId: 15,
      }),
    );
    expect(result).toEqual({
      success: true,
      message:
        'Two-factor authentication has been enabled for the user. The user must complete 2FA setup during the next login.',
      data: {
        userId: 15,
        twoFactorEnabled: true,
        twoFactorSetupRequired: true,
      },
    });
  });

  it('disables 2FA for a company user and records the reason', async () => {
    companiesService.findCompanyUserContext.mockResolvedValue({});
    usersService.findByIdWithTwoFactor.mockResolvedValue({
      id: 15,
      user_no: 'USER-2026-00015',
      email: 'staff@example.com',
      status: 'inactive',
      is_two_factor_enabled: true,
      two_factor_setup_required: false,
      two_factor_secret: 'enc:2fa:v1:test',
      two_factor_backup_codes: ['hashed-code'],
    });

    const result = await service.adminDisable2FA(
      12,
      15,
      actor,
      '  Lost device  ',
      {
        ipAddress: '197.250.10.22',
        userAgent: 'Jest',
      },
    );

    expect(usersService.adminDisableTwoFactor).toHaveBeenCalledWith(
      15,
      7,
      'Lost device',
      expect.any(Date),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 12,
        target_user_id: 15,
        previous_status: true,
        new_status: false,
        action: 'user_2fa.disabled',
        disable_reason: 'Lost device',
      }),
    );
    expect(securityEventsService.logBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'TWO_FACTOR_DISABLED',
        companyId: 12,
        targetUserId: 15,
        reason: 'Lost device',
      }),
    );
    expect(result.data).toEqual({
      userId: 15,
      twoFactorEnabled: false,
      twoFactorSetupRequired: false,
    });
  });

  it('returns an idempotent response when admin disable is repeated', async () => {
    companiesService.findCompanyUserContext.mockResolvedValue({});
    usersService.findByIdWithTwoFactor.mockResolvedValue({
      id: 15,
      user_no: 'USER-2026-00015',
      email: 'staff@example.com',
      status: 'active',
      is_two_factor_enabled: false,
      two_factor_setup_required: false,
      two_factor_secret: null,
      two_factor_backup_codes: null,
    });

    const result = await service.adminDisable2FA(12, 15, actor);

    expect(usersService.adminDisableTwoFactor).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user_2fa.disable_noop',
        previous_status: false,
        new_status: false,
      }),
    );
    expect(result.message).toBe(
      'Two-factor authentication is already disabled for the user.',
    );
  });

  it('blocks self-disable when no other protected administrator exists', async () => {
    companiesService.findCompanyUserContext.mockResolvedValue({});
    usersService.findByIdWithTwoFactor.mockResolvedValue({
      id: 7,
      user_no: 'USER-2026-00007',
      email: 'admin@example.com',
      status: 'active',
      is_two_factor_enabled: true,
      two_factor_setup_required: false,
      two_factor_secret: 'enc:2fa:v1:test',
      two_factor_backup_codes: ['hashed-code'],
    });
    usersService.hasAnotherProtectedTwoFactorAdmin.mockResolvedValue(false);

    await expect(service.adminDisable2FA(12, 7, actor)).rejects.toThrow(
      ForbiddenException,
    );

    expect(usersService.adminDisableTwoFactor).not.toHaveBeenCalled();
  });
});
