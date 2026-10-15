import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateSecret, generateURI, verify } from 'otplib';
import * as qrcode from 'qrcode';
import * as crypto from 'crypto';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import type { AuditRequestContext } from '../../../common/interfaces/audit-request-context.interface';
import { CompaniesService } from '../../companies/companies.service';
import { SecurityEventOutcome } from '../../security/enums/security-event-outcome.enum';
import { SecurityEventType } from '../../security/enums/security-event-type.enum';
import { SecurityEventsService } from '../../security/security-events.service';
import { NotificationQueueService } from '../../notifications/notification-queue.service';
import { SmsNotificationManagementService } from '../../sms/sms-notification-management.service';
import { UsersService } from '../../users/users.service';
import { UserTwoFactorAuditService } from '../../users/services/user-two-factor-audit.service';
import { decryptTwoFactorSecret } from './utils/two-factor-secret.util';

type AuditContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class TwoFaService {
  private readonly logger = new Logger(TwoFaService.name);

  constructor(
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,
    private configService: ConfigService,
    private companiesService: CompaniesService,
    private userTwoFactorAuditService: UserTwoFactorAuditService,
    private readonly securityEventsService: SecurityEventsService,
    private readonly smsNotificationManagementService: SmsNotificationManagementService,
    private readonly notificationQueueService: NotificationQueueService,
  ) {}

  private normalizeCode(code: string): string {
    return code.replace(/[\s-]/g, '').toUpperCase();
  }

  private formatBackupCodes(codes: string[]): string[] {
    return codes.map((code) => code.match(/.{1,5}/g)?.join('-') ?? code);
  }

  private isFullyConfigured(user: {
    is_two_factor_enabled: boolean;
    two_factor_setup_required: boolean;
    two_factor_secret?: string | null;
  }): boolean {
    return Boolean(
      user.is_two_factor_enabled &&
      !user.two_factor_setup_required &&
      user.two_factor_secret,
    );
  }

  private hasAnyTwoFactorState(user: {
    is_two_factor_enabled: boolean;
    two_factor_setup_required: boolean;
    two_factor_secret?: string | null;
    two_factor_backup_codes?: string[] | null;
  }): boolean {
    return Boolean(
      user.is_two_factor_enabled ||
      user.two_factor_setup_required ||
      user.two_factor_secret ||
      user.two_factor_backup_codes?.length,
    );
  }

  async getTwoFactorStatus(userId: number): Promise<{
    enabled: boolean;
    setupRequired: boolean;
    fullyConfigured: boolean;
  }> {
    const user = await this.usersService.findByIdWithTwoFactor(userId);

    return {
      enabled: user.is_two_factor_enabled ?? false,
      setupRequired: user.two_factor_setup_required ?? false,
      fullyConfigured: this.isFullyConfigured(user),
    };
  }

  async generate2FASetup(userId: number) {
    const user = await this.usersService.findByIdWithTwoFactor(userId);
    if (!user) throw new BadRequestException('User not found');

    if (user.status !== 'active') {
      throw new ForbiddenException(
        'Inactive users cannot configure two-factor authentication',
      );
    }

    if (user.is_two_factor_enabled && !user.two_factor_setup_required) {
      throw new BadRequestException('2FA is already enabled for this account');
    }

    const secret: string = generateSecret({ length: 32 });
    const serviceName = this.configService.get<string>('APP_NAME') || 'YourApp';
    const otpAuthUrl: string = generateURI({
      issuer: serviceName,
      label: user.email,
      secret,
    });

    const qrCode = await qrcode.toDataURL(otpAuthUrl);

    await this.usersService.update2FASecret(userId, secret);

    return {
      secret,
      qrCode,
      otpAuthUrl,
    };
  }

  async verifyAndActivate2FA(
    userId: number,
    token: string,
    context?: AuditRequestContext | null,
  ) {
    const user = await this.usersService.findByIdWithTwoFactor(userId);
    if (!user) throw new BadRequestException('User not found');

    if (user.status !== 'active') {
      throw new ForbiddenException(
        'Inactive users cannot configure two-factor authentication',
      );
    }

    if (!user.two_factor_secret) {
      throw new BadRequestException('No 2FA setup in progress');
    }

    const decryptedSecret = decryptTwoFactorSecret(user.two_factor_secret);
    if (!decryptedSecret) {
      throw new BadRequestException('No 2FA setup in progress');
    }

    const normalizedToken = this.normalizeCode(token);
    const result = await verify({
      secret: decryptedSecret,
      token: normalizedToken,
    });

    if (!result.valid) {
      throw new BadRequestException('Invalid 2FA code');
    }

    const backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(5).toString('hex').toUpperCase(),
    );

    const hashed = backupCodes.map((code) =>
      crypto.createHash('sha256').update(code).digest('hex'),
    );

    await this.usersService.complete2FASetup(userId, decryptedSecret, hashed);
    await this.securityEventsService.logBestEffort({
      eventType: SecurityEventType.TWO_FACTOR_ENABLED,
      outcome: SecurityEventOutcome.SUCCESS,
      targetUserId: user.id,
      resourceType: 'user_2fa',
      resourceId: user.id,
      newValues: {
        is_two_factor_enabled: true,
        two_factor_setup_required: false,
      },
      context,
    });

    this.sendSmsNotificationBestEffort({
      code: 'auth.two_factor.enabled',
      module: 'auth',
      recipientPhone: user.phone ?? null,
      relatedEntityType: 'USER',
      relatedEntityId: user.id,
      variables: {
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
      },
      context: context ?? null,
    });

    const formattedBackupCodes = this.formatBackupCodes(backupCodes);

    return {
      message: '2FA successfully enabled!',
      backupCodes: formattedBackupCodes,
      note: 'Store these codes securely. Each is single-use. You can regenerate them later if needed.',
    };
  }

  /**
   * Verify 2FA code during login (TOTP or backup code)
   */
  async verify2FALogin(userId: number, token: string): Promise<boolean> {
    const user = await this.usersService.findByIdWithTwoFactor(userId);
    if (!user || !this.isFullyConfigured(user)) {
      throw new BadRequestException(
        '2FA is not fully configured for this user',
      );
    }

    const decryptedSecret = decryptTwoFactorSecret(user.two_factor_secret);
    if (!decryptedSecret) {
      throw new BadRequestException(
        '2FA is not fully configured for this user',
      );
    }

    const normalizedToken = this.normalizeCode(token);

    if (/^\d{6}$/.test(normalizedToken)) {
      const totpResult = await verify({
        secret: decryptedSecret,
        token: normalizedToken,
      });
      if (totpResult.valid) return true;
    }

    if (user.two_factor_backup_codes?.length) {
      const hashedToken = crypto
        .createHash('sha256')
        .update(normalizedToken)
        .digest('hex');
      const index = user.two_factor_backup_codes.indexOf(hashedToken);

      if (index !== -1) {
        user.two_factor_backup_codes.splice(index, 1);
        await this.usersService.updateBackupCodes(
          userId,
          user.two_factor_backup_codes,
        );
        return true;
      }
    }

    throw new UnauthorizedException('Invalid 2FA code');
  }

  async verifyPayrollAuthenticatorCode(userId: number, token: string) {
    if (!/^\d{6}$/.test(token)) return false;
    const user = await this.usersService.findByIdWithTwoFactor(userId);
    if (!user || !this.isFullyConfigured(user)) return false;
    const secret = decryptTwoFactorSecret(user.two_factor_secret);
    if (!secret) return false;
    const result = await verify({ secret, token });
    return result.valid;
  }

  async disable2FA(
    userId: number,
    token: string,
    context?: AuditRequestContext | null,
  ) {
    const user = await this.usersService.findByIdWithTwoFactor(userId);
    if (!user || !user.is_two_factor_enabled) {
      throw new BadRequestException('2FA is not enabled');
    }

    if (!this.isFullyConfigured(user)) {
      throw new BadRequestException('2FA setup is not complete for this user');
    }

    const isValid = await this.verify2FALogin(userId, token);
    if (!isValid) {
      throw new UnauthorizedException('Invalid 2FA code');
    }

    await this.usersService.disable2FA(userId);
    await this.usersService.markAuthTokensInvalidBefore(userId, new Date());
    await this.securityEventsService.logBestEffort({
      eventType: SecurityEventType.TWO_FACTOR_DISABLED,
      outcome: SecurityEventOutcome.SUCCESS,
      targetUserId: user.id,
      resourceType: 'user_2fa',
      resourceId: user.id,
      oldValues: {
        is_two_factor_enabled: true,
        two_factor_setup_required: false,
      },
      newValues: {
        is_two_factor_enabled: false,
        two_factor_setup_required: false,
      },
      context,
    });

    this.sendSmsNotificationBestEffort({
      code: 'auth.two_factor.disabled',
      module: 'auth',
      recipientPhone: user.phone ?? null,
      relatedEntityType: 'USER',
      relatedEntityId: user.id,
      variables: {
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
      },
      context: context ?? null,
    });

    return { message: '2FA successfully disabled' };
  }

  async is2FARequired(userId: number): Promise<boolean> {
    const status = await this.getTwoFactorStatus(userId);
    return status.fullyConfigured;
  }

  async is2FASetupRequired(userId: number): Promise<boolean> {
    const status = await this.getTwoFactorStatus(userId);
    return status.enabled && status.setupRequired;
  }

  async regenerateBackupCodes(
    userId: number,
    token: string,
  ): Promise<{ backupCodes: string[]; message: string }> {
    const user = await this.usersService.findByIdWithTwoFactor(userId);
    if (!user || !this.isFullyConfigured(user)) {
      throw new BadRequestException('2FA is not enabled');
    }

    const valid = await this.verify2FALogin(userId, token);
    if (!valid) throw new UnauthorizedException('Invalid code');

    const newCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(5).toString('hex').toUpperCase(),
    );

    const hashed = newCodes.map((c) =>
      crypto.createHash('sha256').update(c).digest('hex'),
    );

    await this.usersService.updateBackupCodes(userId, hashed);

    const formatted = this.formatBackupCodes(newCodes);

    return {
      backupCodes: formatted,
      message: 'New backup codes generated. Old ones are invalidated.',
    };
  }

  async adminEnable2FA(
    companyId: number,
    userId: number,
    actor: AuthenticatedUser,
    auditContext: AuditContext = {},
  ) {
    await this.companiesService.findCompanyUserContext(companyId, userId);

    const user = await this.usersService.findByIdWithTwoFactor(userId);

    if (user.status !== 'active') {
      throw new BadRequestException(
        'Inactive users cannot have 2FA enabled by an administrator',
      );
    }

    if (user.is_two_factor_enabled) {
      throw new ConflictException(
        'Two-factor authentication is already enabled for this user',
      );
    }

    await this.usersService.adminEnableTwoFactor(userId, actor.id);

    await this.userTwoFactorAuditService.log({
      company_id: companyId,
      target_user_id: user.id,
      target_user_email: user.email,
      previous_status: false,
      new_status: true,
      action: 'user_2fa.enabled',
      actor,
      ip_address: auditContext.ipAddress ?? null,
      user_agent: auditContext.userAgent ?? null,
      payload: {
        target_user_no: user.user_no,
        two_factor_setup_required: true,
      },
    });
    await this.securityEventsService.logBestEffort({
      eventType: SecurityEventType.TWO_FACTOR_ENABLED,
      outcome: SecurityEventOutcome.SUCCESS,
      actor,
      companyId,
      targetUserId: user.id,
      resourceType: 'user_2fa',
      resourceId: user.id,
      newValues: {
        is_two_factor_enabled: true,
        two_factor_setup_required: true,
      },
      context: {
        ipAddress: auditContext.ipAddress ?? null,
        userAgent: auditContext.userAgent ?? null,
        requestId: null,
      },
    });

    this.sendSmsNotificationBestEffort({
      code: 'auth.two_factor.enabled',
      module: 'auth',
      recipientPhone: user.phone ?? null,
      relatedEntityType: 'USER',
      relatedEntityId: user.id,
      actor,
      variables: {
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
      },
      context: {
        ipAddress: auditContext.ipAddress ?? null,
        userAgent: auditContext.userAgent ?? null,
        requestId: null,
      },
    });

    return {
      success: true,
      message:
        'Two-factor authentication has been enabled for the user. The user must complete 2FA setup during the next login.',
      data: {
        userId: user.id,
        twoFactorEnabled: true,
        twoFactorSetupRequired: true,
      },
    };
  }

  async adminDisable2FA(
    companyId: number,
    userId: number,
    actor: AuthenticatedUser,
    reason?: string,
    auditContext: AuditContext = {},
  ) {
    await this.companiesService.findCompanyUserContext(companyId, userId);

    const user = await this.usersService.findByIdWithTwoFactor(userId);
    const normalizedReason = reason?.trim() || null;

    if (
      actor.id === user.id &&
      !(await this.usersService.hasAnotherProtectedTwoFactorAdmin(
        companyId,
        actor.id,
      ))
    ) {
      throw new ForbiddenException(
        'You cannot disable your own 2FA because it would leave the company without another protected administrator account.',
      );
    }

    if (!this.hasAnyTwoFactorState(user)) {
      await this.userTwoFactorAuditService.log({
        company_id: companyId,
        target_user_id: user.id,
        target_user_email: user.email,
        previous_status: false,
        new_status: false,
        action: 'user_2fa.disable_noop',
        actor,
        ip_address: auditContext.ipAddress ?? null,
        user_agent: auditContext.userAgent ?? null,
        disable_reason: normalizedReason,
        payload: {
          target_user_no: user.user_no,
          already_disabled: true,
        },
      });

      return {
        success: true,
        message: 'Two-factor authentication is already disabled for the user.',
        data: {
          userId: user.id,
          twoFactorEnabled: false,
          twoFactorSetupRequired: false,
        },
      };
    }

    const revokedAt = new Date();
    await this.usersService.adminDisableTwoFactor(
      user.id,
      actor.id,
      normalizedReason,
      revokedAt,
    );

    await this.userTwoFactorAuditService.log({
      company_id: companyId,
      target_user_id: user.id,
      target_user_email: user.email,
      previous_status: user.is_two_factor_enabled,
      new_status: false,
      action: 'user_2fa.disabled',
      actor,
      ip_address: auditContext.ipAddress ?? null,
      user_agent: auditContext.userAgent ?? null,
      disable_reason: normalizedReason,
      payload: {
        target_user_no: user.user_no,
        previous_setup_required: user.two_factor_setup_required,
        sessions_revoked: true,
      },
    });
    await this.securityEventsService.logBestEffort({
      eventType: SecurityEventType.TWO_FACTOR_DISABLED,
      outcome: SecurityEventOutcome.SUCCESS,
      actor,
      companyId,
      targetUserId: user.id,
      resourceType: 'user_2fa',
      resourceId: user.id,
      reason: normalizedReason,
      oldValues: {
        is_two_factor_enabled: user.is_two_factor_enabled,
        two_factor_setup_required: user.two_factor_setup_required,
      },
      newValues: {
        is_two_factor_enabled: false,
        two_factor_setup_required: false,
      },
      context: {
        ipAddress: auditContext.ipAddress ?? null,
        userAgent: auditContext.userAgent ?? null,
        requestId: null,
      },
    });

    this.sendSmsNotificationBestEffort({
      code: 'auth.two_factor.disabled',
      module: 'auth',
      recipientPhone: user.phone ?? null,
      relatedEntityType: 'USER',
      relatedEntityId: user.id,
      actor,
      variables: {
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
      },
      context: {
        ipAddress: auditContext.ipAddress ?? null,
        userAgent: auditContext.userAgent ?? null,
        requestId: null,
      },
    });

    return {
      success: true,
      message: 'Two-factor authentication has been disabled for the user.',
      data: {
        userId: user.id,
        twoFactorEnabled: false,
        twoFactorSetupRequired: false,
      },
    };
  }

  private sendSmsNotificationBestEffort(input: {
    code: string;
    module: string;
    recipientPhone?: string | null;
    relatedEntityType?: string | null;
    relatedEntityId?: string | number | null;
    actor?: AuthenticatedUser | null;
    variables?: Record<string, unknown>;
    context?: AuditRequestContext | null;
  }): void {
    void this.notificationQueueService.enqueueSmsConfiguredNotification({
      code: input.code,
      module: input.module,
      recipientPhone: input.recipientPhone ?? null,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
      actor: input.actor ?? null,
      variables: input.variables,
      context: input.context ?? null,
    });
  }
}
