import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../hr/branches/entities/branch.entity';
import { AttendanceDevice } from '../hr/attendance/devices/entities/attendance-device.entity';
import { AccessDoor } from '../access-control/access-doors/entity/access-door.entity';
import { HikvisionController } from './hikvision.controller';
import { HikvisionAccessControlService } from './hikvision-access-control.service';
import { HikvisionDoorSyncService } from './hikvision-door.service';
import { HikvisionService } from './hikvision.service';
import { HikvisionDigestClient } from './helpers/hikvision-digest.client';
import { HikvisionParserHelper } from './helpers/hikvision-parser.helper';

@Module({
  imports: [TypeOrmModule.forFeature([AttendanceDevice, Branch, AccessDoor])],
  controllers: [HikvisionController],
  providers: [
    HikvisionService,
    HikvisionDoorSyncService,
    HikvisionAccessControlService,
    HikvisionDigestClient,
    HikvisionParserHelper,
  ],
  exports: [HikvisionService, HikvisionDoorSyncService, HikvisionAccessControlService],
})
export class HikvisionModule {}
