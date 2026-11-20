import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { AccessControlSyncService } from '../../service/access-control-sync.service';

@ApiTags('Access Schedule Impact')
@ApiBearerAuth('access-token')
@Controller('access-control/configuration-impact')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class ScheduleImpactController {
  constructor(private readonly service: AccessControlSyncService) {}

  @Get('templates/:id')
  @Permissions(
    'access_schedule_templates:read',
    'access_groups:read',
    'data_scope:company',
  )
  template(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.previewScheduleImpact(
      req.user.companyId!,
      'template',
      id,
    );
  }

  @Get('week-plans/:id')
  @Permissions(
    'access_schedule_templates:read',
    'access_groups:read',
    'data_scope:company',
  )
  weekPlan(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.previewScheduleImpact(
      req.user.companyId!,
      'week-plan',
      id,
    );
  }
}
