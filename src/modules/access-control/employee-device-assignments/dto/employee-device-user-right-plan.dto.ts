import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class EmployeeDeviceUserRightPlanDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  door_no: number;

  @ApiProperty()
  @IsString()
  @MaxLength(50)
  plan_template_no: string;
}
