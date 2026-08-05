import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import { Branch } from '../branches/entities/branch.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Position } from '../positions/entities/position.entity';
import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';
import { CompanyUserDepartmentAccess } from './entities/company-user-department-access.entity';
import { Department } from './entities/department.entity';
import { DepartmentPosition } from './entities/department-position.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Department,
      CompanyUserDepartmentAccess,
      Branch,
      DepartmentPosition,
      Position,
      Employee,
      CompanyUser,
    ]),
    HrSharedModule,
  ],
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
  exports: [DepartmentsService, TypeOrmModule],
})
export class DepartmentsModule {}
