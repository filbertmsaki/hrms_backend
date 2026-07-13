import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import {
  ApiGetOneOperation,
  ApiListOperation,
} from '../../../../docs/swagger-decorators';
import { QueryHikvisionSyncLogDto } from '../dto/query-hikvision-sync-log.dto';
import { HikvisionSyncLogService } from '../service/hikvision-sync-log.service';

@ApiTags('Access Control Sync Logs')
@ApiBearerAuth('access-token')
@Controller('access-control')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class HikvisionSyncLogsController {
  constructor(private readonly syncLogService: HikvisionSyncLogService) {}

  @Get('hikvision-sync-logs')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiListOperation(
    'Hikvision Sync Logs',
    'List Hikvision device sync operation logs',
  )
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: QueryHikvisionSyncLogDto,
  ) {
    return this.syncLogService.findAll(req.user.companyId!, query);
  }

  @Get('hikvision-sync-logs/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiGetOneOperation(
    'Hikvision Sync Log',
    'Get one Hikvision sync operation log',
  )
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.syncLogService.findOne(req.user.companyId!, id);
  }
}
