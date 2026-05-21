import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../../common/interfaces/authenticated-user.interface';
import { ApiCreateOperation, ApiDeleteOperation, ApiGetOneOperation, ApiListOperation, ApiUpdateOperation } from '../../../../../docs/swagger-decorators';
import { EmployeeTimetablesService } from './employee-timetables.service';
import { CreateEmployeeTimetableDto } from './dtos/create-employee-timetable.dto';
import { UpdateEmployeeTimetableDto } from './dtos/update-employee-timetable.dto';
import { EmployeeTimetableQueryDto } from './dtos/employee-timetable-query.dto';

@ApiTags('Employee Timetables')
@ApiBearerAuth('access-token')
@Controller('timetable/employee-timetables')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class EmployeeTimetablesController {
  constructor(private readonly employeeTimetablesService: EmployeeTimetablesService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('employee_timetables:create')
  @ApiCreateOperation('Employee Timetable', 'Create employee timetable')
  create(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Body() dto: CreateEmployeeTimetableDto) {
    return this.employeeTimetablesService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('employee_timetables:read')
  @ApiListOperation('Employee Timetable', 'List employee timetables')
  findAll(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Query() query: EmployeeTimetableQueryDto) {
    return this.employeeTimetablesService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_timetables:read')
  @ApiGetOneOperation('Employee Timetable', 'Get employee timetable by ID')
  findOne(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number) {
    return this.employeeTimetablesService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_timetables:update')
  @ApiUpdateOperation('Employee Timetable', 'Update employee timetable')
  update(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEmployeeTimetableDto) {
    return this.employeeTimetablesService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_timetables:delete')
  @ApiDeleteOperation('Employee Timetable', 'Delete employee timetable')
  remove(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number) {
    return this.employeeTimetablesService.remove(req.user.companyId!, id);
  }
}
