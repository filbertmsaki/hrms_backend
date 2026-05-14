import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class SwitchCompanyDto {
  @ApiProperty({
    description: 'Target company ID to switch the active tenant context.',
    example: 2,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  company_id: number;
}
