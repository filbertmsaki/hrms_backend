import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HikvisionModule } from '../../hikvision/hikvision.module';
import { AttendanceDevice } from '../../access-control/attendance-devices/entities/attendance-device.entity';
import { AccessWeekPlan } from '../access-week-plans/entity/access-week-plan.entity';
import { AccessScheduleTemplate } from './entity/access-schedule-template.entity';
import { AccessScheduleTemplatesController } from './controller/access-schedule-templates.controller';
import { AccessScheduleTemplatesService } from './service/access-schedule-templates.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccessScheduleTemplate, AccessWeekPlan, AttendanceDevice]),
    HikvisionModule,
  ],
  controllers: [AccessScheduleTemplatesController],
  providers: [AccessScheduleTemplatesService],
  exports: [AccessScheduleTemplatesService],
})
export class AccessScheduleTemplatesModule {}

