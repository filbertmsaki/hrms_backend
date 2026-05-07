import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { AddEmployeeDocumentDto } from './dtos/add-employee-document.dto';
import { ChangeEmployeeStatusDto } from './dtos/change-employee-status.dto';
import { CreateEmployeeDto } from './dtos/create-employee.dto';
import { EmployeeQueryDto } from './dtos/employee-query.dto';
import { OnboardEmployeeDto } from './dtos/onboard-employee.dto';
import { UpdateEmployeeDto } from './dtos/update-employee.dto';
import { EmployeesService } from './employees.service';

@ApiTags('HR Employees')
@ApiBearerAuth()
@Controller('hr/employees')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post('onboard')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:onboard')
  @ApiOperation({
    summary: 'Onboard a new employee by creating the company user and HR profile',
  })
  onboard(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() onboardEmployeeDto: OnboardEmployeeDto,
  ) {
    return this.employeesService.onboard(
      req.user.companyId!,
      onboardEmployeeDto,
      req.user,
    );
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('employees:create')
  @ApiOperation({
    summary: 'Create an HR employee profile for an existing company user',
  })
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() createEmployeeDto: CreateEmployeeDto,
  ) {
    return this.employeesService.create(
      req.user.companyId!,
      createEmployeeDto,
      req.user,
    );
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('employees:read')
  @ApiOperation({ summary: 'List employees in the active company' })
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: EmployeeQueryDto,
  ) {
    return this.employeesService.findAll(req.user.companyId!, query, req.user);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:read')
  @ApiOperation({ summary: 'Get a full employee profile by ID' })
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeesService.findOne(req.user.companyId!, id, req.user);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperation({ summary: 'Update an employee profile' })
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
  ) {
    return this.employeesService.update(
      req.user.companyId!,
      id,
      updateEmployeeDto,
      req.user,
    );
  }

  @Patch(':id/status')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:change-status')
  @ApiOperation({ summary: 'Update an employee lifecycle status' })
  changeStatus(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() changeEmployeeStatusDto: ChangeEmployeeStatusDto,
  ) {
    return this.employeesService.changeStatus(
      req.user.companyId!,
      id,
      changeEmployeeStatusDto,
      req.user,
    );
  }

  @Post(':id/documents')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperation({ summary: 'Attach a document to an employee profile' })
  addDocument(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() addEmployeeDocumentDto: AddEmployeeDocumentDto,
  ) {
    return this.employeesService.addDocument(
      req.user.companyId!,
      id,
      addEmployeeDocumentDto,
      req.user,
    );
  }

  @Delete(':employeeId/documents/:documentId')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperation({ summary: 'Remove an employee document' })
  removeDocument(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('documentId', ParseIntPipe) documentId: number,
  ) {
    return this.employeesService.removeDocument(
      req.user.companyId!,
      employeeId,
      documentId,
      req.user,
    );
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:delete')
  @ApiOperation({ summary: 'Delete an employee profile' })
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeesService.remove(req.user.companyId!, id, req.user);
  }
}
