import { EntityManager, In, Not } from 'typeorm';
import { DepartmentPosition } from '../departments/entities/department-position.entity';
import { Employee } from '../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { Position } from '../positions/entities/position.entity';

export async function departmentSeatUsage(
  manager: EntityManager,
  companyId: number,
  position: Pick<Position, 'id' | 'headcount'>,
  departmentId?: number | null,
  excludeEmployeeId?: number,
) {
  const mapping = departmentId
    ? await manager.getRepository(DepartmentPosition).findOneBy({
        company_id: companyId,
        department_id: departmentId,
        position_id: position.id,
      })
    : null;
  const filled = await manager.getRepository(Employee).countBy({
    company_id: companyId,
    primary_position_id: position.id,
    ...(departmentId ? { primary_department_id: departmentId } : {}),
    ...(excludeEmployeeId ? { id: Not(excludeEmployeeId) } : {}),
    employment_status: In([
      EmploymentStatusEnum.ONBOARDING,
      EmploymentStatusEnum.ACTIVE,
      EmploymentStatusEnum.SUSPENDED,
    ]),
  });
  return { filled, headcount: mapping?.headcount ?? position.headcount };
}
