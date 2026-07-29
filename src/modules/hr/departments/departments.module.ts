import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HrSharedModule } from '../shared/hr-shared.module';
import { Branch } from '../branches/entities/branch.entity';
import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';
import { Department } from './entities/department.entity';
import { DepartmentPosition } from './entities/department-position.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Department, Branch, DepartmentPosition]),
    HrSharedModule,
  ],
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
  exports: [DepartmentsService, TypeOrmModule],
})
export class DepartmentsModule {}
