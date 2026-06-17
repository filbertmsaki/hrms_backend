import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { AccessOrganization } from './entity/access-organization.entity';
import { AccessOrganizationsController } from './controller/access-organizations.controller';
import { AccessOrganizationsService } from './service/access-organizations.service';
import { AccessGroup } from '../access-groups/entity/access-group.entity';
import { AccessGroupDevice } from '../access-group-devices/entity/access-group-device.entity';
import { AccessGroupDoor } from '../access-group-doors/entity/access-group-door.entity';
import { AccessGroupEmployee } from '../access-group-employees/entity/access-group-employee.entity';
import { AccessOrganizationEmployee } from '../access-organization-employees/entity/access-organization-employee.entity';
import { Branch } from '../../hr/branches/entities/branch.entity';
import { Department } from '../../hr/departments/entities/department.entity';
import { Employee } from '../../hr/employees/entities/employee.entity';
import { AttendanceDevice } from '../../access-control/attendance-devices/entities/attendance-device.entity';
import { AccessGroupsModule } from '../access-groups/access-groups.module';
import { EmployeeDeviceAssignmentsModule } from '../employee-device-assignments/employee-device-assignments.module';
import { HikvisionModule } from '../../hikvision/hikvision.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccessOrganization,
      AccessOrganizationEmployee,
      AccessGroup,
      AccessGroupDevice,
      AccessGroupDoor,
      AccessGroupEmployee,
      Branch,
      Department,
      Employee,
      CompanyUser,
      AttendanceDevice,
    ]),
    AccessGroupsModule,
    EmployeeDeviceAssignmentsModule,
    HikvisionModule,
  ],
  controllers: [AccessOrganizationsController],
  providers: [AccessOrganizationsService],
  exports: [AccessOrganizationsService],
})
export class AccessOrganizationsModule {}
