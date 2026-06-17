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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { CreateEmployeeDesignationDto } from './dtos/create-employee-designation.dto';
import { EmployeeDesignationQueryDto } from './dtos/employee-designation-query.dto';
import { UpdateEmployeeDesignationDto } from './dtos/update-employee-designation.dto';
import { EmployeeDesignationsService } from './employee-designations.service';
import {
  ApiCreateOperation,
  ApiGetOneOperation,
  ApiListOperation,
  ApiUpdateOperation,
  ApiDeleteOperation,
} from '../../../docs/swagger-decorators';

@ApiTags('Employee Designations')
@ApiBearerAuth('access-token')
@Controller('employee-designations')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class EmployeeDesignationsController {
  constructor(
    private readonly employeeDesignationsService: EmployeeDesignationsService,
  ) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiCreateOperation(
    'Employee Designation',
    'Create an employee designation assignment',
  )
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateEmployeeDesignationDto,
  ) {
    return this.employeeDesignationsService.create(
      req.user.companyId!,
      dto,
      req.user,
    );
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('employees:read')
  @ApiListOperation(
    'Employee Designation',
    'List employee designation assignments',
  )
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: EmployeeDesignationQueryDto,
  ) {
    return this.employeeDesignationsService.findAll(
      req.user.companyId!,
      query,
      req.user,
    );
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:read')
  @ApiGetOneOperation(
    'Employee Designation',
    'Get one employee designation assignment',
  )
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeeDesignationsService.findOne(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiUpdateOperation(
    'Employee Designation',
    'Update an employee designation assignment',
  )
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeDesignationDto,
  ) {
    return this.employeeDesignationsService.update(
      req.user.companyId!,
      id,
      dto,
      req.user,
    );
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiDeleteOperation(
    'Employee Designation',
    'Delete an employee designation assignment',
  )
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeeDesignationsService.remove(
      req.user.companyId!,
      id,
      req.user,
    );
  }
}
