import { IsOptional, IsString } from 'class-validator';

export class EmployeeMovementQueryDto {
  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  movement_type?: string;
}
