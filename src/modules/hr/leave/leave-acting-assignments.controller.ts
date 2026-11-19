import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { PermissionsAny } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import {
  CancelLeaveActingAssignmentDto,
  CheckLeaveActingCandidateDto,
  LeaveActingAssignmentDto,
} from './dtos/leave-acting-assignment.dto';
import { LeaveActingAssignmentService } from './services/leave-acting-assignment.service';

type Req = ExpressRequest & { user: AuthenticatedUser };

const MANAGE = [
  'leave_requests:approve',
  'leave_requests:override',
  'self_service_requests:manager_review',
] as const;

/**
 * Acting employee / leave delegation. Who may appoint is decided per leave
 * request by the service (an approver of the request, or HR); the
 * permissions here only gate the endpoints.
 */
@ApiTags('Leave')
@ApiBearerAuth('access-token')
@Controller('leave')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class LeaveActingAssignmentsController {
  constructor(private readonly acting: LeaveActingAssignmentService) {}

  @Get('requests/:id/acting-assignment')
  @PermissionsAny('leave_requests:read', ...MANAGE)
  @ApiOperation({ summary: 'Current acting employee and history for a leave request' })
  forLeave(@Req() req: Req, @Param('id', ParseIntPipe) id: number) {
    return this.acting.forLeaveRequestAsActor(req.user.companyId!, id, req.user);
  }

  @Put('requests/:id/acting-assignment')
  @PermissionsAny(...MANAGE)
  @ApiOperation({ summary: 'Appoint, update or replace the acting employee' })
  async assign(
    @Req() req: Req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LeaveActingAssignmentDto,
  ) {
    const result = await this.acting.assign(req.user.companyId!, id, dto, req.user);
    return {
      data: await this.acting.view(result.assignment.id),
      warnings: result.warnings,
    };
  }

  @Post('requests/:id/acting-assignment/check')
  @PermissionsAny(...MANAGE)
  @ApiOperation({ summary: 'Validate an acting employee for this leave (no changes)' })
  check(
    @Req() req: Req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CheckLeaveActingCandidateDto,
  ) {
    return this.acting.checkCandidate(
      req.user.companyId!,
      id,
      dto.acting_employee_id,
      dto.start_date,
      dto.end_date,
      req.user,
    );
  }

  @Post('acting-assignments/:id/cancel')
  @PermissionsAny(...MANAGE)
  @ApiOperation({ summary: 'Cancel an acting assignment' })
  cancel(
    @Req() req: Req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelLeaveActingAssignmentDto,
  ) {
    return this.acting.cancel(req.user.companyId!, id, dto.reason, req.user);
  }

  @Get('acting-assignments/employees/:employeeId')
  @PermissionsAny('employees:read', 'leave_requests:read', ...MANAGE)
  @ApiOperation({
    summary: 'Employee profile: current leave cover, acting duties and history',
  })
  forEmployee(
    @Req() req: Req,
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.acting.forEmployee(req.user.companyId!, employeeId, req.user);
  }

  @Get('acting-assignments/directory')
  @PermissionsAny('employees:read', 'leave_requests:read', ...MANAGE)
  @ApiOperation({
    summary:
      'Directory availability: who is on leave today and who acts for them (no reasons or medical detail)',
  })
  async directory(@Req() req: Req, @Query('employee_ids') ids?: string) {
    const employeeIds = [
      ...new Set(
        (ids ?? '')
          .split(',')
          .map((v) => Number(v))
          .filter((v) => Number.isInteger(v) && v > 0),
      ),
    ].slice(0, 500);
    const map = await this.acting.directoryAvailability(
      req.user.companyId!,
      employeeIds,
    );
    return Object.fromEntries(map);
  }
}
