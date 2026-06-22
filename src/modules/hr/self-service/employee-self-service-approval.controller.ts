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
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { QuerySelfServiceApprovalDto } from './dtos/query-self-service-approval.dto';
import { ReviewSelfServiceRequestDto } from './dtos/review-self-service-request.dto';
import { EmployeeSelfServiceApprovalService } from './employee-self-service-approval.service';

@ApiTags('HR Self-Service Approvals')
@ApiBearerAuth('access-token')
@Controller('hr/self-service/approvals')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class EmployeeSelfServiceApprovalController {
  constructor(
    private readonly approvalService: EmployeeSelfServiceApprovalService,
  ) {}

  @Get('attendance-corrections')
  @Permissions('self_service_requests:approve')
  @ApiOperation({ summary: 'List attendance correction requests (HR view)' })
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
  @Permissions('self_service_requests:approve')
  @ApiOperation({ summary: 'Get one attendance correction request (HR view)' })
  findAttendanceCorrectionRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.approvalService.findAttendanceCorrectionRequest(req.user, id);
  }

  @Post('attendance-corrections/:id/approve')
  @Permissions('self_service_requests:approve')
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
  @Permissions('self_service_requests:approve')
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

  @Get('profile-updates')
  @Permissions('self_service_requests:approve')
  @ApiOperation({ summary: 'List profile update requests (HR view)' })
  findProfileUpdateRequests(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: QuerySelfServiceApprovalDto,
  ) {
    return this.approvalService.findProfileUpdateRequests(req.user, query);
  }

  @Get('profile-updates/:id')
  @Permissions('self_service_requests:approve')
  @ApiOperation({ summary: 'Get one profile update request (HR view)' })
  findProfileUpdateRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.approvalService.findProfileUpdateRequest(req.user, id);
  }

  @Post('profile-updates/:id/approve')
  @Permissions('self_service_requests:approve')
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
  @Permissions('self_service_requests:approve')
  @ApiOperation({ summary: 'Reject a profile update request' })
  rejectProfileUpdateRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewSelfServiceRequestDto,
  ) {
    return this.approvalService.rejectProfileUpdateRequest(req.user, id, dto);
  }
}
