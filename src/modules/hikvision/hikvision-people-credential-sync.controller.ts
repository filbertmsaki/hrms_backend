import {
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { ApiActionOperation } from '../../docs/swagger-decorators';
import { HikvisionPeopleCredentialSyncService } from './hikvision-people-credential-sync.service';

@ApiTags('Hikvision People Sync')
@ApiBearerAuth('access-token')
@Controller('hikvision')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class HikvisionPeopleCredentialSyncController {
  constructor(
    private readonly peopleCredentialSyncService: HikvisionPeopleCredentialSyncService,
  ) {}

  @Post('devices/:deviceId/sync-users-credentials')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiActionOperation(
    'Sync Users Credentials',
    'Sync Hikvision users, right plans, fingerprints, and cards into backend tables',
  )
  syncUsersFingerprintsAndCards(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    return this.peopleCredentialSyncService.syncUsersFingerprintsAndCards(
      req.user.companyId!,
      deviceId,
    );
  }

  @Post('devices/:deviceId/sync-users')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiActionOperation('Sync Users', 'Sync Hikvision users and right plans into backend tables')
  syncUsers(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    return this.peopleCredentialSyncService.syncUsers(req.user.companyId!, deviceId);
  }

  @Post('devices/:deviceId/sync-fingerprints')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiActionOperation('Sync Fingerprints', 'Sync Hikvision fingerprints into backend credentials')
  syncFingerprints(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    return this.peopleCredentialSyncService.syncAllFingerprintsForSyncedUsers(req.user.companyId!, deviceId);
  }

  @Post('devices/:deviceId/sync-cards')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiActionOperation('Sync Cards', 'Sync Hikvision cards into backend credentials')
  syncCards(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    return this.peopleCredentialSyncService.syncCards(req.user.companyId!, deviceId);
  }
}
