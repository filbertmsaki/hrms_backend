import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveEmployeeMovementDto {
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  comments?: string;
}

export class RejectEmployeeMovementDto {
  @IsString()
  @MaxLength(2000)
  comments: string;
}

export class ReturnEmployeeMovementDto {
  @IsString()
  @MaxLength(2000)
  comments: string;
}
