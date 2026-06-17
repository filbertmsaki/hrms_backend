import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

class AccessGroupDoorAssignmentItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  door_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  schedule_template_id: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  device_id?: number;
}

export class AssignAccessGroupDoorsDto {
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  door_ids?: number[];

  @ApiPropertyOptional({ type: [AccessGroupDoorAssignmentItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AccessGroupDoorAssignmentItemDto)
  @IsOptional()
  items?: AccessGroupDoorAssignmentItemDto[];
}
