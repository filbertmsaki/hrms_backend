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
  TeamRecommendationsController,
  ReviewRecommendationsController,
} from './manager-recommendations.controller';
import { ManagerRecommendation } from './entities/manager-recommendation.entity';
import { TeamRecommendation } from './entities/team-recommendation.entity';
import { TeamRecommendationsService } from './team-recommendations.service';
import { ManagerRecommendationsService } from './manager-recommendations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ManagerRecommendation,
      TeamRecommendation,
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
    TeamRecommendationsController,
    ReviewRecommendationsController,
  ],
  providers: [ManagerRecommendationsService, TeamRecommendationsService],
  exports: [ManagerRecommendationsService],
})
export class ManagerRecommendationsModule {}
