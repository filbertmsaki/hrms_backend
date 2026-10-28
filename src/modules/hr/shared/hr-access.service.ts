import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { hasPermission } from '../../../common/utils/permission.util';
import { CompanyUserBranchAccess } from '../branches/entities/company-user-branch-access.entity';
import { Branch } from '../branches/entities/branch.entity';
import { CompanyUserDepartmentAccess } from '../departments/entities/company-user-department-access.entity';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';

export type AccessibleEmployeeSqlScope = {
  companyWide: boolean;
  actorEmployeeId: number | null;
  branchIds: number[];
  departmentIds: number[];
  managerEmployeeId: number | null;
};

@Injectable()
export class HrAccessService {
  constructor(
    @InjectRepository(CompanyUserBranchAccess)
    private readonly branchAccessRepository: Repository<CompanyUserBranchAccess>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(CompanyUserDepartmentAccess)
    private readonly departmentAccessRepository: Repository<CompanyUserDepartmentAccess>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  hasCompanyScope(actor: AuthenticatedUser): boolean {
    return hasPermission(actor.permissions, 'data_scope:company');
  }

  hasBranchScope(actor: AuthenticatedUser): boolean {
    return hasPermission(actor.permissions, 'data_scope:branch');
  }

  hasDepartmentScope(actor: AuthenticatedUser): boolean {
    return hasPermission(actor.permissions, 'data_scope:department');
  }

  hasTeamScope(actor: AuthenticatedUser): boolean {
    return hasPermission(actor.permissions, 'data_scope:team');
  }

  hasManagerTeamAccess(actor: AuthenticatedUser): boolean {
    return (
      this.hasTeamScope(actor) ||
      hasPermission(actor.permissions, 'manager_team:read') ||
      hasPermission(actor.permissions, 'manager_self_service:read') ||
      hasPermission(actor.permissions, 'manager:read')
    );
  }

  hasSelfScope(actor: AuthenticatedUser): boolean {
    return hasPermission(actor.permissions, 'data_scope:self');
  }

  private async getManagedDepartmentIds(
    actor: AuthenticatedUser,
  ): Promise<number[]> {
    if (!actor.employeeId || !actor.companyId) {
      return [];
    }

    const managedDepartments = await this.departmentRepository.find({
      where: {
        company_id: actor.companyId,
        manager_employee_id: actor.employeeId,
      },
      select: ['id'],
    });

    return managedDepartments.map((department) => department.id);
  }

  async getReportingEmployeeIds(actor: AuthenticatedUser): Promise<number[]> {
    if (!actor.employeeId || !actor.companyId) {
      return [];
    }

    // Resolve the complete reporting tree in one company-constrained query.
    // UNION (rather than UNION ALL) prevents corrupt cycles from recursing
    // forever and removes duplicates caused by repeated/circular paths.
    const rows = (await this.employeeRepository.manager.query(
      `WITH RECURSIVE accessible_reports(id) AS (
        SELECT employee.id
        FROM employees employee
        WHERE employee.company_id = $1 AND employee.reports_to = $2
        UNION
        SELECT child.id
        FROM employees child
        JOIN accessible_reports parent ON child.reports_to = parent.id
        WHERE child.company_id = $1
      )
      SELECT id FROM accessible_reports WHERE id <> $2`,
      [actor.companyId, actor.employeeId],
    )) as unknown as Array<{ id: number | string }>;

    return rows.map((row) => Number(row.id));
  }

  async getAccessibleDepartmentIds(
    actor: AuthenticatedUser,
  ): Promise<number[] | null> {
    if (this.hasCompanyScope(actor)) {
      return null;
    }

    if (!this.hasDepartmentScope(actor)) {
      return [];
    }

    if (!actor.companyId) {
      throw new ForbiddenException('Active company context is required');
    }

    if (!actor.companyMembershipId) {
      throw new ForbiddenException('Active company membership is required');
    }

    const assignments = await this.departmentAccessRepository.find({
      where: { company_user_id: actor.companyMembershipId },
      select: ['department_id'],
    });
    const managedDepartmentIds = await this.getManagedDepartmentIds(actor);
    const assignedDepartmentIds = Array.from(
      new Set(assignments.map((assignment) => assignment.department_id)),
    );
    const companyAssignedDepartments = assignedDepartmentIds.length
      ? await this.departmentRepository.find({
          where: {
            company_id: actor.companyId,
            id: In(assignedDepartmentIds),
          },
          select: ['id'],
        })
      : [];

    return Array.from(
      new Set([
        ...companyAssignedDepartments.map((department) => department.id),
        ...managedDepartmentIds,
      ]),
    );
  }

  async getAccessibleBranchIds(
    actor: AuthenticatedUser,
  ): Promise<number[] | null> {
    if (this.hasCompanyScope(actor)) {
      return null;
    }

    if (this.hasBranchScope(actor)) {
      if (!actor.companyId) {
        throw new ForbiddenException('Active company context is required');
      }
      if (!actor.companyMembershipId) {
        throw new ForbiddenException('Active company membership is required');
      }

      const assignments = await this.branchAccessRepository.find({
        where: { company_user_id: actor.companyMembershipId },
        select: ['branch_id'],
      });

      const assignedIds = Array.from(
        new Set(assignments.map((assignment) => assignment.branch_id)),
      );
      if (!assignedIds.length) return [];

      const companyBranches = await this.branchRepository.find({
        where: { company_id: actor.companyId, id: In(assignedIds) },
        select: ['id'],
      });
      return companyBranches.map((branch) => branch.id);
    }

    if (this.hasDepartmentScope(actor)) {
      const departmentIds = await this.getAccessibleDepartmentIds(actor);
      if (!departmentIds?.length) {
        return [];
      }

      const departments = await this.departmentRepository.find({
        where: {
          company_id: actor.companyId!,
          id: In(departmentIds),
        },
        select: ['branch_id'],
      });

      return Array.from(
        new Set(
          departments
            .map((department) => department.branch_id)
            .filter(
              (branchId): branchId is number => typeof branchId === 'number',
            ),
        ),
      );
    }

    return [];
  }

  async getAccessibleEmployeeIds(
    actor: AuthenticatedUser,
  ): Promise<number[] | null> {
    if (this.hasCompanyScope(actor)) {
      return null;
    }

    if (!actor.companyId) {
      throw new ForbiddenException('Active company context is required');
    }

    const employeeIds = new Set<number>();

    if (actor.employeeId) {
      employeeIds.add(actor.employeeId);
    }

    if (this.hasBranchScope(actor)) {
      const branchIds = await this.getAccessibleBranchIds(actor);

      if (branchIds?.length) {
        const branchEmployees = await this.employeeRepository
          .createQueryBuilder('employee')
          .leftJoin('employee.department_assignments', 'departmentAssignment')
          .leftJoin('departmentAssignment.department', 'department')
          .where('employee.company_id = :companyId', {
            companyId: actor.companyId,
          })
          .andWhere(
            '(employee.primary_branch_id IN (:...branchIds) OR department.branch_id IN (:...branchIds))',
            { branchIds },
          )
          .select('employee.id', 'id')
          .getRawMany<{ id: number }>();

        branchEmployees.forEach((row) => employeeIds.add(Number(row.id)));
      }
    }

    if (this.hasDepartmentScope(actor)) {
      const departmentIds = await this.getAccessibleDepartmentIds(actor);

      if (departmentIds?.length) {
        const departmentEmployees = await this.employeeRepository
          .createQueryBuilder('employee')
          .leftJoin('employee.department_assignments', 'departmentAssignment')
          .where('employee.company_id = :companyId', {
            companyId: actor.companyId,
          })
          .andWhere(
            '(employee.primary_department_id IN (:...departmentIds) OR departmentAssignment.department_id IN (:...departmentIds))',
            { departmentIds },
          )
          .select('employee.id', 'id')
          .getRawMany<{ id: number }>();

        departmentEmployees.forEach((row) => employeeIds.add(Number(row.id)));
      }
    }

    if (this.hasManagerTeamAccess(actor)) {
      const reportingEmployeeIds = await this.getReportingEmployeeIds(actor);
      reportingEmployeeIds.forEach((employeeId) => employeeIds.add(employeeId));
    }

    return Array.from(employeeIds);
  }

  async getAccessibleEmployeeSqlScope(
    actor: AuthenticatedUser,
  ): Promise<AccessibleEmployeeSqlScope> {
    if (this.hasCompanyScope(actor)) {
      return {
        companyWide: true,
        actorEmployeeId: null,
        branchIds: [],
        departmentIds: [],
        managerEmployeeId: null,
      };
    }

    if (!actor.companyId) {
      throw new ForbiddenException('Active company context is required');
    }

    const [branchIds, departmentIds] = await Promise.all([
      this.hasBranchScope(actor) ? this.getAccessibleBranchIds(actor) : [],
      this.hasDepartmentScope(actor)
        ? this.getAccessibleDepartmentIds(actor)
        : [],
    ]);

    return {
      companyWide: false,
      actorEmployeeId: actor.employeeId ?? null,
      branchIds: branchIds ?? [],
      departmentIds: departmentIds ?? [],
      managerEmployeeId: this.hasManagerTeamAccess(actor)
        ? (actor.employeeId ?? null)
        : null,
    };
  }

  async assertCanAccessDepartment(
    actor: AuthenticatedUser,
    departmentId: number | null | undefined,
  ): Promise<void> {
    if (!departmentId) {
      return;
    }

    if (!actor.companyId) {
      throw new ForbiddenException('Active company context is required');
    }

    const department = await this.departmentRepository.findOne({
      where: { id: departmentId, company_id: actor.companyId },
      select: ['id', 'branch_id'],
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }

    if (this.hasCompanyScope(actor)) {
      return;
    }

    if (this.hasDepartmentScope(actor)) {
      const departmentIds = await this.getAccessibleDepartmentIds(actor);

      if (departmentIds?.includes(departmentId)) {
        return;
      }
    }

    if (this.hasBranchScope(actor)) {
      const branchIds = await this.getAccessibleBranchIds(actor);
      if (department?.branch_id && branchIds?.includes(department.branch_id)) {
        return;
      }
    }

    throw new ForbiddenException(
      'You do not have access to the requested department',
    );
  }

  async assertCanAccessBranch(
    actor: AuthenticatedUser,
    branchId: number | null | undefined,
  ): Promise<void> {
    if (!branchId) {
      return;
    }

    if (!actor.companyId) {
      throw new ForbiddenException('Active company context is required');
    }

    const branch = await this.branchRepository.findOne({
      where: { id: branchId, company_id: actor.companyId },
      select: ['id'],
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (this.hasCompanyScope(actor)) {
      return;
    }

    const branchIds = await this.getAccessibleBranchIds(actor);

    if (!branchIds?.includes(branchId)) {
      throw new ForbiddenException(
        'You do not have access to the requested branch',
      );
    }
  }

  async assertCanAccessEmployee(
    actor: AuthenticatedUser,
    employee: Pick<
      Employee,
      | 'id'
      | 'primary_branch_id'
      | 'department_assignments'
      | 'primary_department'
      | 'primary_position'
    >,
  ): Promise<void> {
    if (actor.employeeId && actor.employeeId === employee.id) {
      return;
    }

    if (this.hasCompanyScope(actor)) {
      return;
    }

    const accessibleEmployeeIds = await this.getAccessibleEmployeeIds(actor);
    if (accessibleEmployeeIds?.includes(employee.id)) {
      return;
    }

    throw new ForbiddenException(
      'You do not have access to the requested employee',
    );
  }

  assertCompanyScopedActor(actor: AuthenticatedUser): void {
    if (!actor.companyId || !actor.companyMembershipId) {
      throw new ForbiddenException('Active company context is required');
    }
  }

  ensureActorCompanyId(actor: AuthenticatedUser): number {
    this.assertCompanyScopedActor(actor);
    return actor.companyId!;
  }

  ensureActorMembershipId(actor: AuthenticatedUser): number {
    this.assertCompanyScopedActor(actor);
    return actor.companyMembershipId!;
  }

  ensureEntityBelongsToCompany(
    exists: boolean,
    entityName: string,
  ): asserts exists {
    if (!exists) {
      throw new NotFoundException(`${entityName} not found`);
    }
  }
}
