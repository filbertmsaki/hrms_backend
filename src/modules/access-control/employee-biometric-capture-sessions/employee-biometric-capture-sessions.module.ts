import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HikvisionModule } from '../../hikvision/hikvision.module';
import { EmployeeAccessCredential } from '../employee-access-credentials/entity/employee-access-credential.entity';
import { EmployeeDeviceAssignment } from '../employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeDeviceAccessAuditLogsModule } from '../employee-device-access-audit-logs/employee-device-access-audit-logs.module';
import { EmployeeBiometricCaptureSession } from './entity/employee-biometric-capture-session.entity';
import { EmployeeBiometricCaptureSessionService } from './service/employee-biometric-capture-session.service';
import { Employee } from '../../hr/employees/entities/employee.entity';
import { AttendanceDevice } from '../../hr/attendance/devices/entities/attendance-device.entity';
import { EmployeeDeviceIdentity } from '../../hr/attendance/processing/entities/employee-device-identity.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmployeeBiometricCaptureSession,
      Employee,
      AttendanceDevice,
      EmployeeAccessCredential,
      EmployeeDeviceAssignment,
      EmployeeDeviceIdentity,
    ]),
    HikvisionModule,
    EmployeeDeviceAccessAuditLogsModule,
  ],
  providers: [EmployeeBiometricCaptureSessionService],
  exports: [EmployeeBiometricCaptureSessionService],
})
export class EmployeeBiometricCaptureSessionsModule {}

