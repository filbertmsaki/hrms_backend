import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Request as ExpressRequest } from 'express';
import { CurrentAuditContext } from '../../common/decorators/audit-request-context.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PlatformGuard } from '../../common/guards/platform.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import type { AuditRequestContext } from '../../common/interfaces/audit-request-context.interface';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { SmsLogQueryDto } from './dto/sms-log-query.dto';
import { UpdateSmsGlobalSettingDto } from './dto/sms-global-setting.dto';
import { UpdateSmsNotificationRegistryDto } from './dto/sms-notification-registry.dto';
import { SendTestSmsDto } from './dto/sms-test.dto';
import { SmsNotificationManagementService } from './sms-notification-management.service';

@ApiTags('SMS')
@ApiBearerAuth('access-token')
@Controller('sms')
@UseGuards(AuthGuard('jwt'))
export class SmsAdminController {
  constructor(
    private readonly smsNotificationManagementService: SmsNotificationManagementService,
  ) {}

  @Get('global')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('sms:settings:read')
  getGlobalSetting() {
    return this.smsNotificationManagementService.getGlobalSetting();
  }

  @Patch('global')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('sms:settings:update')
  updateGlobalSetting(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Body() dto: UpdateSmsGlobalSettingDto,
  ) {
    return this.smsNotificationManagementService.setGlobalEnabled(
      dto.is_enabled,
      req.user,
      context,
    );
  }

  @Get('registry')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('sms:settings:read')
  listRegistry() {
    return this.smsNotificationManagementService.listRegistry();
  }

  @Get('registry/:code')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('sms:settings:read')
  getRegistryItem(@Param('code') code: string) {
    return this.smsNotificationManagementService.getRegistryItem(code);
  }

  @Patch('registry/:code')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('sms:settings:update')
  updateRegistryItem(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Param('code') code: string,
    @Body() dto: UpdateSmsNotificationRegistryDto,
  ) {
    return this.smsNotificationManagementService.updateRegistryItem(
      code,
      dto,
      req.user,
      context,
    );
  }

  @Post('test')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('sms:test')
  sendTestSms(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Body() dto: SendTestSmsDto,
  ) {
    return this.smsNotificationManagementService.sendTestSms(
      dto,
      req.user,
      context,
    );
  }

  @Get('logs')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('sms:logs:read')
  listLogs(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: SmsLogQueryDto,
  ) {
    return this.smsNotificationManagementService.listLogs(query, {
      companyId: req.user.companyId ?? null,
      platformScope: false,
    });
  }

  @Post('logs/:id/retry')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('sms:logs:retry')
  retryLog(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.smsNotificationManagementService.retryFailedLog(
      id,
      req.user,
      context,
      {
        companyId: req.user.companyId ?? null,
        platformScope: false,
      },
    );
  }

  @Get('platform/global')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('sms:settings:read')
  getPlatformGlobalSetting() {
    return this.smsNotificationManagementService.getGlobalSetting();
  }

  @Patch('platform/global')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('sms:settings:update')
  updatePlatformGlobalSetting(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Body() dto: UpdateSmsGlobalSettingDto,
  ) {
    return this.smsNotificationManagementService.setGlobalEnabled(
      dto.is_enabled,
      req.user,
      context,
    );
  }

  @Get('platform/registry')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('sms:settings:read')
  listPlatformRegistry() {
    return this.smsNotificationManagementService.listRegistry();
  }

  @Get('platform/registry/:code')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('sms:settings:read')
  getPlatformRegistryItem(@Param('code') code: string) {
    return this.smsNotificationManagementService.getRegistryItem(code);
  }

  @Patch('platform/registry/:code')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('sms:settings:update')
  updatePlatformRegistryItem(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Param('code') code: string,
    @Body() dto: UpdateSmsNotificationRegistryDto,
  ) {
    return this.smsNotificationManagementService.updateRegistryItem(
      code,
      dto,
      req.user,
      context,
    );
  }

  @Get('platform/logs')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('sms:logs:read')
  listPlatformLogs(@Query() query: SmsLogQueryDto) {
    return this.smsNotificationManagementService.listLogs(query, {
      platformScope: true,
    });
  }

  @Post('platform/logs/:id/retry')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('sms:logs:retry')
  retryPlatformLog(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.smsNotificationManagementService.retryFailedLog(
      id,
      req.user,
      context,
      {
        platformScope: true,
      },
    );
  }
}
