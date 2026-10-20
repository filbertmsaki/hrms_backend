import { IsString, MaxLength, MinLength } from 'class-validator';

export class RecordLeaveEncashmentPayrollHandoffDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  reference: string;
}
