import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HikvisionModule } from '../../hikvision/hikvision.module';
import { AccessScheduleTemplate } from './entity/access-schedule-template.entity';
import { AccessScheduleTemplatesController } from './controller/access-schedule-templates.controller';
import { AccessScheduleTemplatesService } from './service/access-schedule-templates.service';

@Module({
  imports: [TypeOrmModule.forFeature([AccessScheduleTemplate]), HikvisionModule],
  controllers: [AccessScheduleTemplatesController],
  providers: [AccessScheduleTemplatesService],
  exports: [AccessScheduleTemplatesService],
})
export class AccessScheduleTemplatesModule {}
