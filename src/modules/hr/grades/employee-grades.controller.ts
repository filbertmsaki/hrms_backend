import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { CreateEmployeeGradeDto } from './dtos/create-employee-grade.dto';
import { UpdateEmployeeGradeDto } from './dtos/update-employee-grade.dto';
import { EmployeeGradesService } from './employee-grades.service';

@Controller('employee-grades')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class EmployeeGradesController {
  constructor(private readonly employeeGradesService: EmployeeGradesService) {}

  @Get()
  @Permissions('employee_grades:read')
  findAll(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.employeeGradesService.findAll(req.user.companyId!);
  }

  @Post()
  @Permissions('employee_grades:create')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateEmployeeGradeDto,
  ) {
    return this.employeeGradesService.create(req.user.companyId!, dto);
  }

  @Get(':id')
  @Permissions('employee_grades:read')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeeGradesService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @Permissions('employee_grades:update')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeGradeDto,
  ) {
    return this.employeeGradesService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @Permissions('employee_grades:delete')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeeGradesService.remove(req.user.companyId!, id);
  }
}
