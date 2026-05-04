import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import type { StringValue } from 'ms';
import { EntityManager, Repository } from 'typeorm';

import { comparePasswords, hashPassword } from '../../common/utils/hash.util';
import { MailService } from '../mail/mail.service';
import { Role } from '../roles/entities/role.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { TwoFaService } from './2fa/2fa.service';
import { ForgotPasswordDto } from './dtos/forgot-password.dto';
import { LoginDto } from './dtos/login.dto';
import { LogoutDto } from './dtos/logout.dto';
import { RefreshTokenDto } from './dtos/refresh-token.dto';
import { RegisterDto } from './dtos/register.dto';
import { ResetPasswordDto } from './dtos/reset-password.dto';
import { TokenBlacklistService } from './token-blacklist.service';

type AccessTokenPayload = {
  sub: number;
  email: string;
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
  type: 'refresh';
};

type TwoFactorTempTokenPayload = {
  sub: number;
  email: string;
  temp: true;
  type: '2fa-temp';
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

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
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
    const requiresVerification =
      isVerificationEnabled && !user.is_email_verified;

    if (requiresVerification) {
      return {
        requiresEmailVerification: true,
        message: 'Please verify your email address before continuing.',
        userId: user.id,
        email: user.email,
      };
    }

    const is2FAEnabled = await this.twoFaService.is2FARequired(user.id);
    if (is2FAEnabled) {
      const tempToken = this.jwtService.sign<TwoFactorTempTokenPayload>(
        {
          sub: user.id,
          email: user.email,
          temp: true,
          type: '2fa-temp',
        },
        {
          secret: this.getAccessTokenSecret(),
          expiresIn: '5m',
        },
      );

      return {
        requires2FA: true,
        tempToken,
        email: user.email,
        message: 'Password correct. Please provide your 2FA code.',
      };
    }

    await this.usersService.updateLastLogin(user.id, new Date(), ip ?? null);

    return this.generateAuthResponse(user as User);
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

      const user = await this.usersService.findByIdWithRelations(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      if (user.status !== 'active') {
        throw new ForbiddenException(
          'Your account is inactive. Please contact an administrator.',
        );
      }

      await this.usersService.updateLastLogin(user.id, new Date(), ip ?? null);

      return this.generateAuthResponse(user);
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      if (this.isJwtError(error)) {
        throw new UnauthorizedException(
          'Temporary token is invalid or expired. Please log in again.',
        );
      }

      throw error;
    }
  }

  async register(registerDto: RegisterDto) {
    const { email, phone, password, first_name, last_name, ...rest } =
      registerDto;

    const existing = await this.userRepository.findOne({
      where: [{ email }, { phone }],
    });

    if (existing) {
      throw new ConflictException(
        existing.email === email
          ? 'Email already in use'
          : 'Phone already in use',
      );
    }

    const hashedPassword = await hashPassword(password);
    const defaultRole = await this.roleRepository.findOne({
      where: { name: 'viewer' },
    });

    if (!defaultRole) {
      throw new InternalServerErrorException('Default "viewer" role not found');
    }

    const isVerificationEnabled = this.isFeatureEnabled(
      'ENABLE_EMAIL_VERIFICATION',
      true,
    );

    const savedUser = await this.userRepository.manager.transaction(
      async (manager) => {
        const userNo = await this.generateUserNo(manager);

        const newUser = manager.create(User, {
          email,
          phone,
          password: hashedPassword,
          first_name,
          last_name,
          roles: [defaultRole],
          is_email_verified: false,
          status: 'active',
          user_no: userNo,
          ...rest,
        });
        const insertedUser = await manager.save(newUser);

        if (!isVerificationEnabled) {
          return insertedUser;
        }

        const verificationToken = randomUUID();
        const expires = new Date();
        expires.setHours(
          expires.getHours() +
            Number(
              this.configService.get<string>(
                'EMAIL_VERIFICATION_EXPIRY_HOURS',
              ) ?? 24,
            ),
        );

        await manager.update(
          User,
          { id: insertedUser.id },
          {
            email_verification_token: verificationToken,
            email_verification_expires: expires,
          },
        );

        return { ...insertedUser, email_verification_token: verificationToken };
      },
    );

    if (isVerificationEnabled) {
      if (!savedUser.email_verification_token) {
        throw new InternalServerErrorException(
          'Verification token could not be generated.',
        );
      }

      const verifyLink = this.buildFrontendAuthUrl(
        `auth/verify-email?token=${encodeURIComponent(
          savedUser.email_verification_token,
        )}`,
      );

      try {
        await this.mailService.sendEmailVerification(
          savedUser.email,
          savedUser.first_name ?? 'User',
          verifyLink,
        );
      } catch (err) {
        console.error('Failed to send verification email:', err);
      }

      return {
        message:
          'Registration successful! Please check your email to verify your account.',
        requiresVerification: true,
        userId: savedUser.id,
      };
    }

    return this.generateAuthResponse(savedUser as User);
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

      if (payload.type !== 'refresh' || !payload.sub) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const user = await this.usersService.findByIdWithRelations(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      if (user.status !== 'active') {
        throw new ForbiddenException(
          'Your account is inactive. Please contact an administrator.',
        );
      }

      const tokens = this.generateTokenPair(user);

      await this.tokenBlacklistService.addToBlacklist(
        refreshToken,
        this.getTokenBlacklistTtlSeconds(refreshToken, 60),
      );

      return {
        access_token: tokens.accessToken,
        access_expires_at: tokens.accessExpiresAt,
        refresh_token: tokens.refreshToken,
        refresh_expires_at: tokens.refreshExpiresAt,
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        throw error;
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
        expiresIn: '60m',
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
      if (user) {
        try {
          await this.mailService.sendPasswordChangedSuccessEmail(
            user.email,
            user.first_name,
          );
        } catch (err) {
          console.error('Failed to send password changed success email:', err);
        }
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

  private async generateUserNo(manager: EntityManager): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `USER-${year}-`;

    const qb = manager
      .createQueryBuilder(User, 'user')
      .where('user.user_no LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('user.user_no', 'DESC')
      .limit(1)
      .setLock('pessimistic_write');

    const lastUser = await qb.getOne();

    let nextNumber = 1;

    if (lastUser?.user_no) {
      const numPart = lastUser.user_no.substring(prefix.length);
      const parsed = Number(numPart);
      if (!isNaN(parsed)) {
        nextNumber = parsed + 1;
      }
    }

    const padded = String(nextNumber).padStart(5, '0');
    return `${prefix}${padded}`;
  }

  private generateAuthResponse(user: User) {
    const roles = user.roles?.map((role) => role.name) ?? [];
    const permissions = this.getEffectivePermissions(user);
    const tokens = this.generateTokenPair(user, roles, permissions);

    return {
      access_token: tokens.accessToken,
      access_expires_at: tokens.accessExpiresAt,
      refresh_token: tokens.refreshToken,
      refresh_expires_at: tokens.refreshExpiresAt,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        roles,
        permissions,
        isTwoFactorEnabled: user.is_two_factor_enabled,
      },
    };
  }

  private buildAccessTokenPayload(
    user: User,
    roles = user.roles?.map((role) => role.name) ?? [],
    permissions = this.getEffectivePermissions(user),
  ): AccessTokenPayload {
    return {
      sub: user.id,
      email: user.email,
      roles,
      permissions,
      type: 'access',
      iss: this.configService.get<string>('JWT_ISSUER') ?? 'your-app',
      aud:
        this.configService.get<string>('JWT_AUDIENCE') ?? 'your-frontend-app',
      sessionId: randomUUID(),
      device: 'web',
    };
  }

  private generateTokenPair(
    user: User,
    roles = user.roles?.map((role) => role.name) ?? [],
    permissions = this.getEffectivePermissions(user),
  ) {
    const accessPayload = this.buildAccessTokenPayload(
      user,
      roles,
      permissions,
    );
    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.getAccessTokenSecret(),
      expiresIn: this.getAccessTokenExpiration(),
    });

    const refreshToken = this.jwtService.sign<RefreshTokenPayload>(
      {
        sub: user.id,
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

  private getEffectivePermissions(user: User): string[] {
    const perms = new Set<string>();

    if (user.permissions?.length > 0) {
      user.permissions.forEach((permission) => perms.add(permission.name));
    } else if (user.roles?.length > 0) {
      user.roles.forEach((role) => {
        role.permissions?.forEach((permission) => perms.add(permission.name));
      });
    }

    return Array.from(perms);
  }
}
