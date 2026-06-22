import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { HrLaunchReadinessService } from './hr-launch-readiness.service';

@ApiTags('HR Launch Readiness')
@ApiBearerAuth('access-token')
@Controller('hr/launch-readiness')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class HrLaunchReadinessController {
  constructor(
    private readonly readinessService: HrLaunchReadinessService,
  ) {}

  @Get()
  @Permissions('hrms_launch_readiness:read')
  @ApiOperation({
    summary: 'Check HRMS launch readiness',
    description:
      'Returns a full readiness report: blockers, warnings, counts, and next steps for launch.',
  })
  check(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.readinessService.check(req.user.companyId!);
  }
}
