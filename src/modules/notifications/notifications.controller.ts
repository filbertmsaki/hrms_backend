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
import { Permissions } from '../../common/decorators/permissions.decorator';
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
import { UpdateNotificationChannelGlobalSettingDto } from './dto/update-notification-channel-global-setting.dto';
import { UpdateNotificationChannelRegistryDto } from './dto/update-notification-channel-registry.dto';
import { NotificationChannelEnum } from './enums/notification-channel.enum';
import { NotificationChannelManagementService } from './notification-channel-management.service';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly notificationChannelManagementService: NotificationChannelManagementService,
  ) {}

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
  @Permissions('notifications:delivery-logs:read')
  listDeliveryLogs(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: NotificationDeliveryLogQueryDto,
  ) {
    const { companyId } = this.notificationsService.assertCompanyActor(req.user);
    return this.notificationsService.listDeliveryLogs(companyId, query);
  }

  @Get('deliveries/:id')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:delivery-logs:read')
  getDeliveryLog(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const { companyId } = this.notificationsService.assertCompanyActor(req.user);
    return this.notificationsService.getDeliveryLog(companyId, id);
  }

  @Get('mail-logs')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:mail-logs:read')
  listMailLogs(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: NotificationMailLogQueryDto,
  ) {
    const { companyId } = this.notificationsService.assertCompanyActor(req.user);
    return this.notificationsService.listMailLogs(companyId, query);
  }

  @Get('mail-logs/:id')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:mail-logs:read')
  getMailLog(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const { companyId } = this.notificationsService.assertCompanyActor(req.user);
    return this.notificationsService.getMailLog(companyId, id);
  }

  @Post('mail-logs/:id/retry')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:mail-logs:retry')
  retryMailLog(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const { companyId } = this.notificationsService.assertCompanyActor(req.user);
    return this.notificationsService.retryMailLog(companyId, id);
  }

  @Get('platform/mail-logs')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('notifications:mail-logs:read')
  listPlatformMailLogs(@Query() query: NotificationMailLogQueryDto) {
    return this.notificationsService.listPlatformMailLogs(query);
  }

  @Get('platform/mail-logs/:id')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('notifications:mail-logs:read')
  getPlatformMailLog(@Param('id', ParseIntPipe) id: number) {
    return this.notificationsService.getPlatformMailLog(id);
  }

  @Post('platform/mail-logs/:id/retry')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('notifications:mail-logs:retry')
  retryPlatformMailLog(@Param('id', ParseIntPipe) id: number) {
    return this.notificationsService.retryPlatformMailLog(id);
  }

  @Get('channel-settings')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:settings:read')
  listChannelSettings() {
    return this.notificationChannelManagementService.listGlobalSettings();
  }

  @Get('channel-settings/:channel')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:settings:read')
  getChannelSetting(
    @Param('channel') channel: NotificationChannelEnum,
  ) {
    return this.notificationChannelManagementService.getGlobalSetting(channel);
  }

  @Patch('channel-settings/:channel')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:settings:update')
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
    );
  }

  @Get('channel-registry')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:settings:read')
  listChannelRegistry(@Query() query: NotificationChannelRegistryQueryDto) {
    return this.notificationChannelManagementService.listRegistry(query);
  }

  @Get('channel-registry/:channel/:code')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:settings:read')
  getChannelRegistryItem(
    @Param('channel') channel: NotificationChannelEnum,
    @Param('code') code: string,
  ) {
    return this.notificationChannelManagementService.getRegistryItem(
      channel,
      code,
    );
  }

  @Patch('channel-registry/:channel/:code')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('notifications:settings:update')
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
    );
  }

  @Get('platform/channel-settings')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('notifications:settings:read')
  listPlatformChannelSettings() {
    return this.notificationChannelManagementService.listGlobalSettings();
  }

  @Patch('platform/channel-settings/:channel')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('notifications:settings:update')
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
  @Permissions('notifications:settings:read')
  listPlatformChannelRegistry(
    @Query() query: NotificationChannelRegistryQueryDto,
  ) {
    return this.notificationChannelManagementService.listRegistry(query);
  }

  @Patch('platform/channel-registry/:channel/:code')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('notifications:settings:update')
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
  archive(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const { companyId, companyMembershipId } =
      this.notificationsService.assertCompanyActor(req.user);

    return this.notificationsService.archive(
      companyId,
      companyMembershipId,
      id,
    );
  }
}
