import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseArrayPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { EmployeeWorkSchedulesService } from './employee-work-schedules.service';
import { UpsertEmployeeWorkScheduleDto } from './dtos/upsert-employee-work-schedule.dto';
import { EmployeeWorkSchedule } from './entities/employee-work-schedule.entity';

@ApiTags('Generated Employee Schedules')
@ApiBearerAuth('access-token')
@Controller('attendance/schedules/generated-schedules')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class EmployeeWorkSchedulesController {
  constructor(private readonly service: EmployeeWorkSchedulesService) {}
  @Get() @UseGuards(PermissionsGuard) @Permissions('shift_schedules:read') list(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query('from_date') from?: string,
    @Query('to_date') to?: string,
    @Query('employee_id') employee?: string,
  ) {
    return this.service.findAll(
      req.user.companyId!,
      from,
      to,
      employee ? Number(employee) : undefined,
    );
  }
  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_schedules:read')
  findOne(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.findOne(req.user.companyId!, id);
  }
  @Get(':id/audit')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_schedules:read')
  audit(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.listAudit(req.user.companyId!, id);
  }
  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('shift_schedules:create')
  upsert(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() dto: UpsertEmployeeWorkScheduleDto,
  ) {
    return this.service.upsert(req.user.companyId!, req.user.id, dto);
  }
  @Post('bulk')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_schedules:create')
  bulkUpsert(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body(new ParseArrayPipe({ items: UpsertEmployeeWorkScheduleDto }))
    dtos: UpsertEmployeeWorkScheduleDto[],
  ): Promise<EmployeeWorkSchedule[]> {
    return this.service.bulkUpsert(req.user.companyId!, req.user.id, dtos);
  }
  @Patch(':id/publish')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_schedules:update')
  publish(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.publish(req.user.companyId!, req.user.id, id);
  }
  @Patch(':id/unpublish')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_schedules:update')
  unpublish(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.unpublish(req.user.companyId!, req.user.id, id);
  }
  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_schedules:update')
  update(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertEmployeeWorkScheduleDto,
  ): Promise<EmployeeWorkSchedule> {
    return this.service.update(req.user.companyId!, req.user.id, id, dto);
  }
  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_schedules:delete')
  remove(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.remove(req.user.companyId!, req.user.id, id);
  }
}
