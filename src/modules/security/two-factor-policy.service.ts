import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TwoFactorPolicyService {
  private readonly protectedRoles: Set<string>;

  constructor(configService: ConfigService) {
    const configuredRoles =
      configService.get<string>('AUTH_REQUIRED_2FA_ROLES') ??
      [
        'SUPER_ADMIN',
        'PLATFORM_ADMINISTRATOR',
        'COMPANY_ADMIN',
        'HR_MANAGER',
        'IT_ADMIN',
        'AUDITOR',
      ].join(',');

    this.protectedRoles = new Set(
      configuredRoles
        .split(',')
        .map((role) => role.trim().toUpperCase())
        .filter(Boolean),
    );
  }

  isRequired(roles: string[]): boolean {
    return roles.some((role) => this.protectedRoles.has(role.toUpperCase()));
  }

  assertCanDisable(roles: string[]): void {
    if (this.isRequired(roles)) {
      throw new ForbiddenException(
        'Two-factor authentication is mandatory for this role',
      );
    }
  }
}
