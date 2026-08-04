import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ActionItemStatusEnum } from '../enums/action-item-status.enum';

export class ActionItemQueryDto {
  @IsEnum(ActionItemStatusEnum)
  @IsOptional()
  status?: ActionItemStatusEnum;

  @IsString()
  @IsOptional()
  source_module?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;
}
