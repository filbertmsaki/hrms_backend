import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { CompleteFieldFollowUpDto } from '../dto/field-visit.dto';
import { WorkActivityQueryDto } from '../dto/queries.dto';
import { FieldMobileSyncDto } from '../dto/sync.dto';
import { FieldMobileSyncService } from '../services/field-mobile-sync.service';
import { FieldVisitService } from '../services/field-visit.service';

type AuthedRequest = ExpressRequest & { user: AuthenticatedUser };

@ApiTags('My Field Visits')
@ApiBearerAuth('access-token')
@Controller('me')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class MyFieldVisitsCompatController {
  constructor(
    private readonly visitService: FieldVisitService,
    private readonly syncService: FieldMobileSyncService,
  ) {}

  @Get('field-follow-ups')
  @Permissions('field_visits:self-service:read')
  listFollowUps(@Req() req: AuthedRequest, @Query() query: WorkActivityQueryDto) {
    return this.visitService.listMyFollowUps(req.user, query);
  }

  @Post('field-follow-ups/:id/complete')
  @Permissions('field_visits:self-service:update')
  completeFollowUp(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteFieldFollowUpDto,
  ) {
    return this.visitService.completeMyFollowUp(req.user, id, dto);
  }

  @Post('field-sync')
  @Permissions('field_visits:self-service:update')
  sync(@Req() req: AuthedRequest, @Body() dto: FieldMobileSyncDto) {
    return this.syncService.sync(req.user, dto);
  }

  @Get('field-sync/:syncRequestId')
  @Permissions('field_visits:self-service:read')
  getSyncStatus(
    @Req() req: AuthedRequest,
    @Param('syncRequestId') syncRequestId: string,
  ) {
    return this.syncService.getStatus(req.user, syncRequestId);
  }
}
