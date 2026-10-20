import { Repository } from 'typeorm';
import { CompanyUser } from '../../../companies/entities/company-user.entity';

export function onboardingPositionId(
  metadata?: Record<string, unknown> | null,
): number | null {
  const value = metadata?.assigned_position_id;
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : null;
}

export async function resolvePositionMembers(
  repository: Repository<CompanyUser>,
  companyId: number,
  positionId: number,
): Promise<CompanyUser[]> {
  return repository
    .createQueryBuilder('membership')
    .innerJoinAndSelect('membership.user', 'user')
    .innerJoin('membership.employee', 'employee')
    .leftJoin(
      'employee.position_assignments',
      'positionAssignment',
      "positionAssignment.company_id = :companyId AND positionAssignment.status = 'ACTIVE' AND positionAssignment.start_date <= CURRENT_DATE AND (positionAssignment.end_date IS NULL OR positionAssignment.end_date >= CURRENT_DATE)",
    )
    .where('membership.company_id = :companyId', { companyId })
    .andWhere("membership.status = 'active'")
    .andWhere('employee.company_id = :companyId', { companyId })
    .andWhere("employee.employment_status = 'active'")
    .andWhere(
      '(employee.primary_position_id = :positionId OR positionAssignment.position_id = :positionId)',
      { positionId },
    )
    .distinct(true)
    .getMany();
}
