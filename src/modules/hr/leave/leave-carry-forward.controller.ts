import { Controller, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { LeaveCarryForwardService } from './services/leave-carry-forward.service';

@ApiTags('Leave')
@ApiBearerAuth('access-token')
@Controller('leave/carry-forward')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class LeaveCarryForwardController {
  constructor(private readonly carryForward: LeaveCarryForwardService) {}

  @Post('run')
  @Permissions('leave-balances.manage')
  @ApiOperation({
    summary:
      'Record carry-forward and apply due expiries now (normally runs daily)',
  })
  run(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query('fiscal_year') fiscalYear?: string,
  ) {
    const year = /^\d{4}$/.test(fiscalYear ?? '')
      ? fiscalYear!
      : new Date().toISOString().slice(0, 4);
    return this.carryForward.processCompany(req.user.companyId!, year);
  }
}
