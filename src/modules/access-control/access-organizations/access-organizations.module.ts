import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessOrganization } from './entity/access-organization.entity';
import { AccessOrganizationsController } from './controller/access-organizations.controller';
import { AccessOrganizationsService } from './service/access-organizations.service';
import { Branch } from '../../hr/branches/entities/branch.entity';
import { Department } from '../../hr/departments/entities/department.entity';
import { AttendanceDevice } from '../../access-control/attendance-devices/entities/attendance-device.entity';
import { HikvisionModule } from '../../hikvision/hikvision.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccessOrganization, Branch, Department, AttendanceDevice]),
    HikvisionModule,
  ],
  controllers: [AccessOrganizationsController],
  providers: [AccessOrganizationsService],
  exports: [AccessOrganizationsService],
})
export class AccessOrganizationsModule {}

