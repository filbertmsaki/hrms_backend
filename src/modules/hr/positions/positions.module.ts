import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { DepartmentPosition } from '../departments/entities/department-position.entity';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import { PositionsController } from './positions.controller';
import { PositionsService } from './positions.service';
import { Position } from './entities/position.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Position,
      Branch,
      Department,
      DepartmentPosition,
      Employee,
    ]),
    HrSharedModule,
  ],
  controllers: [PositionsController],
  providers: [PositionsService],
  exports: [PositionsService, TypeOrmModule],
})
export class PositionsModule {}
