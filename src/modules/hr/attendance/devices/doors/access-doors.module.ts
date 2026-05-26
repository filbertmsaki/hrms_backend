import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../../../branches/entities/branch.entity';
import { AttendanceDevice } from '../entities/attendance-device.entity';
import { HikvisionModule } from '../../../../hikvision/hikvision.module';
import { AccessDoor } from './entity/access-door.entity';
import { AccessDoorsController } from './controller/access-doors.controller';
import { AccessDoorsService } from './service/access-doors.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccessDoor, AttendanceDevice, Branch]),
    HikvisionModule,
  ],
  controllers: [AccessDoorsController],
  providers: [AccessDoorsService],
  exports: [AccessDoorsService],
})
export class AccessDoorsModule {}
