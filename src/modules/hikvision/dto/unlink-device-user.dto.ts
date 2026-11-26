import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class UnlinkDeviceUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  employee_no: string;

  @IsInt()
  @Min(1)
  expected_employee_id: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
