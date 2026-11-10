import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { PermissionsAny } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { QuerySelfServiceApprovalDto } from './dtos/query-self-service-approval.dto';
import { ReviewSelfServiceRequestDto } from './dtos/review-self-service-request.dto';
import { EmployeeSelfServiceApprovalService } from './employee-self-service-approval.service';
import { createDownloadStream } from '../../files/file-download.util';

/**
 * HR (approve / final_approve) and line or department managers
 * (manager_review). The service limits managers to their own team.
 */
const SELF_SERVICE_REVIEW_PERMISSIONS = [
  'self_service_requests:approve',
  'self_service_requests:manager_review',
  'self_service_requests:final_approve',
];

@ApiTags('HR Self-Service Approvals')
@ApiBearerAuth('access-token')
@Controller('hr/self-service/approvals')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class EmployeeSelfServiceApprovalController {
  constructor(
    private readonly approvalService: EmployeeSelfServiceApprovalService,
  ) {}

  @Get('attendance-corrections')
  @PermissionsAny(...SELF_SERVICE_REVIEW_PERMISSIONS)
  @ApiOperation({ summary: 'List authorized attendance correction requests' })
  findAttendanceCorrectionRequests(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: QuerySelfServiceApprovalDto,
  ) {
    return this.approvalService.findAttendanceCorrectionRequests(
      req.user,
      query,
    );
  }

  @Get('attendance-corrections/:id')
  @PermissionsAny(...SELF_SERVICE_REVIEW_PERMISSIONS)
  @ApiOperation({ summary: 'Get one authorized attendance correction request' })
  findAttendanceCorrectionRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.approvalService.findAttendanceCorrectionRequest(req.user, id);
  }

  @Get('attendance-corrections/:id/documents/:documentId/download')
  @PermissionsAny(...SELF_SERVICE_REVIEW_PERMISSIONS)
  @ApiOperation({
    summary:
      'Download evidence for an authorized attendance correction request',
  })
  async downloadAttendanceCorrectionEvidence(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('documentId', ParseIntPipe) documentId: number,
  ): Promise<StreamableFile> {
    return createDownloadStream(
      await this.approvalService.downloadAttendanceCorrectionEvidence(
        req.user,
        id,
        documentId,
      ),
    );
  }

  @Post('attendance-corrections/:id/approve')
  @PermissionsAny(...SELF_SERVICE_REVIEW_PERMISSIONS)
  @ApiOperation({
    summary: 'Approve attendance correction and apply to daily summary',
  })
  approveAttendanceCorrectionRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewSelfServiceRequestDto,
  ) {
    return this.approvalService.approveAttendanceCorrectionRequest(
      req.user,
      id,
      dto,
    );
  }

  @Post('attendance-corrections/:id/reject')
  @PermissionsAny(...SELF_SERVICE_REVIEW_PERMISSIONS)
  @ApiOperation({ summary: 'Reject an attendance correction request' })
  rejectAttendanceCorrectionRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewSelfServiceRequestDto,
  ) {
    return this.approvalService.rejectAttendanceCorrectionRequest(
      req.user,
      id,
      dto,
    );
  }

  @Post('attendance-corrections/:id/return')
  @PermissionsAny(...SELF_SERVICE_REVIEW_PERMISSIONS)
  @ApiOperation({
    summary: 'Return an attendance correction request to the employee',
  })
  returnAttendanceCorrectionRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewSelfServiceRequestDto,
  ) {
    return this.approvalService.returnAttendanceCorrectionRequest(
      req.user,
      id,
      dto,
    );
  }

  @Get('profile-updates')
  @PermissionsAny(...SELF_SERVICE_REVIEW_PERMISSIONS)
  @ApiOperation({ summary: 'List profile update requests (HR view)' })
  findProfileUpdateRequests(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: QuerySelfServiceApprovalDto,
  ) {
    return this.approvalService.findProfileUpdateRequests(req.user, query);
  }

  @Get('profile-updates/:id')
  @PermissionsAny(...SELF_SERVICE_REVIEW_PERMISSIONS)
  @ApiOperation({ summary: 'Get one profile update request (HR view)' })
  findProfileUpdateRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.approvalService.findProfileUpdateRequest(req.user, id);
  }

  @Post('profile-updates/:id/approve')
  @PermissionsAny(...SELF_SERVICE_REVIEW_PERMISSIONS)
  @ApiOperation({
    summary: 'Approve profile update and apply changes to employee record',
  })
  approveProfileUpdateRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewSelfServiceRequestDto,
  ) {
    return this.approvalService.approveProfileUpdateRequest(req.user, id, dto);
  }

  @Post('profile-updates/:id/reject')
  @PermissionsAny(...SELF_SERVICE_REVIEW_PERMISSIONS)
  @ApiOperation({ summary: 'Reject a profile update request' })
  rejectProfileUpdateRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewSelfServiceRequestDto,
  ) {
    return this.approvalService.rejectProfileUpdateRequest(req.user, id, dto);
  }

  @Post('profile-updates/:id/return')
  @PermissionsAny(...SELF_SERVICE_REVIEW_PERMISSIONS)
  @ApiOperation({ summary: 'Return a profile update request to the employee' })
  returnProfileUpdateRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewSelfServiceRequestDto,
  ) {
    return this.approvalService.returnProfileUpdateRequest(req.user, id, dto);
  }
}
