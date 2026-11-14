import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import type { Request } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { LeaveCutoverService } from './services/leave-cutover.service';
import {
  leaveToday,
  LeavePolicyRevisionService,
} from './services/leave-policy-revision.service';

class ApproveDraftDto {
  @IsIn(['mainland', 'zanzibar']) jurisdiction: 'mainland' | 'zanzibar';
  @IsString() @MaxLength(500) reason: string;
}
class ReasonDto {
  @IsString() @MaxLength(500) reason: string;
}
class AssignPolicyDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @Type(() => Number)
  @IsInt({ each: true })
  employee_ids: number[];
  @Type(() => Number) @IsInt() policy_id: number;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) effective_date: string;
  @IsString() @MaxLength(500) reason: string;
  @IsOptional() @Type(() => Number) @IsInt() cutover_snapshot_id?: number;
}

type Req2 = Request & { user: AuthenticatedUser };

@ApiTags('Leave')
@ApiBearerAuth('access-token')
@Controller('leave/policy-revisions')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class LeavePolicyRevisionsController {
  constructor(
    private readonly revisions: LeavePolicyRevisionService,
    private readonly cutover: LeaveCutoverService,
  ) {}

  @Get('policy/:policyId')
  @Permissions('leave_policies:read')
  @ApiOperation({ summary: 'List approved (immutable) revisions of a policy' })
  list(@Req() req: Req2, @Param('policyId', ParseIntPipe) policyId: number) {
    return this.revisions.listRevisions(req.user.companyId!, policyId);
  }

  @Post('drafts/:draftId/approve')
  @Permissions('leave_policies:update')
  @ApiOperation({ summary: 'Approve a validated draft as an immutable revision (four-eyes)' })
  approve(@Req() req: Req2, @Param('draftId', ParseIntPipe) draftId: number, @Body() dto: ApproveDraftDto) {
    return this.revisions.approveDraft(req.user.companyId!, draftId, req.user, dto);
  }

  @Post(':revisionId/withdraw')
  @Permissions('leave_policies:update')
  @ApiOperation({ summary: 'Withdraw a not-yet-effective revision' })
  withdraw(@Req() req: Req2, @Param('revisionId', ParseIntPipe) id: number, @Body() dto: ReasonDto) {
    return this.revisions.withdraw(req.user.companyId!, id, req.user, dto.reason);
  }

  @Post('assignments')
  @Permissions('leave_policies:update')
  @ApiOperation({ summary: 'Assign employees to a policy from a date (Mainland requires approved cutover)' })
  assign(@Req() req: Req2, @Body() dto: AssignPolicyDto) {
    return this.revisions.assign(
      req.user.companyId!,
      req.user,
      {
        employeeIds: dto.employee_ids,
        policyId: dto.policy_id,
        effectiveDate: dto.effective_date,
        reason: dto.reason,
        cutoverSnapshotId: dto.cutover_snapshot_id,
      },
      (m, ids, snapshotId, date) =>
        this.cutover.assertActivationAllowed(m, req.user.companyId!, ids, snapshotId, date),
    );
  }

  @Get('assignments/:employeeId')
  @Permissions('leave-balances.view')
  history(@Req() req: Req2, @Param('employeeId', ParseIntPipe) employeeId: number) {
    return this.revisions.assignmentHistory(req.user.companyId!, employeeId);
  }

  @Get('resolve/:employeeId')
  @Permissions('leave-balances.view')
  @ApiOperation({ summary: 'Resolve profile, assignment and revision effective on a date' })
  resolve(@Req() req: Req2, @Param('employeeId', ParseIntPipe) employeeId: number, @Query('as_of') asOf?: string) {
    return this.revisions.resolve(req.user.companyId!, employeeId, asOf ?? leaveToday());
  }

  @Get('missing-profiles')
  @Permissions('leave-balances.manage')
  @ApiOperation({ summary: 'Employees without a leave profile (jurisdiction/FTE) on a date' })
  missing(@Req() req: Req2, @Query('as_of') asOf?: string) {
    return this.revisions.missingProfiles(req.user.companyId!, asOf ?? leaveToday());
  }
}
