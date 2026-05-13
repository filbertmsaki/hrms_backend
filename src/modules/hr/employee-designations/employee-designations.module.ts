import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Designation } from '../designations/entities/designation.entity';
import { EmployeeDesignation } from '../employees/entities/employee-designation.entity';
import { Employee } from '../employees/entities/employee.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import { EmployeeDesignationsController } from './employee-designations.controller';
import { EmployeeDesignationsService } from './employee-designations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmployeeDesignation, Employee, Designation]),
    HrSharedModule,
  ],
  controllers: [EmployeeDesignationsController],
  providers: [EmployeeDesignationsService],
  exports: [EmployeeDesignationsService, TypeOrmModule],
})
export class EmployeeDesignationsModule {}
