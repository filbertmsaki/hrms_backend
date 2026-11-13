import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { KpiRoles, KpiRolesGuard } from './kpi-roles.guard';
import { KpiWorkflowService } from './kpi-workflow.service';
import { Matches } from 'class-validator';

class RemindHrDto {
  @Matches(/^(period|definition|assignment|hr_finalization:[1-9][0-9]*)$/)
  reminderKey: string;
}

@ApiTags('KPI workflow guidance')
@ApiBearerAuth('access-token')
@Controller('hr/kpi/workflow')
@UseGuards(AuthGuard('jwt'), TenantGuard, KpiRolesGuard)
export class KpiWorkflowController {
  constructor(private readonly workflow: KpiWorkflowService) {}

  @Get('guidance')
  @KpiRoles(
    'COMPANY_ADMIN',
    'HR_MANAGER',
    'DEPARTMENT_MANAGER',
    'BRANCH_MANAGER',
    'EMPLOYEE',
    'MANAGEMENT',
  )
  guidance(@Req() req: Request & { user: AuthenticatedUser }) {
    return this.workflow.guidance(req.user);
  }

  @Post('remind-hr')
  @KpiRoles('EMPLOYEE')
  remindHr(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() body: RemindHrDto,
  ) {
    return this.workflow.remindHr(req.user, body.reminderKey);
  }
}
