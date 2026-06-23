import { Module } from '@nestjs/common';
import { MailModule } from '../../mail/mail.module';
import { HrNotificationListener } from './hr-notification.listener';

@Module({
  imports: [MailModule],
  providers: [HrNotificationListener],
})
export class HrNotificationModule {}
