import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { CurrentAuditContext } from '../../../common/decorators/audit-request-context.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import type { AuditRequestContext } from '../../../common/interfaces/audit-request-context.interface';
import { ConfigureEmployeeNumberDto } from './dtos/configure-employee-number.dto';
import { EmployeeNumberService } from './employee-number.service';

@Controller('employee-numbering')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class EmployeeNumberController {
  constructor(
    private readonly employeeNumberService: EmployeeNumberService,
  ) {}

  @Get()
  @Permissions('employee_numbering:read')
  getConfiguration(
    @Req()
    request: Request & { user: AuthenticatedUser },
  ) {
    return this.employeeNumberService.getConfiguration(request.user.companyId!);
  }

  @Put()
  @Permissions('employee_numbering:update')
  configure(
    @Req()
    request: Request & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Body() dto: ConfigureEmployeeNumberDto,
  ) {
    return this.employeeNumberService.configure(
      request.user.companyId!,
      dto,
      request.user,
      context,
    );
  }
}
