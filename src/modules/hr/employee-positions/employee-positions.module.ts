import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeePosition } from '../employees/entities/employee-position.entity';
import { Position } from '../positions/entities/position.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import { EmployeePositionsController } from './employee-positions.controller';
import { EmployeePositionsService } from './employee-positions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmployeePosition, Employee, Position]),
    HrSharedModule,
  ],
  controllers: [EmployeePositionsController],
  providers: [EmployeePositionsService],
  exports: [EmployeePositionsService, TypeOrmModule],
})
export class EmployeePositionsModule {}
