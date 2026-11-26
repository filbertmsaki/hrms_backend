import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class CorrectDeviceUserNameDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  employee_no: string;

  @IsInt()
  @Min(1)
  expected_employee_id: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  expected_device_name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  expected_hrms_name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
