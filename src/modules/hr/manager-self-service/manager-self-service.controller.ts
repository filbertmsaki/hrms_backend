import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { ActionItemsService } from '../action-inbox/action-items.service';
import { ActionItemQueryDto } from '../action-inbox/dtos/action-item-query.dto';
import { ManagerSelfServiceService } from './manager-self-service.service';
import { ManagerTeamQueryDto } from './dtos/manager-team-query.dto';
import { ManagerDashboardQueryDto } from './dtos/manager-dashboard-query.dto';
import { TeamAttendanceQueryDto } from '../self-service/dtos/team-attendance-query.dto';

@ApiTags('Manager Self Service')
@ApiBearerAuth('access-token')
@Controller('manager')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class ManagerSelfServiceController {
  constructor(
    private readonly service: ManagerSelfServiceService,
    private readonly actionItemsService: ActionItemsService,
  ) {}

  @Get('dashboard')
  @Permissions('manager_self_service:read')
  @ApiOperation({ summary: 'Get my manager dashboard' })
  getDashboard(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: ManagerDashboardQueryDto,
  ) {
    return this.service.getDashboard(req.user, query);
  }

  @Get('team')
  @Permissions('manager_team:read')
  @ApiOperation({ summary: 'List employees within my data scope' })
  getTeam(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: ManagerTeamQueryDto,
  ) {
    return this.service.getTeamMembers(req.user, query);
  }

  @Get('team/:employeeId')
  @Permissions('manager_team:read')
  @ApiOperation({ summary: 'Get one team member summary' })
  getTeamMember(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.service.getTeamMemberSummary(req.user, employeeId);
  }

  @Get('action-items')
  @Permissions('manager_self_service:read')
  @ApiOperation({ summary: 'Get my pending action items' })
  getActionItems(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: ActionItemQueryDto,
  ) {
    return this.actionItemsService.findMine(req.user, query);
  }

  @Get('team/attendance')
  @Permissions('team_attendance:read')
  @ApiOperation({ summary: "Get my authorized team's attendance" })
  getTeamAttendance(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: TeamAttendanceQueryDto,
  ) {
    return this.service.getTeamAttendance(req.user, query);
  }
}
