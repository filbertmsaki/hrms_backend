import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../hr/branches/entities/branch.entity';
import { AttendanceDevice } from '../hr/attendance/devices/entities/attendance-device.entity';
import { AccessDoor } from '../access-control/access-doors/entity/access-door.entity';
import { HikvisionSyncLog } from '../access-control/hikvision-sync-logs/entity/hikvision-sync-log.entity';
import { DeviceCommandLog } from './device-command-logs/entity/device-command-log.entity';
import { DeviceCommandLogService } from './device-command-logs/service/device-command-log.service';
import { HikvisionAccessControlService } from './hikvision-access-control.service';
import { HikvisionAttendanceController } from './hikvision-attendance.controller';
import { HikvisionAttendanceSyncService } from './hikvision-attendance-sync.service';
import { HikvisionDoorSyncService } from './hikvision-door.service';
import { HikvisionService } from './hikvision.service';
import { HikvisionAttendanceLog } from './entities/hikvision-attendance-log.entity';
import { HikvisionDigestClient } from './helpers/hikvision-digest.client';
import { HikvisionParserHelper } from './helpers/hikvision-parser.helper';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendanceDevice,
      Branch,
      AccessDoor,
      DeviceCommandLog,
      HikvisionAttendanceLog,
      HikvisionSyncLog,
    ]),
  ],
  controllers: [HikvisionAttendanceController],
  providers: [
    HikvisionService,
    HikvisionDoorSyncService,
    HikvisionAccessControlService,
    HikvisionAttendanceSyncService,
    DeviceCommandLogService,
    HikvisionDigestClient,
    HikvisionParserHelper,
  ],
  exports: [
    HikvisionService,
    HikvisionDoorSyncService,
    HikvisionAccessControlService,
    HikvisionAttendanceSyncService,
    DeviceCommandLogService,
  ],
})
export class HikvisionModule {}
