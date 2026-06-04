import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class EmployeeDeviceAssignmentMatchQueryDto {
  @ApiProperty({ example: 12, description: 'Attendance device ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  deviceId: number;

  @ApiProperty({ example: 34, description: 'Employee ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employeeId: number;
}
