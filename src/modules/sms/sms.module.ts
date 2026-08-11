import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyUser } from '../companies/entities/company-user.entity';
import { Employee } from '../hr/employees/entities/employee.entity';
import { SmsGlobalSetting } from './entities/sms-global-setting.entity';
import { SmsNotificationLog } from './entities/sms-notification-log.entity';
import { SmsNotificationRegistry } from './entities/sms-notification-registry.entity';
import { SmsAdminController } from './sms-admin.controller';
import { SmsNotificationManagementService } from './sms-notification-management.service';
import { SmsService } from './sms.service';

@Global()
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      SmsGlobalSetting,
      SmsNotificationRegistry,
      SmsNotificationLog,
      CompanyUser,
      Employee,
    ]),
  ],
  controllers: [SmsAdminController],
  providers: [SmsService, SmsNotificationManagementService],
  exports: [SmsService, SmsNotificationManagementService],
})
export class SmsModule {}
