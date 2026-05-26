import { PartialType } from '@nestjs/mapped-types';
import { CreateEmployeeAccessCredentialDto } from './create-employee-access-credential.dto';

export class UpdateEmployeeAccessCredentialDto extends PartialType(CreateEmployeeAccessCredentialDto) {}
