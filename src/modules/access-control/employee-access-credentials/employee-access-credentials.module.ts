import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceDevice } from '../../hr/attendance/devices/entities/attendance-device.entity';
import { Employee } from '../../hr/employees/entities/employee.entity';
import { EmployeeDeviceAssignment } from '../employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeAccessCredential } from './entity/employee-access-credential.entity';
import { EmployeeAccessCredentialsController } from './controller/employee-access-credentials.controller';
import { EmployeeAccessCredentialsService } from './service/employee-access-credentials.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmployeeAccessCredential,
      Employee,
      AttendanceDevice,
      EmployeeDeviceAssignment,
    ]),
  ],
  controllers: [EmployeeAccessCredentialsController],
  providers: [EmployeeAccessCredentialsService],
  exports: [EmployeeAccessCredentialsService],
})
export class EmployeeAccessCredentialsModule {}
