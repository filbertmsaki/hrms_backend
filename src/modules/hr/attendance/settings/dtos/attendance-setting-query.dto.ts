import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';

export class AttendanceSettingQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by auto calculate flag' })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  auto_calculate?: boolean;

  @ApiPropertyOptional({ description: 'Filter by approval requirement flag' })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  requires_approval?: boolean;
}





