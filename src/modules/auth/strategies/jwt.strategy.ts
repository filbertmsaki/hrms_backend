import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { CompaniesService } from '../../companies/companies.service';
import { UsersService } from '../../users/users.service';
import { TokenBlacklistService } from '../token-blacklist.service';
import { Request } from 'express';

type JwtAccessPayload = {
  sub: number;
  email: string;
  scope?: 'platform' | 'company';
  userType?: 'OWNER' | 'COMPANY_USER';
  companyId?: number;
  companyName?: string;
  companySlug?: string;
  membershipId?: number;
  employeeId?: number;
  employeeNo?: string;
  roles?: string[];
  permissions?: string[];
  type?: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private configService: ConfigService,
    private blacklistService: TokenBlacklistService,
    private readonly companiesService: CompaniesService,
    private readonly usersService: UsersService,
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

    let user;

    try {
      user = await this.usersService.findById(payload.sub);
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(
          `Failed to load user ${payload.sub} during token validation`,
          error instanceof Error ? error.stack : undefined,
        );
        throw new InternalServerErrorException('Failed to validate session');
      }

      throw new UnauthorizedException('User account is no longer available');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('User account is inactive');
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
        roles: user.roles?.map((role) => role.name) ?? [],
        permissions: Array.from(permissions),
      };
    }

    if (
      payload.scope !== 'company' ||
      payload.userType !== 'COMPANY_USER' ||
      user.user_type === 'OWNER' ||
      !payload.companyId
    ) {
      throw new UnauthorizedException('Invalid company access token');
    }

    try {
      const companyContext = await this.companiesService.getMembershipContext(
        payload.sub,
        payload.companyId,
      );

      return {
        id: user.id,
        email: user.email,
        scope: 'company',
        userType: 'COMPANY_USER',
        companyId: companyContext.companyId,
        companyName: companyContext.companyName,
        companySlug: companyContext.companySlug,
        companyMembershipId: companyContext.membershipId,
        employeeId: companyContext.employeeId ?? undefined,
        employeeNo: companyContext.employeeNo ?? undefined,
        roles: companyContext.roles,
        permissions: companyContext.permissions,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        // Keep current access token usable until expiry when non-security DB
        // changes temporarily break membership context resolution.
        if (!payload.membershipId) {
          throw new UnauthorizedException('Company access is no longer available');
        }

        this.logger.warn(
          `Falling back to token company context for user ${payload.sub} in company ${payload.companyId}`,
        );

        return {
          id: user.id,
          email: user.email,
          scope: 'company',
          userType: 'COMPANY_USER',
          companyId: payload.companyId,
          companyName: payload.companyName,
          companySlug: payload.companySlug,
          companyMembershipId: payload.membershipId,
          employeeId: payload.employeeId ?? undefined,
          employeeNo: payload.employeeNo ?? undefined,
          roles: payload.roles ?? [],
          permissions: payload.permissions ?? [],
        };
      }

      this.logger.error(
        `Failed to load membership context for user ${payload.sub} in company ${payload.companyId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException('Failed to validate session');
    }
  }
}
