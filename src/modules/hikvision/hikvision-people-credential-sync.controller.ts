import {
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
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { ApiActionOperation } from '../../docs/swagger-decorators';
import { HikvisionSeedPreviewQueryDto } from './dto/hikvision-seed-preview-query.dto';
import { HikvisionPeopleCredentialSyncService } from './hikvision-people-credential-sync.service';
import { HikvisionSeedPreviewService } from './hikvision-seed-preview.service';
import { HikvisionSyncJobsService } from './hikvision-sync-jobs.service';

@ApiTags('Hikvision People Sync')
@ApiBearerAuth('access-token')
@Controller('hikvision')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class HikvisionPeopleCredentialSyncController {
  constructor(
    private readonly peopleCredentialSyncService: HikvisionPeopleCredentialSyncService,
    private readonly hikvisionSyncJobsService: HikvisionSyncJobsService,
    private readonly seedPreviewService: HikvisionSeedPreviewService,
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
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiActionOperation(
    'Sync Users',
    'Queue a background job to sync Hikvision users and right plans into backend tables',
  )
  syncUsers(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    return this.hikvisionSyncJobsService.enqueueUsersSync(
      req.user.companyId!,
      deviceId,
      req.user.id,
      req.user.companyMembershipId ?? null,
    );
  }

  @Post('devices/:deviceId/sync-fingerprints')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiActionOperation(
    'Sync Fingerprints',
    'Queue a background job to sync Hikvision fingerprints into backend credentials',
  )
  syncFingerprints(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    return this.hikvisionSyncJobsService.enqueueFingerprintsSync(
      req.user.companyId!,
      deviceId,
      req.user.id,
      req.user.companyMembershipId ?? null,
    );
  }

  @Post('devices/:deviceId/sync-cards')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiActionOperation(
    'Sync Cards',
    'Sync Hikvision cards into backend credentials',
  )
  syncCards(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    return this.peopleCredentialSyncService.syncCards(
      req.user.companyId!,
      deviceId,
    );
  }

  @Post('devices/:deviceId/users/generate-constants')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiActionOperation(
    'Generate Constants (Dev Only)',
    'Read employees already synced from the device into the DB and write a company-structure.constants.ts snippet for review. Development mode only.',
  )
  generateConstants(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    return this.seedPreviewService.generateConstantsFromSync(
      req.user.companyId!,
      deviceId,
    );
  }

  @Post('devices/:deviceId/users/seed-preview')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiActionOperation(
    'Seed Preview (Dev Only)',
    'Query a live Hikvision device and preview which users need to be added to the seeder constants. Development mode only.',
  )
  seedPreview(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Body() query: HikvisionSeedPreviewQueryDto,
  ) {
    return this.seedPreviewService.generateSeedPreview(
      req.user.companyId!,
      deviceId,
      query,
    );
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
