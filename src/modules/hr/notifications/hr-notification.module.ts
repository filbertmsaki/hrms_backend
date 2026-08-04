import { Module } from '@nestjs/common';
import { MailModule } from '../../mail/mail.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { ActionInboxModule } from '../action-inbox/action-inbox.module';
import { HrInAppNotificationListener } from './hr-in-app-notification.listener';
import { HrNotificationListener } from './hr-notification.listener';

@Module({
  imports: [MailModule, NotificationsModule, ActionInboxModule],
  providers: [HrNotificationListener, HrInAppNotificationListener],
})
export class HrNotificationModule {}
