import { PartialType } from '@nestjs/mapped-types';
import { CreateCompanyBankDto } from './create-company-bank.dto';

export class UpdateCompanyBankDto extends PartialType(CreateCompanyBankDto, {
  skipNullProperties: false,
}) {}
