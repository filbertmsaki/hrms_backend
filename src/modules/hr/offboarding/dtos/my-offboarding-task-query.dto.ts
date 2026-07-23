import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';
import { OffboardingTaskPriorityEnum } from '../enums/offboarding-task-priority.enum';
import { OffboardingTaskStatusEnum } from '../enums/offboarding-task-status.enum';

export class MyOffboardingTaskQueryDto extends PaginationDto {
  @IsEnum(OffboardingTaskStatusEnum)
  @IsOptional()
  status?: OffboardingTaskStatusEnum;

  @IsEnum(OffboardingTaskPriorityEnum)
  @IsOptional()
  priority?: OffboardingTaskPriorityEnum;
}
