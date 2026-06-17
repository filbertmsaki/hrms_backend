import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Request as ExpressRequest, Response } from 'express';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { CancelLeaveRequestDto } from '../leave/dtos/cancel-leave-request.dto';
import { LeaveBalanceQueryDto } from '../leave/dtos/leave-balance-query.dto';
import { LeaveRequestQueryDto } from '../leave/dtos/leave-request-query.dto';
import { AttendanceMobilePunchQueryDto } from '../attendance/mobile-punches/dtos/attendance-mobile-punch-query.dto';
import { QueryAttendanceDailySummariesDto } from '../attendance/processing/dtos/query-attendance-daily-summaries.dto';
import { CreateMyLeaveRequestDto } from './dtos/create-my-leave-request.dto';
import { MyScheduleQueryDto } from './dtos/my-schedule-query.dto';
import { EmployeeSelfServiceService } from './employee-self-service.service';

@ApiTags('Employee Self Service')
@ApiBearerAuth('access-token')
@Controller('me')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class EmployeeSelfServiceController {
  constructor(
    private readonly employeeSelfServiceService: EmployeeSelfServiceService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get my dashboard overview' })
  getDashboard(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.employeeSelfServiceService.getDashboard(req.user);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get my combined user and employee profile' })
  getProfile(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.employeeSelfServiceService.getProfile(req.user);
  }

  @Get('status')
  @ApiOperation({ summary: 'Get my current employment and attendance status' })
  getStatus(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.employeeSelfServiceService.getStatus(req.user);
  }

  @Get('attendance/today')
  @ApiOperation({ summary: 'Get my attendance state for today' })
  getTodayAttendance(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.employeeSelfServiceService.getTodayAttendance(req.user);
  }

  @Get('attendance/history')
  @ApiOperation({ summary: 'Get my attendance history' })
  getAttendanceHistory(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: QueryAttendanceDailySummariesDto,
  ) {
    return this.employeeSelfServiceService.getAttendanceHistory(
      req.user,
      query,
    );
  }

  @Get('attendance/punches')
  @ApiOperation({ summary: 'Get my attendance punch history' })
  getAttendancePunches(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: AttendanceMobilePunchQueryDto,
  ) {
    return this.employeeSelfServiceService.getAttendancePunches(
      req.user,
      query,
    );
  }

  @Get('attendance/schedule')
  @ApiOperation({ summary: 'Get my schedule preview' })
  getAttendanceSchedule(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: MyScheduleQueryDto,
  ) {
    return this.employeeSelfServiceService.getAttendanceSchedule(
      req.user,
      query,
    );
  }

  @Get('leave/balances')
  @ApiOperation({ summary: 'Get my leave balances' })
  getLeaveBalances(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: LeaveBalanceQueryDto,
  ) {
    return this.employeeSelfServiceService.getLeaveBalances(req.user, query);
  }

  @Get('leave/requests')
  @ApiOperation({ summary: 'Get my leave requests' })
  getLeaveRequests(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: LeaveRequestQueryDto,
  ) {
    return this.employeeSelfServiceService.getLeaveRequests(req.user, query);
  }

  @Get('leave/requests/:id')
  @ApiOperation({ summary: 'Get my leave request by id' })
  getLeaveRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeeSelfServiceService.getLeaveRequest(req.user, id);
  }

  @Post('leave/requests')
  @ApiOperation({ summary: 'Create my leave request' })
  createLeaveRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateMyLeaveRequestDto,
  ) {
    return this.employeeSelfServiceService.createLeaveRequest(req.user, dto);
  }

  @Post('leave/requests/:id/submit')
  @ApiOperation({ summary: 'Submit my leave request' })
  submitLeaveRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeeSelfServiceService.submitLeaveRequest(req.user, id);
  }

  @Post('leave/requests/:id/cancel')
  @ApiOperation({ summary: 'Cancel my leave request' })
  cancelLeaveRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelLeaveRequestDto,
  ) {
    return this.employeeSelfServiceService.cancelLeaveRequest(
      req.user,
      id,
      dto,
    );
  }

  @Get('leave/requests/:id/pdf')
  @ApiOperation({ summary: 'Generate my leave request PDF' })
  async getLeaveRequestPdf(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const buffer = await this.employeeSelfServiceService.getLeaveRequestPdf(
      req.user,
      id,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename=my-leave-request-${id}.pdf`,
    );
    res.send(buffer);
  }
}
