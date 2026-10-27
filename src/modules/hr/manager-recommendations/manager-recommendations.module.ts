import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import {
  ManagerRecommendationsController,
  HrManagerRecommendationsController,
} from './manager-recommendations.controller';
import { ManagerRecommendation } from './entities/manager-recommendation.entity';
import { ManagerRecommendationsService } from './manager-recommendations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ManagerRecommendation,
      Company,
      Employee,
      Department,
      Branch,
    ]),
    HrSharedModule,
  ],
  controllers: [
    ManagerRecommendationsController,
    HrManagerRecommendationsController,
  ],
  providers: [ManagerRecommendationsService],
  exports: [ManagerRecommendationsService],
})
export class ManagerRecommendationsModule {}
