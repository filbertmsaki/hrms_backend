import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { EmployeeInvitationStatus } from '../enums/employee-invitation.enum';

export const INVITATION_HISTORY_STATUSES = [
  'all',
  EmployeeInvitationStatus.PENDING,
  EmployeeInvitationStatus.ACCEPTED,
  EmployeeInvitationStatus.EXPIRED,
  EmployeeInvitationStatus.CANCELLED,
] as const;

export type InvitationHistoryStatus =
  (typeof INVITATION_HISTORY_STATUSES)[number];

export class ListEmployeeInvitationsQueryDto {
  @ApiPropertyOptional({
    enum: INVITATION_HISTORY_STATUSES,
    default: 'all',
    description:
      'Effective status. "expired" includes pending invitations already past expiry.',
  })
  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(INVITATION_HISTORY_STATUSES)
  status?: InvitationHistoryStatus = 'all';

  @ApiPropertyOptional({ description: 'Name, email or phone' })
  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;
}
