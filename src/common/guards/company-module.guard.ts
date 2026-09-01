import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { COMPANY_MODULE_KEY } from '../decorators/company-module.decorator';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import {
  assertCompanyModuleEnabled,
  CompanyModuleKey,
  resolveCompanyModules,
} from '../utils/company-modules.util';

@Injectable()
export class CompanyModuleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredModule = this.reflector.getAllAndOverride<
      CompanyModuleKey | undefined
    >(COMPANY_MODULE_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredModule) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();
    const user = request.user;

    if (!user || user.scope !== 'company') {
      return true;
    }

    assertCompanyModuleEnabled(
      user.companyModules ?? resolveCompanyModules(undefined),
      requiredModule,
    );

    return true;
  }
}
