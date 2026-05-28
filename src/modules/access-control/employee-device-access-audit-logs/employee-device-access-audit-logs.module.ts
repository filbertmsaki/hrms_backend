import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeDeviceAccessAuditLogsController } from './controller/employee-device-access-audit-logs.controller';
import { EmployeeDeviceAccessAuditLog } from './entity/employee-device-access-audit-log.entity';
import { EmployeeDeviceAccessAuditLogService } from './service/employee-device-access-audit-log.service';

@Module({
  imports: [TypeOrmModule.forFeature([EmployeeDeviceAccessAuditLog])],
  controllers: [EmployeeDeviceAccessAuditLogsController],
  providers: [EmployeeDeviceAccessAuditLogService],
  exports: [EmployeeDeviceAccessAuditLogService],
})
export class EmployeeDeviceAccessAuditLogsModule {}

