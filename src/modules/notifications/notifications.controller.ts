import { ConfigService } from '@nestjs/config';
import {
  mailRoutingStatus,
  resolveMailRecipientSafetyConfigFromConfigService,
} from '../mail/mail-recipient-safety.util';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { CurrentAuditContext } from '../../common/decorators/audit-request-context.decorator';
import {
  Permissions,
  PermissionsAny,
} from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PlatformGuard } from '../../common/guards/platform.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import type { AuditRequestContext } from '../../common/interfaces/audit-request-context.interface';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CreateTestNotificationDto } from './dto/create-test-notification.dto';
import { NotificationChannelRegistryQueryDto } from './dto/notification-channel-registry-query.dto';
import { NotificationDeliveryLogQueryDto } from './dto/notification-delivery-log-query.dto';
import { NotificationMailLogQueryDto } from './dto/notification-mail-log-query.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationRuleQueryDto } from './dto/notification-rule-query.dto';
import { NotificationTemplateQueryDto } from './dto/notification-template-query.dto';
import {
  UpdateNotificationRuleDto,
  UpsertNotificationRuleDto,
} from './dto/upsert-notification-rule.dto';
import {
  UpdateNotificationTemplateDto,
  UpsertNotificationTemplateDto,
} from './dto/upsert-notification-template.dto';
import { UpdateNotificationChannelGlobalSettingDto } from './dto/update-notification-channel-global-setting.dto';
import { UpdateNotificationChannelRegistryDto } from './dto/update-notification-channel-registry.dto';
import { NotificationChannelEnum } from './enums/notification-channel.enum';
import { NotificationChannelManagementService } from './notification-channel-management.service';
import { NotificationConfigurationService } from './notification-configuration.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationsService } from './notifications.service';
import { UpdateAttendanceAlertEmailPreferenceDto } from './dto/update-attendance-alert-email-preference.dto';
import {
  RegisterPushDeviceDto,
  UnregisterPushDeviceDto,
} from './dto/register-push-device.dto';
import { PushNotificationService } from './push-notification.service';
import {
  DeleteWebPushSubscriptionDto,
  WebPushSubscriptionDto,
} from './dto/web-push-subscription.dto';
import { WebPushService } from './web-push.service';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly notificationChannelManagementService: NotificationChannelManagementService,
    private readonly notificationConfigurationService: NotificationConfigurationService,
    private readonly notificationPreferencesService: NotificationPreferencesService,
    private readonly pushNotificationService: PushNotificationService,
    private readonly config: ConfigService,
    private readonly webPushService: WebPushService,
  ) {}

  @Get('web-push/config')
  @UseGuards(TenantGuard)
  browserPushConfig() {
    return this.webPushService.getConfig();
  }

  @Post('web-push/subscriptions')
  @UseGuards(TenantGuard)
  registerBrowserPush(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: WebPushSubscriptionDto,
  ) {
    return this.webPushService.register(req.user, dto);
  }

  @Delete('web-push/subscriptions')
  @UseGuards(TenantGuard)
  unregisterBrowserPush(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: DeleteWebPushSubscriptionDto,
  ) {
    return this.webPushService.unregister(req.user, dto);
  }

  @Post('push-devices')
  @UseGuards(TenantGuard)
  registerPushDevice(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: RegisterPushDeviceDto,
  ) {
    return this.pushNotificationService.register(req.user, dto);
  }

  @Delete('push-devices')
  @UseGuards(TenantGuard)
  unregisterPushDevice(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: UnregisterPushDeviceDto,
  ) {
    return this.pushNotificationService.unregister(req.user, dto);
  }

  @Patch('users/attendance-alert-email')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:settings-update')
  updateAttendanceAlertEmailPreferenceForAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: UpdateAttendanceAlertEmailPreferenceDto,
  ) {
    const { companyId } = this.notificationsService.assertCompanyActor(
      req.user,
    );
    return this.notificationPreferencesService.updateAttendanceAlertEmailPreferenceForCompany(
      companyId,
      dto,
    );
  }

  @Get('users/:companyUserId/attendance-alert-email')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:settings-read')
  getAttendanceAlertEmailPreference(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('companyUserId', ParseIntPipe) companyUserId: number,
  ) {
    const { companyId } = this.notificationsService.assertCompanyActor(
      req.user,
    );
    return this.notificationPreferencesService.getAttendanceAlertEmailPreference(
      companyId,
      companyUserId,
    );
  }

  @Patch('users/:companyUserId/attendance-alert-email')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:settings-update')
  updateAttendanceAlertEmailPreference(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('companyUserId', ParseIntPipe) companyUserId: number,
    @Body() dto: UpdateAttendanceAlertEmailPreferenceDto,
  ) {
    const { companyId } = this.notificationsService.assertCompanyActor(
      req.user,
    );
    return this.notificationPreferencesService.updateAttendanceAlertEmailPreference(
      companyId,
      companyUserId,
      dto,
    );
  }

  @Get()
  @UseGuards(TenantGuard)
  findMine(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: NotificationQueryDto,
  ) {
    const { companyId, companyMembershipId } =
      this.notificationsService.assertCompanyActor(req.user);

    return this.notificationsService.findMine(
      companyId,
      companyMembershipId,
      query,
    );
  }

  @Get('unread-count')
  @UseGuards(TenantGuard)
  unreadCount(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    const { companyId, companyMembershipId } =
      this.notificationsService.assertCompanyActor(req.user);

    return this.notificationsService.getUnreadCount(
      companyId,
      companyMembershipId,
    );
  }

  @Get('unread')
  @UseGuards(TenantGuard)
  unread(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: NotificationQueryDto,
  ) {
    const { companyId, companyMembershipId } =
      this.notificationsService.assertCompanyActor(req.user);

    return this.notificationsService.findUnread(
      companyId,
      companyMembershipId,
      query,
    );
  }

  @Get('dashboard')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:delivery-logs-read')
  dashboard(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    const { companyId } = this.notificationsService.assertCompanyActor(
      req.user,
    );

    return this.notificationsService.getDashboardStats(companyId);
  }

  @Post('test')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:test')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  sendTest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateTestNotificationDto,
  ) {
    const { companyId, companyMembershipId } =
      this.notificationsService.assertCompanyActor(req.user);

    return this.notificationsService.createAndPush({
      company_id: companyId,
      sender_company_user_id: companyMembershipId,
      receiver_company_user_id: dto.receiver_company_user_id,
      type: dto.type,
      category: dto.category,
      priority: dto.priority,
      title: dto.title,
      message: dto.message,
      related_module: dto.related_module ?? 'notifications',
      entity_type: dto.entity_type ?? 'TEST',
      entity_id: dto.entity_id ?? null,
      action_url: dto.action_url ?? null,
      dedupe_key: dto.dedupe_key ?? null,
      metadata: dto.metadata ?? null,
      delivery_channel: dto.delivery_channel,
    });
  }

  @Get('deliveries')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:delivery-logs-read')
  listDeliveryLogs(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: NotificationDeliveryLogQueryDto,
  ) {
    const { companyId } = this.notificationsService.assertCompanyActor(
      req.user,
    );
    return this.notificationsService.listDeliveryLogs(companyId, query);
  }

  @Get('templates')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:settings-read')
  listTemplates(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: NotificationTemplateQueryDto,
  ) {
    const { companyId } = this.notificationsService.assertCompanyActor(
      req.user,
    );
    return this.notificationConfigurationService.listTemplates(
      companyId,
      query,
    );
  }

  @Get('templates/:id')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:settings-read')
  getTemplate(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const { companyId } = this.notificationsService.assertCompanyActor(
      req.user,
    );
    return this.notificationConfigurationService.getTemplate(companyId, id);
  }

  @Post('templates')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:settings-update')
  createTemplate(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: UpsertNotificationTemplateDto,
  ) {
    const { companyId } = this.notificationsService.assertCompanyActor(
      req.user,
    );
    return this.notificationConfigurationService.createTemplate(companyId, dto);
  }

  @Patch('templates/:id')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:settings-update')
  updateTemplate(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNotificationTemplateDto,
  ) {
    const { companyId } = this.notificationsService.assertCompanyActor(
      req.user,
    );
    return this.notificationConfigurationService.updateTemplate(
      companyId,
      id,
      dto,
    );
  }

  @Get('rules')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:settings-read')
  listRules(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: NotificationRuleQueryDto,
  ) {
    const { companyId } = this.notificationsService.assertCompanyActor(
      req.user,
    );
    return this.notificationConfigurationService.listRules(companyId, query);
  }

  @Get('rules/:id')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:settings-read')
  getRule(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const { companyId } = this.notificationsService.assertCompanyActor(
      req.user,
    );
    return this.notificationConfigurationService.getRule(companyId, id);
  }

  @Post('rules')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:settings-update')
  createRule(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: UpsertNotificationRuleDto,
  ) {
    const { companyId } = this.notificationsService.assertCompanyActor(
      req.user,
    );
    return this.notificationConfigurationService.createRule(companyId, dto);
  }

  @Patch('rules/:id')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:settings-update')
  updateRule(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNotificationRuleDto,
  ) {
    const { companyId } = this.notificationsService.assertCompanyActor(
      req.user,
    );
    return this.notificationConfigurationService.updateRule(companyId, id, dto);
  }

  @Get('deliveries/:id')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:delivery-logs-read')
  getDeliveryLog(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const { companyId } = this.notificationsService.assertCompanyActor(
      req.user,
    );
    return this.notificationsService.getDeliveryLog(companyId, id);
  }

  @Get('mail-routing')
  @UseGuards(TenantGuard, PermissionsGuard)
  @PermissionsAny(
    'scheduled_reports:manage_smtp',
    'notifications:mail-logs-read',
    'notifications:settings-read',
  )
  mailRouting() {
    return mailRoutingStatus(
      resolveMailRecipientSafetyConfigFromConfigService(this.config),
    );
  }

  @Get('platform/mail-routing')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('notifications:mail-logs-read')
  platformMailRouting() {
    return this.mailRouting();
  }

  @Get('mail-logs')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:mail-logs-read')
  listMailLogs(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: NotificationMailLogQueryDto,
  ) {
    const { companyId } = this.notificationsService.assertCompanyActor(
      req.user,
    );
    return this.notificationsService.listMailLogs(companyId, query);
  }

  @Get('mail-logs/:id')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:mail-logs-read')
  getMailLog(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const { companyId } = this.notificationsService.assertCompanyActor(
      req.user,
    );
    return this.notificationsService.getMailLog(companyId, id);
  }

  @Post('mail-logs/:id/retry')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:mail-logs-retry')
  retryMailLog(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const { companyId } = this.notificationsService.assertCompanyActor(
      req.user,
    );
    return this.notificationsService.retryMailLog(companyId, id);
  }

  @Get('platform/mail-logs')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('notifications:mail-logs-read')
  listPlatformMailLogs(@Query() query: NotificationMailLogQueryDto) {
    return this.notificationsService.listPlatformMailLogs(query);
  }

  @Get('platform/mail-logs/:id')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('notifications:mail-logs-read')
  getPlatformMailLog(@Param('id', ParseIntPipe) id: number) {
    return this.notificationsService.getPlatformMailLog(id);
  }

  @Post('platform/mail-logs/:id/retry')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('notifications:mail-logs-retry')
  retryPlatformMailLog(@Param('id', ParseIntPipe) id: number) {
    return this.notificationsService.retryPlatformMailLog(id);
  }

  @Get('channel-settings')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:settings-read')
  listChannelSettings(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.notificationChannelManagementService.listGlobalSettings(
      req.user.companyId,
    );
  }

  @Get('channel-settings/:channel')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:settings-read')
  getChannelSetting(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('channel') channel: NotificationChannelEnum,
  ) {
    return this.notificationChannelManagementService.getGlobalSetting(
      channel,
      req.user.companyId,
    );
  }

  @Patch('channel-settings/:channel')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:settings-update')
  updateChannelSetting(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Param('channel') channel: NotificationChannelEnum,
    @Body() dto: UpdateNotificationChannelGlobalSettingDto,
  ) {
    return this.notificationChannelManagementService.updateGlobalSetting(
      channel,
      dto,
      req.user,
      context,
      req.user.companyId,
    );
  }

  @Get('channel-registry')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:settings-read')
  listChannelRegistry(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: NotificationChannelRegistryQueryDto,
  ) {
    return this.notificationChannelManagementService.listRegistry(
      query,
      req.user.companyId,
    );
  }

  @Get('channel-registry/:channel/:code')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:settings-read')
  getChannelRegistryItem(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('channel') channel: NotificationChannelEnum,
    @Param('code') code: string,
  ) {
    return this.notificationChannelManagementService.getRegistryItem(
      channel,
      code,
      req.user.companyId,
    );
  }

  @Patch('channel-registry/:channel/:code')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:settings-update')
  updateChannelRegistryItem(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Param('channel') channel: NotificationChannelEnum,
    @Param('code') code: string,
    @Body() dto: UpdateNotificationChannelRegistryDto,
  ) {
    return this.notificationChannelManagementService.updateRegistryItem(
      channel,
      code,
      dto,
      req.user,
      context,
      req.user.companyId,
    );
  }

  @Get('platform/channel-settings')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('notifications:settings-read')
  listPlatformChannelSettings() {
    return this.notificationChannelManagementService.listGlobalSettings();
  }

  @Patch('platform/channel-settings/:channel')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('notifications:settings-update')
  updatePlatformChannelSetting(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Param('channel') channel: NotificationChannelEnum,
    @Body() dto: UpdateNotificationChannelGlobalSettingDto,
  ) {
    return this.notificationChannelManagementService.updateGlobalSetting(
      channel,
      dto,
      req.user,
      context,
    );
  }

  @Get('platform/channel-registry')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('notifications:settings-read')
  listPlatformChannelRegistry(
    @Query() query: NotificationChannelRegistryQueryDto,
  ) {
    return this.notificationChannelManagementService.listRegistry(query);
  }

  @Patch('platform/channel-registry/:channel/:code')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('notifications:settings-update')
  updatePlatformChannelRegistryItem(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Param('channel') channel: NotificationChannelEnum,
    @Param('code') code: string,
    @Body() dto: UpdateNotificationChannelRegistryDto,
  ) {
    return this.notificationChannelManagementService.updateRegistryItem(
      channel,
      code,
      dto,
      req.user,
      context,
    );
  }

  @Patch(':id/seen')
  @UseGuards(TenantGuard)
  markAsSeen(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const { companyId, companyMembershipId } =
      this.notificationsService.assertCompanyActor(req.user);

    return this.notificationsService.markAsSeen(
      companyId,
      companyMembershipId,
      id,
    );
  }

  @Get(':id')
  @UseGuards(TenantGuard)
  findOneMine(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const { companyId, companyMembershipId } =
      this.notificationsService.assertCompanyActor(req.user);

    return this.notificationsService.findOneMine(
      companyId,
      companyMembershipId,
      id,
    );
  }

  @Patch(':id/read')
  @UseGuards(TenantGuard)
  markAsRead(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const { companyId, companyMembershipId } =
      this.notificationsService.assertCompanyActor(req.user);

    return this.notificationsService.markAsRead(
      companyId,
      companyMembershipId,
      id,
    );
  }

  @Patch('read-all')
  @UseGuards(TenantGuard)
  markAllAsRead(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    const { companyId, companyMembershipId } =
      this.notificationsService.assertCompanyActor(req.user);

    return this.notificationsService.markAllAsRead(
      companyId,
      companyMembershipId,
    );
  }

  @Delete(':id')
  @UseGuards(TenantGuard)
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const { companyId, companyMembershipId } =
      this.notificationsService.assertCompanyActor(req.user);

    return this.notificationsService.remove(companyId, companyMembershipId, id);
  }

  @Delete()
  @UseGuards(TenantGuard)
  removeAll(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    const { companyId, companyMembershipId } =
      this.notificationsService.assertCompanyActor(req.user);

    return this.notificationsService.removeAll(companyId, companyMembershipId);
  }
}
