import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../hr/branches/entities/branch.entity';
import { AttendanceDevice } from '../hr/attendance/devices/entities/attendance-device.entity';
import { HikvisionController } from './hikvision.controller';
import { HikvisionService } from './hikvision.service';
import { HikvisionDigestClient } from './helpers/hikvision-digest.client';
import { HikvisionParserHelper } from './helpers/hikvision-parser.helper';

@Module({
  imports: [TypeOrmModule.forFeature([AttendanceDevice, Branch])],
  controllers: [HikvisionController],
  providers: [HikvisionService, HikvisionDigestClient, HikvisionParserHelper],
  exports: [HikvisionService],
})
export class HikvisionModule {}
