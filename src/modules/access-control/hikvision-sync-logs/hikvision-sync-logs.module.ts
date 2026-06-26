import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HikvisionSyncLog } from './entity/hikvision-sync-log.entity';
import { HikvisionSyncLogService } from './service/hikvision-sync-log.service';
import { HikvisionSyncLogsController } from './controller/hikvision-sync-logs.controller';

@Module({
  imports: [TypeOrmModule.forFeature([HikvisionSyncLog])],
  controllers: [HikvisionSyncLogsController],
  providers: [HikvisionSyncLogService],
  exports: [HikvisionSyncLogService],
})
export class HikvisionSyncLogsModule {}
