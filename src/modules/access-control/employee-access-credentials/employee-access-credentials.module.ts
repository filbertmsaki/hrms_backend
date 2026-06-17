import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceDevice } from '../../access-control/attendance-devices/entities/attendance-device.entity';
import { Employee } from '../../hr/employees/entities/employee.entity';
import { HikvisionModule } from '../../hikvision/hikvision.module';
import { EmployeeDeviceAssignment } from '../employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeAccessCredential } from './entity/employee-access-credential.entity';
import { EmployeeAccessCredentialsService } from './service/employee-access-credentials.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmployeeAccessCredential,
      Employee,
      AttendanceDevice,
      EmployeeDeviceAssignment,
    ]),
    HikvisionModule,
  ],
  providers: [EmployeeAccessCredentialsService],
  exports: [EmployeeAccessCredentialsService],
})
export class EmployeeAccessCredentialsModule {}
