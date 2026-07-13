import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { HikvisionSyncLogDirectionEnum } from '../enum/hikvision-sync-log-direction.enum';
import { HikvisionSyncLogStatusEnum } from '../enum/hikvision-sync-log-status.enum';
import { HikvisionSyncLogTypeEnum } from '../enum/hikvision-sync-log-type.enum';

export class QueryHikvisionSyncLogDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  deviceId?: number;

  @IsEnum(HikvisionSyncLogTypeEnum)
  @IsOptional()
  syncType?: HikvisionSyncLogTypeEnum;

  @IsEnum(HikvisionSyncLogDirectionEnum)
  @IsOptional()
  direction?: HikvisionSyncLogDirectionEnum;

  @IsEnum(HikvisionSyncLogStatusEnum)
  @IsOptional()
  status?: HikvisionSyncLogStatusEnum;

  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}
