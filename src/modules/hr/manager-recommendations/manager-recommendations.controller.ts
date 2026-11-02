import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
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
import { CreateManagerRecommendationDto } from './dtos/create-manager-recommendation.dto';
import { DecideManagerRecommendationDto } from './dtos/decide-manager-recommendation.dto';
import { ManagerRecommendationsService } from './manager-recommendations.service';

@ApiTags('Manager Recommendations Demo')
@ApiBearerAuth('access-token')
@Controller('manager/recommendations')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class ManagerRecommendationsController {
  constructor(private readonly service: ManagerRecommendationsService) {}

  @Post()
  @Permissions('manager_self_service:read')
  @ApiOperation({ summary: 'Submit a demo manager recommendation' })
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateManagerRecommendationDto,
  ) {
    return this.service.create(req.user, dto);
  }

  @Get('mine')
  @Permissions('manager_self_service:read')
  findMine(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.service.findMine(req.user);
  }
}

@ApiTags('HR Manager Recommendations Demo')
@ApiBearerAuth('access-token')
@Controller('hr/manager-recommendations')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class HrManagerRecommendationsController {
  constructor(private readonly service: ManagerRecommendationsService) {}

  @Get('pending')
  @Permissions('self_service_requests:approve')
  @ApiOperation({ summary: 'List demo recommendations awaiting HR review' })
  findPending(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.service.findPending(req.user);
  }

  @Post(':id/decision')
  @Permissions('self_service_requests:approve')
  @ApiOperation({ summary: 'Record a demo recommendation decision' })
  decide(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideManagerRecommendationDto,
  ) {
    return this.service.decide(req.user, id, dto);
  }
}
