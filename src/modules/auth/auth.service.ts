import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import type { StringValue } from 'ms';

import {
  AuthScope,
  AuthenticatedUser,
  UserType,
} from '../../common/interfaces/authenticated-user.interface';
import { AuditRequestContext } from '../../common/interfaces/audit-request-context.interface';
import { comparePasswords, hashPassword } from '../../common/utils/hash.util';
import { hasPermission } from '../../common/utils/permission.util';
import { CompaniesService } from '../companies/companies.service';
import {
  CompanyMembershipContext,
  CompanySummary,
} from '../companies/interfaces/company-membership-context.interface';
import { MailService } from '../mail/mail.service';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { SecurityEventOutcome } from '../security/enums/security-event-outcome.enum';
import { SecurityEventType } from '../security/enums/security-event-type.enum';
import { SecurityEventsService } from '../security/security-events.service';
import { SmsNotificationManagementService } from '../sms/sms-notification-management.service';
import { TwoFactorPolicyService } from '../security/two-factor-policy.service';
import { TwoFaService } from './2fa/2fa.service';
import { ForgotPasswordDto } from './dtos/forgot-password.dto';
import { LoginDto } from './dtos/login.dto';
import { LogoutDto } from './dtos/logout.dto';
import { RefreshTokenDto } from './dtos/refresh-token.dto';
import { ResetPasswordDto } from './dtos/reset-password.dto';
import { TokenBlacklistService } from './token-blacklist.service';

type AccessTokenPayload = {
  sub: number;
  email: string;
  scope: AuthScope;
  userType: UserType;
  dashboardType?: 'admin' | 'employee';
  companyId?: number;
  companySlug?: string;
  companyName?: string;
  membershipId?: number;
  employeeId?: number;
  employeeNo?: string;
  roles: string[];
  permissions: string[];
  type: 'access';
  iss: string;
  aud: string;
  sessionId: string;
  device: string;
  tokenVersion: number;
};

type RefreshTokenPayload = {
  sub: number;
  scope: AuthScope;
  userType: UserType;
  companyId?: number;
  membershipId?: number;
  type: 'refresh';
  tokenVersion: number;
  iat?: number;
};

type TwoFactorTempTokenPayload = {
  sub: number;
  email: string;
  scope: AuthScope;
  userType: UserType;
  companyId?: number;
  temp: true;
  type: '2fa-temp';
  iat?: number;
};

type PlatformAccessContext = {
  scope: 'platform';
  userType: 'OWNER';
  roles: string[];
  permissions: string[];
};

type DashboardType = 'admin' | 'employee';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly mailService: MailService,
    private readonly twoFaService: TwoFaService,
    private readonly companiesService: CompaniesService,
    private readonly securityEventsService: SecurityEventsService,
    private readonly twoFactorPolicyService: TwoFactorPolicyService,
    private readonly smsNotificationManagementService: SmsNotificationManagementService,
  ) {}

  private buildFailureMetadata(context?: CompanySummary | null) {
    return context
      ? {
          companyId: context.companyId,
          companySlug: context.companySlug,
        }
      : undefined;
  }

  private async logSecurityEvent(
    eventType: SecurityEventType,
    outcome: SecurityEventOutcome,
    options: {
      actor?: AccessTokenPayload | null;
      authenticatedUser?: User | null;
      companyId?: number | null;
      targetUserId?: number | null;
      metadata?: Record<string, unknown> | null;
      reason?: string | null;
      context?: AuditRequestContext | null;
    } = {},
  ) {
    await this.securityEventsService.logBestEffort({
      eventType,
      outcome,
      companyId: options.companyId ?? null,
      targetUserId:
        options.targetUserId ?? options.authenticatedUser?.id ?? null,
      reason: options.reason ?? null,
      metadata: options.metadata ?? null,
      context: options.context ?? null,
    });
  }

  async validateUser(email: string, pass: string) {
    const user = await this.usersService.findByEmailForAuth(email);

    if (!user) {
      return null;
    }

    const match = await comparePasswords(pass, user.password);
    if (!match) {
      return null;
    }

    const { password, ...result } = user;
    void password;
    return result;
  }

  async login(loginDto: LoginDto, context?: AuditRequestContext | null) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      await this.logSecurityEvent(
        SecurityEventType.LOGIN_FAILED,
        SecurityEventOutcome.FAILURE,
        {
          reason: 'Invalid credentials',
          metadata: {
            email: loginDto.email.trim().toLowerCase(),
          },
          context,
        },
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'active') {
      await this.logSecurityEvent(
        SecurityEventType.LOGIN_BLOCKED,
        SecurityEventOutcome.DENIED,
        {
          authenticatedUser: user as User,
          reason: 'User account is inactive',
          context,
        },
      );
      throw new ForbiddenException(
        'Your account is inactive. Please contact an administrator.',
      );
    }

    const isVerificationEnabled = this.isFeatureEnabled(
      'ENABLE_EMAIL_VERIFICATION',
      true,
    );
    if (isVerificationEnabled && !user.is_email_verified) {
      await this.logSecurityEvent(
        SecurityEventType.LOGIN_BLOCKED,
        SecurityEventOutcome.DENIED,
        {
          authenticatedUser: user as User,
          reason: 'Email verification is required',
          context,
        },
      );
      return {
        requiresEmailVerification: true,
        message: 'Please verify your email address before continuing.',
        userId: user.id,
        email: user.email,
      };
    }

    if (this.isOwnerUser(user)) {
      const platformContext = this.buildPlatformAccessContext(user as User);
      const twoFactorStatus = await this.twoFaService.getTwoFactorStatus(
        user.id,
      );

      if (twoFactorStatus.fullyConfigured) {
        const tempToken = this.jwtService.sign<TwoFactorTempTokenPayload>(
          {
            sub: user.id,
            email: user.email,
            scope: 'platform',
            userType: 'OWNER',
            temp: true,
            type: '2fa-temp',
          },
          {
            secret: this.getAccessTokenSecret(),
            expiresIn: '5m' as StringValue,
          },
        );

        await this.logSecurityEvent(
          SecurityEventType.TWO_FACTOR_CHALLENGE_CREATED,
          SecurityEventOutcome.SUCCESS,
          {
            authenticatedUser: user as User,
            context,
            metadata: {
              scope: 'platform',
            },
          },
        );

        return {
          requires2FA: true,
          tempToken,
          message: 'Password verified. Please provide your 2FA code.',
        };
      }

      await this.usersService.updateLastLogin(
        user.id,
        new Date(),
        context?.ipAddress ?? null,
      );
      const response = this.generatePlatformAuthResponse(
        user as User,
        platformContext,
      );

      await this.logSecurityEvent(
        SecurityEventType.LOGIN_SUCCEEDED,
        SecurityEventOutcome.SUCCESS,
        {
          authenticatedUser: user as User,
          context,
          metadata: {
            scope: 'platform',
            roles: platformContext.roles,
          },
        },
      );

      if (twoFactorStatus.enabled && twoFactorStatus.setupRequired) {
        return {
          ...response,
          requires2FASetup: true,
          message:
            'Two-factor authentication has been enabled for your account. Complete setup now before continuing.',
        };
      }

      return response;
    }

    const companies = await this.companiesService.listUserCompanies(user.id);
    if (!companies.length) {
      await this.logSecurityEvent(
        SecurityEventType.LOGIN_BLOCKED,
        SecurityEventOutcome.DENIED,
        {
          authenticatedUser: user as User,
          reason: 'No active company memberships found',
          context,
        },
      );
      throw new ForbiddenException(
        'You do not belong to any active company in this system.',
      );
    }

    const activeCompany = this.resolveActiveCompany(companies);

    const twoFactorStatus = await this.twoFaService.getTwoFactorStatus(user.id);
    if (twoFactorStatus.fullyConfigured) {
      const tempToken = this.jwtService.sign<TwoFactorTempTokenPayload>(
        {
          sub: user.id,
          email: user.email,
          scope: 'company',
          userType: 'COMPANY_USER',
          companyId: activeCompany.companyId,
          temp: true,
          type: '2fa-temp',
        },
        {
          secret: this.getAccessTokenSecret(),
          expiresIn: '5m' as StringValue,
        },
      );

      await this.logSecurityEvent(
        SecurityEventType.TWO_FACTOR_CHALLENGE_CREATED,
        SecurityEventOutcome.SUCCESS,
        {
          authenticatedUser: user as User,
          companyId: activeCompany.companyId,
          context,
          metadata: {
            scope: 'company',
          },
        },
      );

      return {
        requires2FA: true,
        tempToken,
        company: activeCompany,
        companies,
        message: 'Password verified. Please provide your 2FA code.',
      };
    }

    await this.usersService.updateLastLogin(
      user.id,
      new Date(),
      context?.ipAddress ?? null,
    );
    const activeCompanyContext =
      await this.companiesService.setActiveMembership(
        user.id,
        activeCompany.companyId,
      );
    const availableCompanies = await this.companiesService.listUserCompanies(
      user.id,
    );

    const response = this.generateCompanyAuthResponse(
      user as User,
      activeCompanyContext,
      availableCompanies,
    );
    const responseWithPasswordRequirement =
      await this.applyCompanyPasswordChangeRequirement(
        user as User,
        activeCompanyContext.companyId,
        response,
      );

    const roleRequiresTwoFactor = this.twoFactorPolicyService.isRequired(
      activeCompanyContext.roles,
    );
    const currentTwoFactorStatus = await this.twoFaService.getTwoFactorStatus(
      user.id,
    );

    if (roleRequiresTwoFactor && !currentTwoFactorStatus.fullyConfigured) {
      await this.usersService.requireTwoFactorSetup(user.id);
      await this.logSecurityEvent(
        SecurityEventType.TWO_FACTOR_SETUP_REQUIRED,
        SecurityEventOutcome.SUCCESS,
        {
          authenticatedUser: user as User,
          companyId: activeCompanyContext.companyId,
          context,
          metadata: {
            protected_roles: activeCompanyContext.roles,
          },
        },
      );

      return {
        ...responseWithPasswordRequirement,
        requires2FASetup: true,
        message:
          'Two-factor authentication is mandatory for your role. Complete setup before continuing.',
      };
    }

    await this.logSecurityEvent(
      SecurityEventType.LOGIN_SUCCEEDED,
      SecurityEventOutcome.SUCCESS,
      {
        authenticatedUser: user as User,
        companyId: activeCompanyContext.companyId,
        context,
        metadata: {
          scope: 'company',
          roles: activeCompanyContext.roles,
        },
      },
    );

    if (twoFactorStatus.enabled && twoFactorStatus.setupRequired) {
      return {
        ...responseWithPasswordRequirement,
        requires2FASetup: true,
        message: responseWithPasswordRequirement.requiresPasswordChange
          ? 'You must change your temporary password before continuing.'
          : 'Two-factor authentication has been enabled for your account. Complete setup now before continuing.',
      };
    }

    return responseWithPasswordRequirement;
  }

  async complete2FALogin(
    tempToken: string,
    code: string,
    context?: AuditRequestContext | null,
  ) {
    try {
      const payload = this.jwtService.verify<TwoFactorTempTokenPayload>(
        tempToken,
        {
          secret: this.getAccessTokenSecret(),
        },
      );

      if (payload.type !== '2fa-temp' || !payload.temp || !payload.sub) {
        throw new UnauthorizedException('Invalid temporary token');
      }

      const user = await this.usersService.findById(payload.sub);
      if (user.status !== 'active') {
        throw new ForbiddenException(
          'Your account is inactive. Please contact an administrator.',
        );
      }

      this.assertTokenStillValid(
        payload.iat,
        user.auth_token_invalid_before,
        'The 2FA login step is no longer valid. Please log in again.',
      );

      const isValid = await this.twoFaService.verify2FALogin(payload.sub, code);
      if (!isValid) {
        throw new UnauthorizedException('Invalid 2FA code');
      }

      await this.usersService.updateLastLogin(
        user.id,
        new Date(),
        context?.ipAddress ?? null,
      );

      if (payload.scope === 'platform') {
        if (!this.isOwnerUser(user) || payload.userType !== 'OWNER') {
          throw new UnauthorizedException('Invalid platform login context');
        }

        await this.logSecurityEvent(
          SecurityEventType.TWO_FACTOR_VERIFICATION_SUCCEEDED,
          SecurityEventOutcome.SUCCESS,
          {
            authenticatedUser: user,
            context,
            metadata: {
              scope: 'platform',
            },
          },
        );

        return this.generatePlatformAuthResponse(
          user,
          this.buildPlatformAccessContext(user),
        );
      }

      if (this.isOwnerUser(user) || payload.userType !== 'COMPANY_USER') {
        throw new UnauthorizedException('Invalid company login context');
      }

      if (!payload.companyId) {
        throw new UnauthorizedException('Company context is missing');
      }

      const companyContext = await this.companiesService.setActiveMembership(
        payload.sub,
        payload.companyId,
      );
      const companies = await this.companiesService.listUserCompanies(
        payload.sub,
      );

      await this.logSecurityEvent(
        SecurityEventType.TWO_FACTOR_VERIFICATION_SUCCEEDED,
        SecurityEventOutcome.SUCCESS,
        {
          authenticatedUser: user,
          companyId: companyContext.companyId,
          context,
          metadata: {
            scope: 'company',
            roles: companyContext.roles,
          },
        },
      );

      return this.applyCompanyPasswordChangeRequirement(
        user,
        companyContext.companyId,
        this.generateCompanyAuthResponse(user, companyContext, companies),
      );
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        await this.logSecurityEvent(
          SecurityEventType.TWO_FACTOR_VERIFICATION_FAILED,
          SecurityEventOutcome.FAILURE,
          {
            reason: error.message,
            context,
          },
        );
        throw error;
      }

      if (error instanceof NotFoundException) {
        throw new UnauthorizedException(
          'Company access is no longer available',
        );
      }

      if (this.isJwtError(error)) {
        throw new UnauthorizedException(
          'Temporary token is invalid or expired. Please log in again.',
        );
      }

      throw error;
    }
  }

  async switchCompany(
    userId: number,
    companyId: number,
    context?: AuditRequestContext | null,
  ) {
    const user = await this.usersService.findById(userId);
    if (user.status !== 'active') {
      throw new ForbiddenException(
        'Your account is inactive. Please contact an administrator.',
      );
    }

    if (this.isOwnerUser(user)) {
      throw new ForbiddenException('OWNER users do not use company context');
    }

    let companyContext: CompanyMembershipContext;
    try {
      companyContext = await this.companiesService.setActiveMembership(
        userId,
        companyId,
      );
    } catch {
      throw new UnauthorizedException(
        'You do not have access to the selected company',
      );
    }

    await this.usersService.updateLastLogin(
      userId,
      new Date(),
      context?.ipAddress ?? null,
    );
    const companies = await this.companiesService.listUserCompanies(userId);

    await this.logSecurityEvent(
      SecurityEventType.COMPANY_SWITCHED,
      SecurityEventOutcome.SUCCESS,
      {
        authenticatedUser: user,
        companyId: companyContext.companyId,
        context,
        metadata: {
          company_slug: companyContext.companySlug,
        },
      },
    );

    return this.generateCompanyAuthResponse(user, companyContext, companies);
  }

  async refreshTokens(
    refreshTokenDto: RefreshTokenDto,
    context?: AuditRequestContext | null,
  ) {
    const refreshToken = refreshTokenDto.refresh_token;

    if (await this.tokenBlacklistService.isBlacklisted(refreshToken)) {
      await this.logSecurityEvent(
        SecurityEventType.TOKEN_REFRESH_FAILED,
        SecurityEventOutcome.FAILURE,
        {
          reason: 'Refresh token has been revoked',
          context,
        },
      );
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    try {
      const payload = this.jwtService.verify<RefreshTokenPayload>(
        refreshToken,
        {
          secret: this.getRefreshTokenSecret(),
        },
      );

      if (
        payload.type !== 'refresh' ||
        !payload.sub ||
        !payload.scope ||
        !payload.userType
      ) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const user = await this.usersService.findById(payload.sub);
      if (user.status !== 'active') {
        throw new ForbiddenException(
          'Your account is inactive. Please contact an administrator.',
        );
      }

      if (
        typeof payload.tokenVersion !== 'number' ||
        payload.tokenVersion !== (user.auth_token_version ?? 0)
      ) {
        throw new UnauthorizedException(
          'Refresh token has been revoked. Please log in again.',
        );
      }

      this.assertTokenStillValid(
        payload.iat,
        user.auth_token_invalid_before,
        'Refresh token has been revoked. Please log in again.',
      );

      if (payload.scope === 'platform') {
        if (!this.isOwnerUser(user) || payload.userType !== 'OWNER') {
          throw new UnauthorizedException('Invalid platform refresh token');
        }

        await this.tokenBlacklistService.addToBlacklist(
          refreshToken,
          this.getTokenBlacklistTtlSeconds(refreshToken, 60),
        );

        await this.logSecurityEvent(
          SecurityEventType.TOKEN_REFRESHED,
          SecurityEventOutcome.SUCCESS,
          {
            authenticatedUser: user,
            context,
            metadata: {
              scope: 'platform',
            },
          },
        );

        return this.generatePlatformAuthResponse(
          user,
          this.buildPlatformAccessContext(user),
        );
      }

      if (
        this.isOwnerUser(user) ||
        payload.userType !== 'COMPANY_USER' ||
        !payload.companyId
      ) {
        throw new UnauthorizedException(
          'Refresh token company context is invalid',
        );
      }

      const companies = await this.companiesService.listUserCompanies(
        payload.sub,
      );

      if (!companies.length) {
        throw new UnauthorizedException(
          'Company access is no longer available',
        );
      }

      const companyContext = await this.companiesService.getMembershipContext(
        payload.sub,
        payload.companyId,
      );

      await this.tokenBlacklistService.addToBlacklist(
        refreshToken,
        this.getTokenBlacklistTtlSeconds(refreshToken, 60),
      );

      await this.logSecurityEvent(
        SecurityEventType.TOKEN_REFRESHED,
        SecurityEventOutcome.SUCCESS,
        {
          authenticatedUser: user,
          companyId: companyContext.companyId,
          context,
          metadata: {
            scope: 'company',
            roles: companyContext.roles,
          },
        },
      );

      return this.generateCompanyAuthResponse(user, companyContext, companies);
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        await this.logSecurityEvent(
          SecurityEventType.TOKEN_REFRESH_FAILED,
          SecurityEventOutcome.FAILURE,
          {
            reason: error.message,
            context,
          },
        );
        throw error;
      }

      if (error instanceof NotFoundException) {
        throw new UnauthorizedException(
          'Company access is no longer available',
        );
      }

      if (this.isJwtError(error)) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      throw error;
    }
  }

  async logout(
    userId: number,
    logoutDto: LogoutDto,
    accessToken?: string,
    actor?: AuthenticatedUser,
    context?: AuditRequestContext | null,
  ) {
    await this.usersService.revokeAllSessions(userId);

    await this.tokenBlacklistService.addToBlacklist(
      logoutDto.refresh_token,
      this.getTokenBlacklistTtlSeconds(logoutDto.refresh_token, 60),
    );

    if (accessToken) {
      await this.tokenBlacklistService.addToBlacklist(
        accessToken,
        this.getTokenBlacklistTtlSeconds(accessToken, 60),
      );
    }

    await this.securityEventsService.logBestEffort({
      eventType: SecurityEventType.LOGOUT,
      outcome: SecurityEventOutcome.SUCCESS,
      actor: actor ?? null,
      targetUserId: userId,
      companyId: actor?.companyId ?? null,
      context,
    });

    return { message: 'Successfully logged out' };
  }

  async forgotPassword(
    dto: ForgotPasswordDto,
    context?: AuditRequestContext | null,
  ) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      return { message: 'If the email exists, you will receive a reset link' };
    }

    const resetToken = this.jwtService.sign(
      { sub: user.id, type: 'password_reset' },
      {
        secret: this.getResetTokenSecret(),
        expiresIn: '60m' as StringValue,
      },
    );

    const resetLink = this.buildFrontendAuthUrl(
      `auth/reset-password?token=${encodeURIComponent(resetToken)}`,
    );

    try {
      await this.mailService.sendPasswordResetEmail(
        user.email,
        user.first_name,
        resetLink,
      );
    } catch (err) {
      console.error('Failed to send password reset email:', err);
    }

    await this.logSecurityEvent(
      SecurityEventType.PASSWORD_RESET_REQUESTED,
      SecurityEventOutcome.SUCCESS,
      {
        authenticatedUser: user,
        context,
      },
    );

    await this.sendSmsNotificationBestEffort({
      code: 'auth.password.reset.requested',
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

    return { message: 'If the email exists, you will receive a reset link' };
  }

  async resetPassword(
    dto: ResetPasswordDto,
    context?: AuditRequestContext | null,
  ) {
    try {
      const payload = this.jwtService.verify<{ type: string; sub: number }>(
        dto.token,
        {
          secret: this.getResetTokenSecret(),
        },
      );

      if (payload.type !== 'password_reset') {
        throw new BadRequestException('Invalid reset token');
      }

      const hashed = await hashPassword(dto.new_password);
      await this.usersService.updatePasswordAndRevokeSessions(
        payload.sub,
        hashed,
      );

      const user = await this.usersService.findById(payload.sub);
      try {
        await this.mailService.sendPasswordChangedSuccessEmail(
          user.email,
          user.first_name,
        );
      } catch (err) {
        console.error('Failed to send password changed success email:', err);
      }

      await this.logSecurityEvent(
        SecurityEventType.PASSWORD_RESET_COMPLETED,
        SecurityEventOutcome.SUCCESS,
        {
          authenticatedUser: user,
          context,
        },
      );

      return {
        message: 'Password has been reset successfully. Please log in again.',
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      if (this.isJwtError(error)) {
        throw new BadRequestException('Invalid or expired reset token');
      }

      throw error;
    }
  }

  async verifyEmail(token: string, context?: AuditRequestContext | null) {
    const isVerificationEnabled = this.isFeatureEnabled(
      'ENABLE_EMAIL_VERIFICATION',
      true,
    );

    if (!isVerificationEnabled) {
      return { message: 'Email verification is not required in this system' };
    }

    if (!token?.trim()) {
      throw new BadRequestException('Verification token is required');
    }

    const user = await this.usersService.findByVerificationToken(token.trim());
    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.usersService.markEmailVerified(user.id);

    try {
      await this.mailService.sendWelcomeEmailAfterVerification(
        user.email,
        user.first_name || 'User',
      );
    } catch (err) {
      console.error('Failed to send welcome email:', err);
    }

    await this.logSecurityEvent(
      SecurityEventType.EMAIL_VERIFIED,
      SecurityEventOutcome.SUCCESS,
      {
        authenticatedUser: user,
        context,
      },
    );

    return { message: 'Email successfully verified! You can now log in.' };
  }

  async resendVerificationEmail(email: string) {
    const isVerificationEnabled = this.isFeatureEnabled(
      'ENABLE_EMAIL_VERIFICATION',
      true,
    );

    if (!isVerificationEnabled) {
      return { message: 'Email verification is not required in this system.' };
    }

    const user = await this.usersService.findByEmail(email);
    if (!user || user.is_email_verified) {
      return {
        message:
          'If the email is registered and unverified, a new link has been sent.',
      };
    }

    const verificationToken = randomUUID();
    const expires = new Date();
    expires.setHours(
      expires.getHours() +
        Number(
          this.configService.get<string>('EMAIL_VERIFICATION_EXPIRY_HOURS') ??
            24,
        ),
    );

    await this.usersService.updateVerificationToken(
      user.id,
      verificationToken,
      expires,
    );

    const verifyLink = this.buildFrontendAuthUrl(
      `auth/verify-email?token=${encodeURIComponent(verificationToken)}`,
    );

    try {
      await this.mailService.sendEmailVerification(
        user.email,
        user.first_name || 'User',
        verifyLink,
      );
    } catch (err) {
      console.error('Failed to send verification email:', err);
    }

    return { message: 'A new verification email has been sent.' };
  }

  private isOwnerUser(user: Pick<User, 'user_type'>): boolean {
    return user.user_type === 'OWNER';
  }

  private getDirectPermissions(user: User): string[] {
    const permissions = new Set<string>();

    user.permissions?.forEach((permission) => {
      if (permission?.name) {
        permissions.add(permission.name);
      }
    });

    user.roles?.forEach((role) => {
      role.permissions?.forEach((permission) => {
        if (permission?.name) {
          permissions.add(permission.name);
        }
      });
    });

    return Array.from(permissions);
  }

  private resolveDashboardType(permissions: string[]): DashboardType {
    return hasPermission(permissions, 'view_company_dashboard')
      ? 'admin'
      : 'employee';
  }

  private buildPlatformAccessContext(user: User): PlatformAccessContext {
    return {
      scope: 'platform',
      userType: 'OWNER',
      roles: user.roles?.map((role) => role.name) ?? [],
      permissions: this.getDirectPermissions(user),
    };
  }

  private resolveActiveCompany(companies: CompanySummary[]): CompanySummary {
    return companies.find((company) => company.isDefault) ?? companies[0];
  }

  private generatePlatformAuthResponse(
    user: User,
    platformContext: PlatformAccessContext,
  ) {
    const tokens = this.generatePlatformTokenPair(user, platformContext);
    const dashboardType: DashboardType = 'admin';

    return {
      scope: platformContext.scope,
      dashboard_type: dashboardType,
      access_token: tokens.accessToken,
      access_expires_at: tokens.accessExpiresAt,
      refresh_token: tokens.refreshToken,
      refresh_expires_at: tokens.refreshExpiresAt,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        user_type: user.user_type,
        dashboard_type: dashboardType,
        roles: platformContext.roles,
        permissions: platformContext.permissions,
        isTwoFactorEnabled: user.is_two_factor_enabled,
        twoFactorSetupRequired: user.two_factor_setup_required,
      },
    };
  }

  private generateCompanyAuthResponse(
    user: User,
    companyContext: CompanySummary,
    companies: CompanySummary[],
  ) {
    const tokens = this.generateCompanyTokenPair(user, companyContext);
    const dashboardType = this.resolveDashboardType(companyContext.permissions);

    return {
      scope: 'company' as const,
      dashboard_type: dashboardType,
      access_token: tokens.accessToken,
      access_expires_at: tokens.accessExpiresAt,
      refresh_token: tokens.refreshToken,
      refresh_expires_at: tokens.refreshExpiresAt,
      company: {
        id: companyContext.companyId,
        name: companyContext.companyName,
        slug: companyContext.companySlug,
      },
      companies,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        user_type: user.user_type,
        employee_id: companyContext.employeeId,
        employee_no: companyContext.employeeNo,
        my_employee_url: '/employees/me',
        dashboard_type: dashboardType,
        roles: companyContext.roles,
        permissions: companyContext.permissions,
        isTwoFactorEnabled: user.is_two_factor_enabled,
        twoFactorSetupRequired: user.two_factor_setup_required,
        requiresPasswordChange: false,
      },
    };
  }

  private async applyCompanyPasswordChangeRequirement<T extends object>(
    user: User,
    companyId: number,
    response: T,
  ): Promise<T & { requiresPasswordChange: boolean }> {
    const requiresPasswordChange =
      await this.usersService.hasPendingImportedPasswordChange(
        user.id,
        companyId,
      );

    const responseRecord = response as Record<string, unknown>;
    const responseUser =
      typeof responseRecord.user === 'object' && responseRecord.user !== null
        ? (responseRecord.user as Record<string, unknown>)
        : null;

    return {
      ...(response as Record<string, unknown>),
      requiresPasswordChange,
      ...(requiresPasswordChange
        ? {
            message:
              'You must change your temporary password before continuing.',
          }
        : {}),
      ...(responseUser
        ? {
            user: {
              ...responseUser,
              requiresPasswordChange,
            },
          }
        : {}),
    } as T & { requiresPasswordChange: boolean };
  }

  private buildCompanyAccessTokenPayload(
    user: User,
    companyContext: CompanySummary,
  ): AccessTokenPayload {
    const dashboardType = this.resolveDashboardType(companyContext.permissions);

    return {
      sub: user.id,
      email: user.email,
      scope: 'company',
      userType: 'COMPANY_USER',
      dashboardType,
      companyId: companyContext.companyId,
      companySlug: companyContext.companySlug,
      companyName: companyContext.companyName,
      membershipId: companyContext.membershipId,
      employeeId: companyContext.employeeId ?? undefined,
      employeeNo: companyContext.employeeNo ?? undefined,
      roles: companyContext.roles,
      permissions: companyContext.permissions,
      type: 'access',
      iss: this.configService.get<string>('JWT_ISSUER') ?? 'alliance-hrms',
      aud:
        this.configService.get<string>('JWT_AUDIENCE') ?? 'alliance-hrms-web',
      sessionId: randomUUID(),
      device: 'web',
      tokenVersion: user.auth_token_version ?? 0,
    };
  }

  private buildPlatformAccessTokenPayload(
    user: User,
    platformContext: PlatformAccessContext,
  ): AccessTokenPayload {
    return {
      sub: user.id,
      email: user.email,
      scope: platformContext.scope,
      userType: platformContext.userType,
      dashboardType: 'admin',
      roles: platformContext.roles,
      permissions: platformContext.permissions,
      type: 'access',
      iss: this.configService.get<string>('JWT_ISSUER') ?? 'alliance-hrms',
      aud:
        this.configService.get<string>('JWT_AUDIENCE') ?? 'alliance-hrms-web',
      sessionId: randomUUID(),
      device: 'web',
      tokenVersion: user.auth_token_version ?? 0,
    };
  }

  private generateCompanyTokenPair(user: User, companyContext: CompanySummary) {
    const accessPayload = this.buildCompanyAccessTokenPayload(
      user,
      companyContext,
    );
    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.getAccessTokenSecret(),
      expiresIn: this.getAccessTokenExpiration(),
    });

    const refreshToken = this.jwtService.sign<RefreshTokenPayload>(
      {
        sub: user.id,
        scope: 'company',
        userType: 'COMPANY_USER',
        companyId: companyContext.companyId,
        membershipId: companyContext.membershipId,
        type: 'refresh',
        tokenVersion: user.auth_token_version ?? 0,
      },
      {
        secret: this.getRefreshTokenSecret(),
        expiresIn: this.getRefreshTokenExpiration(),
      },
    );

    return {
      accessToken,
      accessExpiresAt: this.getTokenExpiryTimestamp(accessToken),
      refreshToken,
      refreshExpiresAt: this.getTokenExpiryTimestamp(refreshToken),
    };
  }

  private generatePlatformTokenPair(
    user: User,
    platformContext: PlatformAccessContext,
  ) {
    const accessPayload = this.buildPlatformAccessTokenPayload(
      user,
      platformContext,
    );
    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.getAccessTokenSecret(),
      expiresIn: this.getAccessTokenExpiration(),
    });

    const refreshToken = this.jwtService.sign<RefreshTokenPayload>(
      {
        sub: user.id,
        scope: 'platform',
        userType: 'OWNER',
        type: 'refresh',
        tokenVersion: user.auth_token_version ?? 0,
      },
      {
        secret: this.getRefreshTokenSecret(),
        expiresIn: this.getRefreshTokenExpiration(),
      },
    );

    return {
      accessToken,
      accessExpiresAt: this.getTokenExpiryTimestamp(accessToken),
      refreshToken,
      refreshExpiresAt: this.getTokenExpiryTimestamp(refreshToken),
    };
  }

  private getTokenExpiryTimestamp(token: string): number {
    const decoded = this.jwtService.decode<string | { exp?: number } | null>(
      token,
    );

    if (
      !decoded ||
      typeof decoded === 'string' ||
      typeof decoded.exp !== 'number'
    ) {
      throw new InternalServerErrorException(
        'Failed to determine token expiry',
      );
    }

    return decoded.exp * 1000;
  }

  private getTokenBlacklistTtlSeconds(
    token: string,
    fallbackSeconds: number,
  ): number {
    const decoded = this.jwtService.decode<string | { exp?: number } | null>(
      token,
    );

    if (
      !decoded ||
      typeof decoded === 'string' ||
      typeof decoded.exp !== 'number'
    ) {
      return fallbackSeconds;
    }

    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    return ttl > 0 ? ttl : 1;
  }

  private assertTokenStillValid(
    issuedAtSeconds: number | undefined,
    invalidBefore: Date | null,
    message: string,
  ): void {
    if (!issuedAtSeconds || !invalidBefore) {
      return;
    }

    const invalidBeforeSeconds = Math.floor(invalidBefore.getTime() / 1000);
    if (issuedAtSeconds <= invalidBeforeSeconds) {
      throw new UnauthorizedException(message);
    }
  }

  private getAccessTokenSecret(): string {
    return this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  private getAccessTokenExpiration(): StringValue {
    return (this.configService.get<string>('JWT_ACCESS_EXPIRATION') ??
      '15m') as StringValue;
  }

  private getRefreshTokenSecret(): string {
    return this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
  }

  private getRefreshTokenExpiration(): StringValue {
    return (this.configService.get<string>('JWT_REFRESH_EXPIRATION') ??
      '7d') as StringValue;
  }

  private getResetTokenSecret(): string {
    return this.configService.getOrThrow<string>('JWT_RESET_SECRET');
  }

  private buildFrontendAuthUrl(path: string): string {
    const baseUrl =
      this.configService.get<string>('APP_FRONTEND_URL') ??
      this.configService.getOrThrow<string>('APP_URL');

    return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  }

  private isFeatureEnabled(key: string, defaultValue: boolean): boolean {
    const value = this.configService.get<string | boolean>(key);

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      return value.trim().toLowerCase() === 'true';
    }

    return defaultValue;
  }

  private isJwtError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    return [
      'TokenExpiredError',
      'JsonWebTokenError',
      'NotBeforeError',
    ].includes(error.name);
  }

  private async sendSmsNotificationBestEffort(input: {
    code: string;
    module: string;
    recipientPhone?: string | null;
    relatedEntityType?: string | null;
    relatedEntityId?: string | number | null;
    variables?: Record<string, unknown>;
    context?: AuditRequestContext | null;
  }): Promise<void> {
    try {
      await this.smsNotificationManagementService.sendConfiguredNotification({
        code: input.code,
        module: input.module,
        recipientPhone: input.recipientPhone ?? null,
        relatedEntityType: input.relatedEntityType ?? null,
        relatedEntityId: input.relatedEntityId ?? null,
        variables: input.variables,
        context: input.context ?? null,
      });
    } catch (error) {
      this.logger.warn(
        `SMS notification ${input.code} failed during auth flow: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
