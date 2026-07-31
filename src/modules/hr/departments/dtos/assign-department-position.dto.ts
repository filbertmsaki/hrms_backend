import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty } from 'class-validator';

export class AssignDepartmentPositionDto {
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  position_id: number;
}
