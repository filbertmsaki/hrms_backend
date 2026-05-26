import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class SyncAllHikvisionDevicesDto {
  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branch_id?: number;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @ApiPropertyOptional({
    description: 'If true, continue syncing other devices when one fails',
    default: true,
  })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  continue_on_error?: boolean;
}
