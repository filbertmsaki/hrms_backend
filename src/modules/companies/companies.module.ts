import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Permission } from '../permissions/entities/permission.entity';
import { Role } from '../roles/entities/role.entity';
import { User } from '../users/entities/user.entity';
import { AttendanceDevice } from '../access-control/attendance-devices/entities/attendance-device.entity';
import { AttendancePolicy } from '../hr/attendance/policies/entities/attendance-policy.entity';
import { Timetable } from '../hr/attendance/timetable/timetables/entities/timetable.entity';
import { Branch } from '../hr/branches/entities/branch.entity';
import { Department } from '../hr/departments/entities/department.entity';
import { Employee } from '../hr/employees/entities/employee.entity';
import { Company } from './entities/company.entity';
import { CompanyUser } from './entities/company-user.entity';
import { CompanyUserPermission } from './entities/company-user-permission.entity';
import { CompanyUserRole } from './entities/company-user-role.entity';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { DefaultAvatarsModule } from '../hr/default-avatars/default-avatars.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      CompanyUser,
      CompanyUserRole,
      CompanyUserPermission,
      User,
      Role,
      Permission,
      Branch,
      Department,
      Employee,
      AttendancePolicy,
      Timetable,
      AttendanceDevice,
    ]),
    DefaultAvatarsModule,
  ],
  controllers: [CompaniesController],
  providers: [CompaniesService, TenantGuard],
  exports: [CompaniesService, TypeOrmModule],
})
export class CompaniesModule {}
