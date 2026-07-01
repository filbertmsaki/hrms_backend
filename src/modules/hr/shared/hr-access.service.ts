import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { CompanyUserBranchAccess } from '../branches/entities/company-user-branch-access.entity';
import { Employee } from '../employees/entities/employee.entity';

@Injectable()
export class HrAccessService {
  constructor(
    @InjectRepository(CompanyUserBranchAccess)
    private readonly branchAccessRepository: Repository<CompanyUserBranchAccess>,
  ) {}

  hasCompanyWideBranchAccess(actor: AuthenticatedUser): boolean {
    return actor.roles.includes('COMPANY_ADMIN');
  }

  async getAccessibleBranchIds(
    actor: AuthenticatedUser,
  ): Promise<number[] | null> {
    if (this.hasCompanyWideBranchAccess(actor)) {
      return null;
    }

    if (!actor.companyMembershipId) {
      throw new ForbiddenException('Active company membership is required');
    }

    const assignments = await this.branchAccessRepository.find({
      where: { company_user_id: actor.companyMembershipId },
      select: ['branch_id'],
    });

    return assignments.map((assignment) => assignment.branch_id);
  }

  async assertCanAccessBranch(
    actor: AuthenticatedUser,
    branchId: number | null | undefined,
  ): Promise<void> {
    if (!branchId) {
      return;
    }

    const branchIds = await this.getAccessibleBranchIds(actor);

    if (branchIds === null) {
      return;
    }

    if (!branchIds.includes(branchId)) {
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

    const branchIds = await this.getAccessibleBranchIds(actor);

    if (branchIds === null) {
      return;
    }

    const departmentBranchIds =
      employee.department_assignments
        ?.map((assignment) => assignment.department?.branch_id)
        .filter(
          (branchId): branchId is number => typeof branchId === 'number',
        ) ?? [];
    const primaryDepartmentBranchId =
      employee.primary_department?.branch_id ?? null;
    const primaryPositionBranchId =
      employee.primary_position?.branch_id ?? null;

    const hasAccess =
      (employee.primary_branch_id
        ? branchIds.includes(employee.primary_branch_id)
        : false) ||
      (primaryDepartmentBranchId
        ? branchIds.includes(primaryDepartmentBranchId)
        : false) ||
      (primaryPositionBranchId
        ? branchIds.includes(primaryPositionBranchId)
        : false) ||
      departmentBranchIds.some((branchId) => branchIds.includes(branchId));

    if (!hasAccess) {
      throw new ForbiddenException(
        'You do not have access to the requested employee',
      );
    }
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
