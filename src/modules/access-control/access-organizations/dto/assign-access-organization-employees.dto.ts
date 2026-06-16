import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, Min } from 'class-validator';

export class AssignAccessOrganizationEmployeesDto {
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  employee_ids: number[];
}
