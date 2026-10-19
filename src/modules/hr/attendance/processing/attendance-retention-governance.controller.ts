import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import {
  ApiActionOperation,
  ApiCreateOperation,
  ApiListOperation,
} from '../../../../docs/swagger-decorators';
import { AttendanceRetentionGovernanceService } from './attendance-retention-governance.service';
import { CreateAttendanceRetentionHoldDto } from './dtos/create-attendance-retention-hold.dto';
import { ReleaseAttendanceRetentionHoldDto } from './dtos/release-attendance-retention-hold.dto';
import { CreateAttendanceRetentionPurgeApprovalDto } from './dtos/create-attendance-retention-purge-approval.dto';
import { ReviewAttendanceRetentionPurgeApprovalDto } from './dtos/review-attendance-retention-purge-approval.dto';

@ApiTags('Attendance Retention Governance')
@ApiBearerAuth('access-token')
@Controller('attendance/retention-governance')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class AttendanceRetentionGovernanceController {
  constructor(
    private readonly governanceService: AttendanceRetentionGovernanceService,
  ) {}

  @Get('readiness')
  @Permissions('attendance_processing:read')
  getReadiness() {
    return this.governanceService.getReadiness();
  }

  @Get('holds')
  @Permissions('attendance_processing:read')
  @ApiListOperation(
    'Attendance legal holds',
    'List company-scoped retention holds.',
  )
  listHolds(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.governanceService.listHolds(req.user.companyId!);
  }

  @Post('holds')
  @Permissions('attendance_processing:update')
  @ApiCreateOperation(
    'Attendance legal hold',
    'Protect an attendance source log or selfie from retention purge.',
  )
  createHold(
    @Body() dto: CreateAttendanceRetentionHoldDto,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.governanceService.createHold(
      req.user.companyId!,
      req.user.companyMembershipId ?? req.user.id,
      dto,
    );
  }

  @Patch('holds/:id/release')
  @Permissions('attendance_processing:update')
  @ApiActionOperation(
    'Release attendance legal hold',
    'Release a retention hold with an audited reason.',
  )
  releaseHold(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReleaseAttendanceRetentionHoldDto,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.governanceService.releaseHold(
      req.user.companyId!,
      id,
      req.user.companyMembershipId ?? req.user.id,
      dto,
    );
  }

  @Get('purge-approvals')
  @Permissions('attendance_processing:read')
  @ApiListOperation(
    'Attendance purge approvals',
    'List company-scoped attendance purge approval requests.',
  )
  listApprovals(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.governanceService.listPurgeApprovals(req.user.companyId!);
  }

  @Post('purge-approvals')
  @Permissions('attendance_processing:update')
  @ApiCreateOperation(
    'Attendance purge approval request',
    'Request separate approval for one retention purge cycle.',
  )
  requestApproval(
    @Body() dto: CreateAttendanceRetentionPurgeApprovalDto,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.governanceService.requestPurgeApproval(
      req.user.companyId!,
      req.user.companyMembershipId ?? req.user.id,
      dto,
    );
  }

  @Patch('purge-approvals/:id/review')
  @Permissions('attendance_processing:execute')
  @ApiActionOperation(
    'Review attendance purge approval',
    'Approve or reject a one-time retention purge request. The requester cannot approve it.',
  )
  reviewApproval(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewAttendanceRetentionPurgeApprovalDto,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.governanceService.reviewPurgeApproval(
      req.user.companyId!,
      id,
      req.user.companyMembershipId ?? req.user.id,
      dto,
    );
  }
}
