import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { HikvisionSyncLogStatusEnum } from '../../access-control/hikvision-sync-logs/enum/hikvision-sync-log-status.enum';

export class QueryHikvisionAttendanceSyncHistoryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: HikvisionSyncLogStatusEnum })
  @IsEnum(HikvisionSyncLogStatusEnum)
  @IsOptional()
  status?: HikvisionSyncLogStatusEnum;

  @ApiPropertyOptional({ example: '2026-06-05T00:00:00+03:00' })
  @IsDateString()
  @IsOptional()
  from_date?: string;

  @ApiPropertyOptional({ example: '2026-06-05T23:59:59+03:00' })
  @IsDateString()
  @IsOptional()
  to_date?: string;
}
