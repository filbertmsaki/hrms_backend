import { Module } from '@nestjs/common';
import { HikvisionModule } from '../../hikvision/hikvision.module';
import { DeviceCommandLogsController } from './controller/device-command-logs.controller';

@Module({
  imports: [HikvisionModule],
  controllers: [DeviceCommandLogsController],
})
export class DeviceCommandLogsModule {}

