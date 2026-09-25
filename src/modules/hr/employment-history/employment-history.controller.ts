import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { EmploymentHistoryService } from './employment-history.service';

type AuthedRequest = ExpressRequest & { user: AuthenticatedUser };

@ApiTags('Employment History')
@ApiBearerAuth('access-token')
@Controller()
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class EmploymentHistoryController {
  constructor(private readonly service: EmploymentHistoryService) {}

  @Get('employees/:employeeId/employment-history')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:read')
  @ApiOperation({ summary: 'Get the employment timeline of an employee' })
  listForEmployee(
    @Req() req: AuthedRequest,
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.service.listForEmployee(req.user, employeeId);
  }

  @Get('me/employment-history')
  @ApiOperation({ summary: 'Get my employment timeline' })
  listMine(@Req() req: AuthedRequest) {
    return this.service.listMine(req.user);
  }
}
