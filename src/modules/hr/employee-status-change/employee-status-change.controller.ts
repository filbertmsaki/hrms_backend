import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { CurrentAuditContext } from '../../../common/decorators/audit-request-context.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import type { AuditRequestContext } from '../../../common/interfaces/audit-request-context.interface';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import {
  ApiAuthRequired,
  ApiNotFoundResponse,
  ApiOperationSummary,
  ApiSuccessResponse,
  ApiValidationErrorResponse,
} from '../../../docs/swagger-decorators';
import { ChangeEmployeeStatusDto } from '../employees/dtos/change-employee-status.dto';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { EmployeeStatusChangeService } from './employee-status-change.service';

@ApiTags('Employees')
@ApiBearerAuth('access-token')
@Controller('employees')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class EmployeeStatusChangeController {
  constructor(
    private readonly statusChangeService: EmployeeStatusChangeService,
  ) {}

  @Get(':id/status-requirements')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:change-status')
  @ApiOperationSummary(
    'Status change requirements',
    'Returns, for a target status, the prerequisites, their current state and default values used to pre-fill the status modal.',
  )
  @ApiAuthRequired()
  @ApiNotFoundResponse('Employee')
  @ApiSuccessResponse(200, 'Status change requirements')
  getRequirements(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Query('target', new ParseEnumPipe(EmploymentStatusEnum))
    target: EmploymentStatusEnum,
  ) {
    return this.statusChangeService.getRequirements(
      req.user.companyId!,
      id,
      target,
      req.user,
    );
  }

  @Patch(':id/status')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:change-status')
  @ApiOperationSummary(
    'Change employee lifecycle status',
    'Updates the employment status together with its prerequisites (schedule, onboarding completion, suspension effects, offboarding request) in one transaction.',
  )
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiNotFoundResponse('Employee')
  @ApiSuccessResponse(200, 'Employee status updated')
  changeStatus(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @CurrentAuditContext() context: AuditRequestContext,
    @Body() dto: ChangeEmployeeStatusDto,
  ) {
    return this.statusChangeService.changeStatus(
      req.user.companyId!,
      id,
      dto,
      req.user,
      context,
    );
  }
}
