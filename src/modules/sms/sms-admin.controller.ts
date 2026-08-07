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
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class SmsAdminController {
  constructor(
    private readonly smsNotificationManagementService: SmsNotificationManagementService,
  ) {}

  @Get('global')
  @UseGuards(PermissionsGuard)
  @Permissions('companies:update')
  getGlobalSetting() {
    return this.smsNotificationManagementService.getGlobalSetting();
  }

  @Patch('global')
  @UseGuards(PermissionsGuard)
  @Permissions('companies:update')
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
  @UseGuards(PermissionsGuard)
  @Permissions('companies:update')
  listRegistry() {
    return this.smsNotificationManagementService.listRegistry();
  }

  @Get('registry/:code')
  @UseGuards(PermissionsGuard)
  @Permissions('companies:update')
  getRegistryItem(@Param('code') code: string) {
    return this.smsNotificationManagementService.getRegistryItem(code);
  }

  @Patch('registry/:code')
  @UseGuards(PermissionsGuard)
  @Permissions('companies:update')
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
  @UseGuards(PermissionsGuard)
  @Permissions('companies:update')
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
  @UseGuards(PermissionsGuard)
  @Permissions('companies:update')
  listLogs(@Query() query: SmsLogQueryDto) {
    return this.smsNotificationManagementService.listLogs(query);
  }

  @Post('logs/:id/retry')
  @UseGuards(PermissionsGuard)
  @Permissions('companies:update')
  retryLog(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.smsNotificationManagementService.retryFailedLog(
      id,
      req.user,
      context,
    );
  }
}
