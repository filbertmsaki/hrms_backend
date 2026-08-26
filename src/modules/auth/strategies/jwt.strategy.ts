import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { hasPermission } from '../../../common/utils/permission.util';
import { isDebugModeEnabled } from '../../../common/utils/debug-mode.util';
import { CompaniesService } from '../../companies/companies.service';
import { UsersService } from '../../users/users.service';
import { TokenBlacklistService } from '../token-blacklist.service';
import { Request } from 'express';
import { User } from '../../users/entities/user.entity';
import { AuthSessionsService } from '../auth-sessions.service';

type JwtAccessPayload = {
  sub: number;
  email: string;
  scope?: 'platform' | 'company';
  userType?: 'OWNER' | 'COMPANY_USER';
  dashboardType?: 'admin' | 'employee';
  sessionId?: string;
  companyId?: number;
  companyName?: string;
  companySlug?: string;
  membershipId?: number;
  employeeId?: number;
  employeeNo?: string;
  type?: string;
  iat?: number;
  tokenVersion?: number;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  private buildInternalErrorMessage(error: unknown, fallback: string): string {
    const isProduction = process.env.APP_ENV === 'production';
    const showRealError =
      (!isProduction || isDebugModeEnabled()) && error instanceof Error;

    return showRealError ? error.message : fallback;
  }

  private resolveDashboardType(
    permissions: string[] | undefined,
  ): 'admin' | 'employee' {
    return hasPermission(permissions, 'view_company_dashboard')
      ? 'admin'
      : 'employee';
  }

  private resolveAuthenticatedUserType(
    user: Pick<User, 'user_type'>,
  ): AuthenticatedUser['userType'] {
    return user.user_type === 'OWNER' ? 'OWNER' : 'COMPANY_USER';
  }

  private isPasswordChangeAllowedRoute(req: Request): boolean {
    const method = req.method.toUpperCase();
    const path = (
      req.originalUrl.split('?')[0] ??
      req.path ??
      ''
    ).toLowerCase();

    const matchesRoute = (expectedPath: string) =>
      path === expectedPath || path.endsWith(expectedPath);

    if (method === 'GET' && matchesRoute('/users/me')) {
      return true;
    }

    if (method === 'POST' && matchesRoute('/users/me/change-password')) {
      return true;
    }

    if (method === 'POST' && matchesRoute('/auth/logout')) {
      return true;
    }

    if (method === 'POST' && matchesRoute('/auth/refresh')) {
      return true;
    }

    return false;
  }

  private isTwoFactorSetupAllowedRoute(req: Request): boolean {
    const method = req.method.toUpperCase();
    const path = (
      req.originalUrl.split('?')[0] ??
      req.path ??
      ''
    ).toLowerCase();

    const matches = (expected: string) =>
      path === expected || path.endsWith(expected);

    if (method === 'GET' && matches('/users/me')) {
      return true;
    }

    if (method === 'POST' && matches('/users/2fa/setup')) {
      return true;
    }

    if (method === 'POST' && matches('/users/2fa/verify')) {
      return true;
    }

    if (method === 'POST' && matches('/auth/logout')) {
      return true;
    }

    if (method === 'POST' && matches('/auth/refresh')) {
      return true;
    }

    return false;
  }

  constructor(
    private configService: ConfigService,
    private blacklistService: TokenBlacklistService,
    private readonly companiesService: CompaniesService,
    private readonly usersService: UsersService,
    private readonly authSessionsService: AuthSessionsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    payload: JwtAccessPayload,
  ): Promise<AuthenticatedUser> {
    if (payload.type !== 'access' || !payload.sub || !payload.email) {
      throw new UnauthorizedException('Invalid access token');
    }

    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    const isBlacklisted = await this.blacklistService.isBlacklisted(token);
    if (isBlacklisted) {
      throw new UnauthorizedException('Token has been revoked');
    }

    let user: User;

    try {
      user = await this.usersService.findById(payload.sub);
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(
          `Failed to load user ${payload.sub} during token validation`,
          error instanceof Error ? error.stack : undefined,
        );
        throw new InternalServerErrorException(
          this.buildInternalErrorMessage(error, 'Failed to validate session'),
        );
      }

      throw new UnauthorizedException('User account is no longer available');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('User account is inactive');
    }

    if (
      typeof payload.tokenVersion !== 'number' ||
      payload.tokenVersion !== (user.auth_token_version ?? 0)
    ) {
      throw new UnauthorizedException('Session has been revoked');
    }

    if (
      payload.iat &&
      user.auth_token_invalid_before &&
      payload.iat <= Math.floor(user.auth_token_invalid_before.getTime() / 1000)
    ) {
      throw new UnauthorizedException('Session has been revoked');
    }

    if (payload.sessionId) {
      const activeSession = await this.authSessionsService.findActiveSession(
        user.id,
        payload.sessionId,
      );

      if (!activeSession) {
        const wasReplaced = await this.authSessionsService.wasSessionReplaced(
          user.id,
          payload.sessionId,
        );

        if (wasReplaced) {
          throw new UnauthorizedException({
            statusCode: 401,
            message:
              'Your session ended because this account was signed in on another device.',
            code: 'SESSION_REPLACED',
          });
        }

        throw new UnauthorizedException('Session has been revoked');
      }
    }

    if (payload.scope === 'platform') {
      if (user.user_type !== 'OWNER' || payload.userType !== 'OWNER') {
        throw new UnauthorizedException('Invalid platform access token');
      }

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

      return {
        id: user.id,
        email: user.email,
        scope: 'platform',
        userType: 'OWNER',
        sessionId: payload.sessionId,
        dashboardType: 'admin',
        roles: user.roles?.map((role) => role.name) ?? [],
        permissions: Array.from(permissions),
      };
    }

    const resolvedUserType = this.resolveAuthenticatedUserType(user);

    if (
      payload.scope !== 'company' ||
      payload.userType !== resolvedUserType ||
      !payload.companyId
    ) {
      throw new UnauthorizedException('Invalid company access token');
    }

    const requiresPasswordChange =
      user.must_set_password ||
      (await this.usersService.hasPendingImportedPasswordChange(
        user.id,
        payload.companyId,
      ));
    if (requiresPasswordChange && !this.isPasswordChangeAllowedRoute(req)) {
      throw new UnauthorizedException(
        'You must change your temporary password before continuing.',
      );
    }

    try {
      const companyContext = await this.companiesService.getMembershipContext(
        payload.sub,
        payload.companyId,
      );

      const twoFactorIncomplete =
        user.force_two_factor &&
        (!user.is_two_factor_enabled || user.two_factor_setup_required);

      if (twoFactorIncomplete && !this.isTwoFactorSetupAllowedRoute(req)) {
        throw new UnauthorizedException(
          'Two-factor authentication setup is required before continuing.',
        );
      }

      return {
        id: user.id,
        email: user.email,
        scope: 'company',
        userType: resolvedUserType,
        sessionId: payload.sessionId,
        dashboardType: this.resolveDashboardType(companyContext.permissions),
        companyId: companyContext.companyId,
        companyName: companyContext.companyName,
        companySlug: companyContext.companySlug,
        companyMembershipId: companyContext.membershipId,
        employeeId: companyContext.employeeId ?? undefined,
        employeeNo: companyContext.employeeNo ?? undefined,
        requiresPasswordChange,
        forceTwoFactor: user.force_two_factor,
        roles: companyContext.roles,
        permissions: companyContext.permissions,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new UnauthorizedException(
          'Company access is no longer available',
        );
      }

      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(
        `Failed to load membership context for user ${payload.sub} in company ${payload.companyId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        this.buildInternalErrorMessage(error, 'Failed to validate session'),
      );
    }
  }
}
