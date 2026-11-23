import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsBoolean, IsInt, Min } from 'class-validator';
import { Request } from 'express';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import {
  ScheduleDeploymentsService,
  type ScheduleKind,
} from './schedule-deployments.service';

const kinds = { week: 'week-plan', template: 'template' };
class DeploymentDto {
  @IsBoolean() enabled: boolean;
  @IsInt() @Min(1) revision: number;
}
@Controller('access-control/schedule-deployments')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
@Permissions('access_control_sync:execute', 'data_scope:company')
export class ScheduleDeploymentsController {
  constructor(private readonly deployments: ScheduleDeploymentsService) {}

  @Get(':kind/:id')
  state(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('kind', new ParseEnumPipe(kinds)) kind: ScheduleKind,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.deployments.state(req.user, kind, id);
  }

  @Put(':kind/:id')
  configure(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('kind', new ParseEnumPipe(kinds)) kind: ScheduleKind,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DeploymentDto,
  ) {
    return this.deployments.configure(
      req.user,
      kind,
      id,
      dto.enabled,
      dto.revision,
    );
  }
}
