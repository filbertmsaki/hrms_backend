import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * AUTH_REQUIRED_2FA_ROLES only drives a non-blocking recommendation for
 * users in those roles. Actual mandatory enforcement is controlled per
 * individual user via User.force_two_factor.
 */
@Injectable()
export class TwoFactorPolicyService {
  private readonly recommendedRoles: Set<string>;

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

    this.recommendedRoles = new Set(
      configuredRoles
        .split(',')
        .map((role) => role.trim().toUpperCase())
        .filter(Boolean),
    );
  }

  /**
   * Whether users holding any of these roles should be shown a
   * recommendation to enable 2FA. Does not block access.
   */
  isRecommended(roles: string[]): boolean {
    return roles.some((role) => this.recommendedRoles.has(role.toUpperCase()));
  }

  assertCanDisable(forceTwoFactor: boolean): void {
    if (forceTwoFactor) {
      throw new ForbiddenException(
        'Two-factor authentication is mandatory for this account',
      );
    }
  }
}
