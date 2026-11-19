import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';

/**
 * Which slice of leave requests to list.
 * - all: oversight list (company scope sees the company, others their own).
 * - mine: the caller's own requests.
 * - pending_my_approval: requests whose ACTIVE level/cycle has a pending
 *   approval assigned to the caller. Future levels never match.
 * - my_approval_history: requests the caller has already decided on.
 */
export const LEAVE_REQUEST_VIEWS = [
  'all',
  'mine',
  'pending_my_approval',
  'my_approval_history',
] as const;
export type LeaveRequestView = (typeof LEAVE_REQUEST_VIEWS)[number];

export class LeaveRequestQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(LEAVE_REQUEST_VIEWS)
  view?: LeaveRequestView;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  employee_id?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  leave_type_id?: number;

  /** Applicant's primary department. */
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  department_id?: number;

  /** Applicant's primary branch. */
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  branch_id?: number;

  /** Requests from this manager's direct reports or managed department. */
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  manager_employee_id?: number;

  /** Requests currently waiting at this approval level. */
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  approval_level?: number;

  /** Requests whose active level has a pending approval for this member. */
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  current_approver_company_user_id?: number;

  /** A status, or "pending" for every stage still awaiting a decision. */
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsDateString()
  from_date?: string;

  @IsOptional()
  @IsDateString()
  to_date?: string;
}
