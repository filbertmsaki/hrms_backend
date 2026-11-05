import { EntityManager, In, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import {
  SelfServiceApprovalAction,
  SelfServiceApprovalStage,
  SelfServiceRequestApproval,
  SelfServiceRequestKind,
} from './entities/self-service-request-approval.entity';
import { SelfServiceRequestStatusEnum } from './enums/self-service-request-status.enum';

/**
 * Shared two-stage workflow for attendance correction and profile update
 * requests: employee -> department manager / line manager -> HR final approval.
 * HR may give final approval while a request still awaits the manager.
 */

export const SELF_SERVICE_FINAL_APPROVE_PERMISSION =
  'self_service_requests:final_approve';

/** HR reviewers see every request and give final approval. */
export function isHrSelfServiceReviewer(actor: AuthenticatedUser) {
  return (actor.permissions ?? []).includes(
    SELF_SERVICE_FINAL_APPROVE_PERMISSION,
  );
}

/**
 * Managers of an employee: the `reports_to` line manager and the manager of
 * the employee's primary department. The employee is never their own manager.
 */
export async function resolveEmployeeManagerIds(
  manager: EntityManager,
  companyId: number,
  employeeId: number,
): Promise<number[]> {
  const employee = await manager.getRepository(Employee).findOne({
    where: { id: employeeId, company_id: companyId },
    select: ['id', 'reports_to', 'primary_department_id'],
  });
  if (!employee) return [];

  const ids = new Set<number>();
  if (employee.reports_to) ids.add(employee.reports_to);
  if (employee.primary_department_id) {
    const department = await manager.getRepository(Department).findOne({
      where: { id: employee.primary_department_id, company_id: companyId },
      select: ['id', 'manager_employee_id'],
    });
    if (department?.manager_employee_id) {
      ids.add(department.manager_employee_id);
    }
  }
  ids.delete(employeeId);
  return [...ids];
}

/** Requests with no line or department manager go straight to HR. */
export async function resolveSubmittedStatus(
  manager: EntityManager,
  companyId: number,
  employeeId: number,
) {
  const managerIds = await resolveEmployeeManagerIds(
    manager,
    companyId,
    employeeId,
  );
  return managerIds.length > 0
    ? SelfServiceRequestStatusEnum.PENDING_MANAGER_APPROVAL
    : SelfServiceRequestStatusEnum.PENDING_HR_APPROVAL;
}

/**
 * Restrict a request query to employees the manager supervises directly or
 * through a department they manage. `employeeIdColumn` is the request's
 * employee id column, e.g. `r.employeeId`.
 */
export function applyManagerScope<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  employeeIdColumn: string,
  companyId: number,
  managerEmployeeId: number,
) {
  return qb
    .innerJoin(
      Employee,
      'scopeEmployee',
      `scopeEmployee.id = ${employeeIdColumn} AND scopeEmployee.company_id = :scopeCompanyId`,
      { scopeCompanyId: companyId },
    )
    .leftJoin(
      Department,
      'scopeDepartment',
      'scopeDepartment.id = scopeEmployee.primary_department_id AND scopeDepartment.company_id = :scopeCompanyId',
    )
    .andWhere(
      '(scopeEmployee.reports_to = :scopeManagerId OR scopeDepartment.manager_employee_id = :scopeManagerId)',
      { scopeManagerId: managerEmployeeId },
    )
    .andWhere('scopeEmployee.id <> :scopeManagerId');
}

export function isPendingManagerStatus(status: SelfServiceRequestStatusEnum) {
  return (
    status === SelfServiceRequestStatusEnum.PENDING_MANAGER_APPROVAL ||
    status === SelfServiceRequestStatusEnum.SUBMITTED
  );
}

export async function recordSelfServiceApproval(
  manager: EntityManager,
  input: {
    companyId: number;
    requestKind: SelfServiceRequestKind;
    requestId: number;
    stage: SelfServiceApprovalStage;
    action: SelfServiceApprovalAction;
    fromStatus: string | null;
    toStatus: string;
    actorCompanyUserId: number | null;
    actorEmployeeId: number | null;
    comment?: string | null;
    metadata?: Record<string, unknown> | null;
  },
) {
  const repository = manager.getRepository(SelfServiceRequestApproval);
  return repository.save(
    repository.create({
      ...input,
      comment: input.comment ?? null,
      metadata: input.metadata ?? null,
    }),
  );
}

export async function loadSelfServiceApprovalHistory(
  manager: EntityManager,
  companyId: number,
  requestKind: SelfServiceRequestKind,
  requestIds: number[],
) {
  const byRequest = new Map<number, ReturnType<typeof mapApproval>[]>();
  if (!requestIds.length) return byRequest;
  const rows = await manager.getRepository(SelfServiceRequestApproval).find({
    where: { companyId, requestKind, requestId: In(requestIds) },
    order: { createdAt: 'ASC', id: 'ASC' },
  });
  for (const row of rows) {
    const current = byRequest.get(row.requestId) ?? [];
    current.push(mapApproval(row));
    byRequest.set(row.requestId, current);
  }
  return byRequest;
}

function mapApproval(row: SelfServiceRequestApproval) {
  return {
    id: row.id,
    stage: row.stage,
    action: row.action,
    from_status: row.fromStatus,
    to_status: row.toStatus,
    actor_company_user_id: row.actorCompanyUserId,
    actor_employee_id: row.actorEmployeeId,
    comment: row.comment,
    metadata: row.metadata,
    created_at: row.createdAt,
  };
}

/** Employee name and department for reviewer lists. */
export async function loadEmployeeSummaries(
  manager: EntityManager,
  companyId: number,
  employeeIds: number[],
) {
  const summaries = new Map<
    number,
    {
      employee_name: string;
      employee_no: string | null;
      department_id: number | null;
      department_name: string | null;
      reports_to: number | null;
    }
  >();
  if (!employeeIds.length) return summaries;
  const employees = await manager.getRepository(Employee).find({
    where: { id: In([...new Set(employeeIds)]), company_id: companyId },
    select: [
      'id',
      'first_name',
      'last_name',
      'employee_no',
      'primary_department_id',
      'reports_to',
    ],
  });
  const departmentIds = [
    ...new Set(
      employees
        .map((employee) => employee.primary_department_id)
        .filter((id): id is number => !!id),
    ),
  ];
  const departments = departmentIds.length
    ? await manager.getRepository(Department).find({
        where: { id: In(departmentIds), company_id: companyId },
        select: ['id', 'name'],
      })
    : [];
  const departmentNames = new Map(departments.map((d) => [d.id, d.name]));
  for (const employee of employees) {
    summaries.set(employee.id, {
      employee_name: [employee.first_name, employee.last_name]
        .filter(Boolean)
        .join(' '),
      employee_no: employee.employee_no ?? null,
      department_id: employee.primary_department_id ?? null,
      department_name: employee.primary_department_id
        ? (departmentNames.get(employee.primary_department_id) ?? null)
        : null,
      reports_to: employee.reports_to ?? null,
    });
  }
  return summaries;
}
