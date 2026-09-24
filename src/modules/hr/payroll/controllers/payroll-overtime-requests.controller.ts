import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import {
  CreatePayrollOvertimeRequestDto,
  DecidePayrollOvertimeRequestDto,
} from '../dto/payroll-overtime-request.dto';
import { PayrollOvertimeRequestService } from '../services/payroll-overtime-request.service';

type AuthedRequest = Request & { user: AuthenticatedUser };

@ApiTags('Payroll Overtime Requests')
@ApiBearerAuth('access-token')
@Controller('payroll/overtime-requests')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class PayrollOvertimeRequestsController {
  constructor(private readonly service: PayrollOvertimeRequestService) {}

  @Post('me')
  create(
    @Req() req: AuthedRequest,
    @Body() dto: CreatePayrollOvertimeRequestDto,
  ) {
    return this.service.create(req.user, dto);
  }

  @Get('me')
  listMine(@Req() req: AuthedRequest) {
    return this.service.listMine(req.user);
  }

  @Get('manager')
  listManager(@Req() req: AuthedRequest) {
    return this.service.listManager(req.user);
  }

  @Post('manager/:id/approve')
  approveManager(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecidePayrollOvertimeRequestDto,
  ) {
    return this.service.decideManager(req.user, id, true, dto);
  }

  @Post('manager/:id/reject')
  rejectManager(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecidePayrollOvertimeRequestDto,
  ) {
    return this.service.decideManager(req.user, id, false, dto);
  }

  @Get('hr')
  @Permissions('leave_requests:approve')
  listHr(@Req() req: AuthedRequest) {
    return this.service.listHr(req.user);
  }

  @Post('hr/:id/approve')
  @Permissions('leave_requests:approve')
  approveHr(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecidePayrollOvertimeRequestDto,
  ) {
    return this.service.decideHr(req.user, id, true, dto);
  }

  @Post('hr/:id/reject')
  @Permissions('leave_requests:approve')
  rejectHr(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecidePayrollOvertimeRequestDto,
  ) {
    return this.service.decideHr(req.user, id, false, dto);
  }

  @Get('payroll')
  @Permissions('payroll:inputs:read')
  listPayroll(@Req() req: AuthedRequest) {
    return this.service.listPayroll(req.user);
  }
}
