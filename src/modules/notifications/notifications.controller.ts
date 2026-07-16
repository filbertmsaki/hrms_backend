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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CreateTestNotificationDto } from './dto/create-test-notification.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
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
  unreadCount(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    const { companyId, companyMembershipId } =
      this.notificationsService.assertCompanyActor(req.user);

    return this.notificationsService.getUnreadCount(
      companyId,
      companyMembershipId,
    );
  }

  @Post('test')
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
    });
  }

  @Patch(':id/seen')
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
  markAllAsRead(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    const { companyId, companyMembershipId } =
      this.notificationsService.assertCompanyActor(req.user);

    return this.notificationsService.markAllAsRead(
      companyId,
      companyMembershipId,
    );
  }

  @Delete(':id')
  archive(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const { companyId, companyMembershipId } =
      this.notificationsService.assertCompanyActor(req.user);

    return this.notificationsService.archive(companyId, companyMembershipId, id);
  }
}
