import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../hr/branches/entities/branch.entity';
import { AttendanceDevice } from '../hr/attendance/devices/entities/attendance-device.entity';
import { AccessDoor } from '../hr/attendance/devices/doors/entity/access-door.entity';
import { HikvisionController } from './hikvision.controller';
import { HikvisionDoorSyncService } from './hikvision-door.service';
import { HikvisionService } from './hikvision.service';
import { HikvisionDigestClient } from './helpers/hikvision-digest.client';
import { HikvisionParserHelper } from './helpers/hikvision-parser.helper';

@Module({
  imports: [TypeOrmModule.forFeature([AttendanceDevice, Branch, AccessDoor])],
  controllers: [HikvisionController],
  providers: [HikvisionService, HikvisionDoorSyncService, HikvisionDigestClient, HikvisionParserHelper],
  exports: [HikvisionService, HikvisionDoorSyncService],
})
export class HikvisionModule {}
