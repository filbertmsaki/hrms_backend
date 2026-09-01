import { SetMetadata } from '@nestjs/common';
import { CompanyModuleKey } from '../utils/company-modules.util';

export const COMPANY_MODULE_KEY = 'company_module_key';

export const CompanyModule = (module: CompanyModuleKey) =>
  SetMetadata(COMPANY_MODULE_KEY, module);
