import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';
import { EmployeeDeviceAssignmentSyncStatusEnum } from '../../../../access-control/employee-device-assignments/enum/employee-device-assignment-sync-status.enum';

export class AttendanceDeviceEmployeesQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: EmployeeDeviceAssignmentSyncStatusEnum })
  @IsEnum(EmployeeDeviceAssignmentSyncStatusEnum)
  @IsOptional()
  sync_status?: EmployeeDeviceAssignmentSyncStatusEnum;
}

