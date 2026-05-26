import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../../branches/entities/branch.entity';
import { AttendanceDevice } from '../devices/entities/attendance-device.entity';
import { AttendanceLog } from './entities/attendance-log.entity';
import { HikvisionController } from './hikvision.controller';
import { HikvisionAuthService } from './hikvision-auth.service';
import { HikvisionListener } from './hikvision.listener';
import { HikvisionService } from './hikvision.service';
import { HikvisionParserHelper } from './helpers/hikvision-parser.helper';

@Module({
  imports: [TypeOrmModule.forFeature([AttendanceDevice, AttendanceLog, Branch])],
  controllers: [HikvisionController],
  providers: [HikvisionService, HikvisionAuthService, HikvisionListener, HikvisionParserHelper],
  exports: [HikvisionService, HikvisionListener, TypeOrmModule],
})
export class HikvisionModule {}
