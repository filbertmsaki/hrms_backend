import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeeGrade } from './entities/employee-grade.entity';
import { EmployeeGradesController } from './employee-grades.controller';
import { EmployeeGradesService } from './employee-grades.service';

@Module({
  imports: [TypeOrmModule.forFeature([EmployeeGrade, Employee])],
  controllers: [EmployeeGradesController],
  providers: [EmployeeGradesService],
  exports: [EmployeeGradesService, TypeOrmModule],
})
export class EmployeeGradesModule {}
