import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HikvisionModule } from '../../hikvision/hikvision.module';
import { AccessWeekPlanSegment } from '../access-week-plan-segments/entity/access-week-plan-segment.entity';
import { AccessWeekPlan } from './entity/access-week-plan.entity';
import { AccessWeekPlansController } from './controller/access-week-plans.controller';
import { AccessWeekPlansService } from './service/access-week-plans.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccessWeekPlan, AccessWeekPlanSegment]),
    HikvisionModule,
  ],
  controllers: [AccessWeekPlansController],
  providers: [AccessWeekPlansService],
  exports: [AccessWeekPlansService],
})
export class AccessWeekPlansModule {}
