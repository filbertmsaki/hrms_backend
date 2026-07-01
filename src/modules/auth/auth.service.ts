import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import type { StringValue } from 'ms';

import {
  AuthScope,
  UserType,
} from '../../common/interfaces/authenticated-user.interface';
import { comparePasswords, hashPassword } from '../../common/utils/hash.util';
import { CompaniesService } from '../companies/companies.service';
import {
  CompanyMembershipContext,
  CompanySummary,
} from '../companies/interfaces/company-membership-context.interface';
import { MailService } from '../mail/mail.service';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
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
};

type RefreshTokenPayload = {
  sub: number;
  scope: AuthScope;
  userType: UserType;
  companyId?: number;
  membershipId?: number;
  type: 'refresh';
};

type TwoFactorTempTokenPayload = {
  sub: number;
  email: string;
  scope: AuthScope;
  userType: UserType;
  companyId?: number;
  temp: true;
  type: '2fa-temp';
};

type PlatformAccessContext = {
  scope: 'platform';
  userType: 'OWNER';
  roles: string[];
  permissions: string[];
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly mailService: MailService,
    private readonly twoFaService: TwoFaService,
    private readonly companiesService: CompaniesService,
  ) {}

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
    return result;
  }

  async login(loginDto: LoginDto, ip?: string) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'active') {
      throw new ForbiddenException(
        'Your account is inactive. Please contact an administrator.',
      );
    }

    const isVerificationEnabled = this.isFeatureEnabled(
      'ENABLE_EMAIL_VERIFICATION',
      true,
    );
    if (isVerificationEnabled && !user.is_email_verified) {
      return {
        requiresEmailVerification: true,
        message: 'Please verify your email address before continuing.',
        userId: user.id,
        email: user.email,
      };
    }

    if (this.isOwnerUser(user)) {
      const platformContext = this.buildPlatformAccessContext(user as User);
      const is2FAEnabled = await this.twoFaService.is2FARequired(user.id);

      if (is2FAEnabled) {
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

        return {
          requires2FA: true,
          tempToken,
          message: 'Password verified. Please provide your 2FA code.',
        };
      }

      await this.usersService.updateLastLogin(user.id, new Date(), ip ?? null);
      return this.generatePlatformAuthResponse(user as User, platformContext);
    }

    const companies = await this.companiesService.listUserCompanies(user.id);
    if (!companies.length) {
      throw new ForbiddenException(
        'You do not belong to any active company in this system.',
      );
    }

    const activeCompany = this.resolveActiveCompany(companies);

    const is2FAEnabled = await this.twoFaService.is2FARequired(user.id);
    if (is2FAEnabled) {
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

      return {
        requires2FA: true,
        tempToken,
        company: activeCompany,
        companies,
        message: 'Password verified. Please provide your 2FA code.',
      };
    }

    await this.usersService.updateLastLogin(user.id, new Date(), ip ?? null);
    const activeCompanyContext =
      await this.companiesService.setActiveMembership(
        user.id,
        activeCompany.companyId,
      );
    const availableCompanies = await this.companiesService.listUserCompanies(
      user.id,
    );

    return this.generateCompanyAuthResponse(
      user as User,
      activeCompanyContext,
      availableCompanies,
    );
  }

  async complete2FALogin(tempToken: string, code: string, ip?: string) {
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

      const isValid = await this.twoFaService.verify2FALogin(payload.sub, code);
      if (!isValid) {
        throw new UnauthorizedException('Invalid 2FA code');
      }

      const user = await this.usersService.findById(payload.sub);
      if (user.status !== 'active') {
        throw new ForbiddenException(
          'Your account is inactive. Please contact an administrator.',
        );
      }

      await this.usersService.updateLastLogin(user.id, new Date(), ip ?? null);

      if (payload.scope === 'platform') {
        if (!this.isOwnerUser(user) || payload.userType !== 'OWNER') {
          throw new UnauthorizedException('Invalid platform login context');
        }

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

      return this.generateCompanyAuthResponse(user, companyContext, companies);
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
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

  async switchCompany(userId: number, companyId: number, ip?: string) {
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

    await this.usersService.updateLastLogin(userId, new Date(), ip ?? null);
    const companies = await this.companiesService.listUserCompanies(userId);

    return this.generateCompanyAuthResponse(user, companyContext, companies);
  }

  async refreshTokens(refreshTokenDto: RefreshTokenDto) {
    const refreshToken = refreshTokenDto.refresh_token;

    if (await this.tokenBlacklistService.isBlacklisted(refreshToken)) {
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

      if (payload.scope === 'platform') {
        if (!this.isOwnerUser(user) || payload.userType !== 'OWNER') {
          throw new UnauthorizedException('Invalid platform refresh token');
        }

        await this.tokenBlacklistService.addToBlacklist(
          refreshToken,
          this.getTokenBlacklistTtlSeconds(refreshToken, 60),
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

      let companyContext: CompanySummary;

      try {
        companyContext = await this.companiesService.getMembershipContext(
          payload.sub,
          payload.companyId,
        );
      } catch (error) {
        if (!(error instanceof NotFoundException)) {
          throw error;
        }

        companyContext =
          companies.find((company) => company.isDefault) ?? companies[0];
      }

      await this.tokenBlacklistService.addToBlacklist(
        refreshToken,
        this.getTokenBlacklistTtlSeconds(refreshToken, 60),
      );

      return this.generateCompanyAuthResponse(user, companyContext, companies);
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
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

  async logout(logoutDto: LogoutDto, accessToken?: string) {
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

    return { message: 'Successfully logged out' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
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

    return { message: 'If the email exists, you will receive a reset link' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    try {
      const payload = this.jwtService.verify(dto.token, {
        secret: this.getResetTokenSecret(),
      });

      if (payload.type !== 'password_reset') {
        throw new BadRequestException('Invalid reset token');
      }

      const hashed = await hashPassword(dto.new_password);
      await this.usersService.updatePassword(payload.sub, hashed);

      const user = await this.usersService.findById(payload.sub);
      try {
        await this.mailService.sendPasswordChangedSuccessEmail(
          user.email,
          user.first_name,
        );
      } catch (err) {
        console.error('Failed to send password changed success email:', err);
      }

      return { message: 'Password has been reset successfully' };
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

  async verifyEmail(token: string) {
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

    return {
      scope: platformContext.scope,
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
        roles: platformContext.roles,
        permissions: platformContext.permissions,
        isTwoFactorEnabled: user.is_two_factor_enabled,
      },
    };
  }

  private generateCompanyAuthResponse(
    user: User,
    companyContext: CompanySummary,
    companies: CompanySummary[],
  ) {
    const tokens = this.generateCompanyTokenPair(user, companyContext);

    return {
      scope: 'company' as const,
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
        roles: companyContext.roles,
        permissions: companyContext.permissions,
        isTwoFactorEnabled: user.is_two_factor_enabled,
      },
    };
  }

  private buildCompanyAccessTokenPayload(
    user: User,
    companyContext: CompanySummary,
  ): AccessTokenPayload {
    return {
      sub: user.id,
      email: user.email,
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: companyContext.companyId,
      companySlug: companyContext.companySlug,
      companyName: companyContext.companyName,
      membershipId: companyContext.membershipId,
      employeeId: companyContext.employeeId ?? undefined,
      employeeNo: companyContext.employeeNo ?? undefined,
      roles: companyContext.roles,
      permissions: companyContext.permissions,
      type: 'access',
      iss: this.configService.get<string>('JWT_ISSUER') ?? 'your-app',
      aud:
        this.configService.get<string>('JWT_AUDIENCE') ?? 'your-frontend-app',
      sessionId: randomUUID(),
      device: 'web',
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
      roles: platformContext.roles,
      permissions: platformContext.permissions,
      type: 'access',
      iss: this.configService.get<string>('JWT_ISSUER') ?? 'your-app',
      aud:
        this.configService.get<string>('JWT_AUDIENCE') ?? 'your-frontend-app',
      sessionId: randomUUID(),
      device: 'web',
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
    const decoded = this.jwtService.decode(token);

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
    const decoded = this.jwtService.decode(token);

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

}
