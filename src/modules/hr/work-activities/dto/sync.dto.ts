import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { FieldMobileSyncOperationEnum } from '../enums/work-activity.enums';

export class FieldMobileSyncItemDto {
  @IsUUID()
  client_request_id: string;

  @IsString()
  operation: FieldMobileSyncOperationEnum;

  @IsObject()
  payload: Record<string, unknown>;
}

export class FieldMobileSyncDto {
  @IsUUID()
  sync_request_id: string;

  @IsString()
  @MaxLength(255)
  device_identifier: string;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FieldMobileSyncItemDto)
  items: FieldMobileSyncItemDto[];
}

export class SyncStatusQueryDto {
  @IsOptional()
  @IsString()
  request_id?: string;
}
