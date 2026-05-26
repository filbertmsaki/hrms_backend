import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import {
  ApiCreateOperation,
  ApiGetOneOperation,
  ApiUpdateOperation,
} from '../../../../docs/swagger-decorators';
import { CreateEmployeeAccessCredentialDto } from '../dto/create-employee-access-credential.dto';
import { UpdateEmployeeAccessCredentialDto } from '../dto/update-employee-access-credential.dto';
import { EmployeeAccessCredentialsService } from '../service/employee-access-credentials.service';

@ApiTags('Access Control Employee Credentials')
@ApiBearerAuth('access-token')
@Controller('access-control/employees')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class EmployeeAccessCredentialsController {
  constructor(private readonly credentialsService: EmployeeAccessCredentialsService) {}

  @Post(':employeeId/credentials')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_access_credentials:create')
  @ApiCreateOperation('Employee Access Credential', 'Create or replace employee credentials')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: CreateEmployeeAccessCredentialDto,
  ) {
    return this.credentialsService.createOrReplace(req.user.companyId!, employeeId, dto);
  }

  @Patch(':employeeId/credentials')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_access_credentials:update')
  @ApiUpdateOperation('Employee Access Credential', 'Update employee credentials')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: UpdateEmployeeAccessCredentialDto,
  ) {
    return this.credentialsService.update(req.user.companyId!, employeeId, dto);
  }

  @Get(':employeeId/credentials')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_access_credentials:read')
  @ApiGetOneOperation('Employee Access Credential', 'Get employee credentials')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.credentialsService.findOne(req.user.companyId!, employeeId);
  }
}
