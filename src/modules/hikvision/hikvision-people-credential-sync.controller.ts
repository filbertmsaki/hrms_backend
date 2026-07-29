import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsEnum, IsOptional } from 'class-validator';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { ApiActionOperation } from '../../docs/swagger-decorators';
import { HikvisionPeopleCredentialSyncService } from './hikvision-people-credential-sync.service';
import { HikvisionSyncJobsService } from './hikvision-sync-jobs.service';

// ── Unified action enum ────────────────────────────────────────────────────────

export enum HikvisionDeviceAction {
  /** Full sync: users + right plans + fingerprints + cards (synchronous) */
  SYNC_ALL = 'SYNC_ALL',
  /** Queue a background job: users + right plans only */
  SYNC_USERS = 'SYNC_USERS',
  /** Queue a background job: fingerprints only */
  SYNC_FINGERPRINTS = 'SYNC_FINGERPRINTS',
  /** Synchronous: cards only */
  SYNC_CARDS = 'SYNC_CARDS',
}

// ── Unified request DTO ────────────────────────────────────────────────────────

class HikvisionDeviceManageDto {
  @IsEnum(HikvisionDeviceAction)
  action!: HikvisionDeviceAction;

  @IsOptional()
  jobUserId?: number;
}

// ── Controller ─────────────────────────────────────────────────────────────────

@ApiTags('Hikvision People Sync')
@ApiBearerAuth('access-token')
@Controller('hikvision')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class HikvisionPeopleCredentialSyncController {
  constructor(
    private readonly peopleCredentialSyncService: HikvisionPeopleCredentialSyncService,
    private readonly hikvisionSyncJobsService: HikvisionSyncJobsService,
  ) {}

  @Post('devices/:deviceId/manage')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiActionOperation(
    'Manage Device',
    `Single entry point for all Hikvision device operations.
    Pass \`action\` in the body to choose what to run:
    SYNC_ALL | SYNC_USERS | SYNC_FINGERPRINTS | SYNC_CARDS`,
  )
  async manage(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Body() body: HikvisionDeviceManageDto,
  ) {
    const companyId = req.user.companyId!;
    const userId = req.user.id;
    const membershipId = req.user.companyMembershipId ?? null;
    const requestedAction: string = body.action;

    switch (body.action) {
      case HikvisionDeviceAction.SYNC_ALL:
        return this.peopleCredentialSyncService.syncUsersFingerprintsAndCards(
          companyId,
          deviceId,
        );

      case HikvisionDeviceAction.SYNC_USERS:
        return this.hikvisionSyncJobsService.enqueueUsersSync(
          companyId,
          deviceId,
          userId,
          membershipId,
        );

      case HikvisionDeviceAction.SYNC_FINGERPRINTS:
        return this.hikvisionSyncJobsService.enqueueFingerprintsSync(
          companyId,
          deviceId,
          userId,
          membershipId,
        );

      case HikvisionDeviceAction.SYNC_CARDS:
        return this.peopleCredentialSyncService.syncCards(companyId, deviceId);

      default:
        throw new BadRequestException(
          `Unknown action "${requestedAction}". ` +
            `Valid values: ${Object.values(HikvisionDeviceAction).join(', ')}`,
        );
    }
  }

  @Get('sync-jobs/:jobId')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiActionOperation(
    'Get Sync Job Status',
    'Get the status of one background Hikvision sync job',
  )
  getSyncJobStatus(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('jobId') jobId: string,
  ) {
    return this.hikvisionSyncJobsService.getJobStatus(
      req.user.companyId!,
      jobId,
    );
  }
}
