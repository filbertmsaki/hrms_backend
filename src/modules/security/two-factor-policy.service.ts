import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
        'HR_OFFICER',
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

  isRecommended(roles: string[], permissions: string[] = []): boolean {
    return (
      roles.some((role) => this.recommendedRoles.has(role.toUpperCase())) ||
      permissions.some(
        (permission) =>
          permission.startsWith('payroll:') && permission !== 'payroll:self',
      )
    );
  }

  isRequired(roles: string[], permissions: string[] = []): boolean {
    void roles;
    void permissions;
    return false;
  }

  assertCanDisable(forceTwoFactor: boolean): void {
    void forceTwoFactor;
    return;
  }
}
