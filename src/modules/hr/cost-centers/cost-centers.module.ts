import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { CostCentersController } from './cost-centers.controller';
import { CostCentersService } from './cost-centers.service';
import { CostCenter } from './entities/cost-center.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CostCenter, Branch, Department, Employee]),
  ],
  controllers: [CostCentersController],
  providers: [CostCentersService],
  exports: [CostCentersService, TypeOrmModule],
})
export class CostCentersModule {}
