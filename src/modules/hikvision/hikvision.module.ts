import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../hr/branches/entities/branch.entity';
import { AttendanceDevice } from '../hr/attendance/devices/entities/attendance-device.entity';
import { AccessDoor } from '../access-control/access-doors/entity/access-door.entity';
import { DeviceCommandLog } from './device-command-logs/entity/device-command-log.entity';
import { DeviceCommandLogService } from './device-command-logs/service/device-command-log.service';
import { HikvisionController } from './hikvision.controller';
import { HikvisionAccessControlService } from './hikvision-access-control.service';
import { HikvisionDoorSyncService } from './hikvision-door.service';
import { HikvisionService } from './hikvision.service';
import { HikvisionDigestClient } from './helpers/hikvision-digest.client';
import { HikvisionParserHelper } from './helpers/hikvision-parser.helper';

@Module({
  imports: [TypeOrmModule.forFeature([AttendanceDevice, Branch, AccessDoor, DeviceCommandLog])],
  controllers: [HikvisionController],
  providers: [
    HikvisionService,
    HikvisionDoorSyncService,
    HikvisionAccessControlService,
    DeviceCommandLogService,
    HikvisionDigestClient,
    HikvisionParserHelper,
  ],
  exports: [
    HikvisionService,
    HikvisionDoorSyncService,
    HikvisionAccessControlService,
    DeviceCommandLogService,
  ],
})
export class HikvisionModule {}
