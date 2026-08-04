import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import type { AuditRequestContext } from '../../../common/interfaces/audit-request-context.interface';
import { SecurityEventOutcome } from '../../security/enums/security-event-outcome.enum';
import { SecurityEventType } from '../../security/enums/security-event-type.enum';
import { SecurityEventsService } from '../../security/security-events.service';
import { Branch } from '../branches/entities/branch.entity';
import { CostCenter } from '../cost-centers/entities/cost-center.entity';
import { Department } from '../departments/entities/department.entity';
import { EmployeeGrade } from '../grades/entities/employee-grade.entity';
import { Position } from '../positions/entities/position.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { addDaysToDateOnly } from '../shared/hr.utils';
import { PositionAvailabilityService } from '../shared/position-availability.service';
import { ChangeEmployeeAssignmentDto } from './dtos/change-employee-assignment.dto';
import { EmployeeAssignmentHistoryStatusEnum } from './enums/employee-assignment-history-status.enum';
import { EmployeePositionAssignmentTypeEnum } from './enums/employee-position-assignment-type.enum';
import { EmployeePositionStatusEnum } from './enums/employee-position-status.enum';
import { EmployeeBranchAssignment } from './entities/employee-branch-assignment.entity';
import { EmployeeDepartmentAssignmentHistory } from './entities/employee-department-assignment-history.entity';
import { EmployeeDepartment } from './entities/employee-department.entity';
import { EmployeePosition } from './entities/employee-position.entity';
import { EmployeeReportingLine } from './entities/employee-reporting-line.entity';
import { Employee } from './entities/employee.entity';

@Injectable()
export class EmployeeAssignmentService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private readonly hrAccessService: HrAccessService,
    private readonly positionAvailabilityService: PositionAvailabilityService,
    private readonly securityEventsService: SecurityEventsService,
  ) {}

  private previousDate(effectiveDate: string): string {
    return addDaysToDateOnly(effectiveDate, -1);
  }

  private normalizeReason(value?: string): string | null {
    return value?.trim() || null;
  }

  private async findEmployeeOrFail(
    manager: EntityManager,
    companyId: number,
    employeeId: number,
  ): Promise<Employee> {
    const employee = await manager
      .getRepository(Employee)
      .createQueryBuilder('employee')
      .setLock('pessimistic_write')
      .where('employee.id = :employeeId', { employeeId })
      .andWhere('employee.company_id = :companyId', { companyId })
      .getOne();

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  private async resolveBranch(
    manager: EntityManager,
    companyId: number,
    branchId: number,
    actor: AuthenticatedUser,
  ): Promise<Branch> {
    const branch = await manager.getRepository(Branch).findOne({
      where: { id: branchId, company_id: companyId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    await this.hrAccessService.assertCanAccessBranch(actor, branch.id);
    return branch;
  }

  private async resolveDepartments(
    manager: EntityManager,
    companyId: number,
    dto: ChangeEmployeeAssignmentDto,
    actor: AuthenticatedUser,
  ) {
    const inputs = dto.departments ?? [];
    const ids = [...new Set(inputs.map((item) => item.department_id))];

    if (ids.length !== inputs.length) {
      throw new BadRequestException('Duplicate department assignments are not allowed');
    }

    const primaryCount = inputs.filter((item) => item.is_primary).length;
    if (primaryCount > 1) {
      throw new BadRequestException('Only one department can be primary');
    }

    if (!ids.length) {
      return [];
    }

    const departments = await manager
      .getRepository(Department)
      .createQueryBuilder('department')
      .where('department.company_id = :companyId', { companyId })
      .andWhere('department.id IN (:...ids)', { ids })
      .getMany();

    if (departments.length !== ids.length) {
      throw new NotFoundException('One or more departments were not found');
    }

    for (const department of departments) {
      if (department.branch_id) {
        await this.hrAccessService.assertCanAccessBranch(actor, department.branch_id);
      }
    }

    const byId = new Map(departments.map((department) => [department.id, department]));
    return inputs.map((input) => ({
      department: byId.get(input.department_id)!,
      isPrimary: input.is_primary ?? false,
    }));
  }

  private async assertNoCircularManager(
    manager: EntityManager,
    companyId: number,
    employeeId: number,
    managerEmployeeId: number,
  ): Promise<void> {
    if (employeeId === managerEmployeeId) {
      throw new BadRequestException('An employee cannot report to themselves');
    }

    let currentId: number | null = managerEmployeeId;
    const visited = new Set<number>();

    while (currentId) {
      if (currentId === employeeId) {
        throw new BadRequestException(
          'The reporting-line change would create a circular hierarchy',
        );
      }

      if (visited.has(currentId)) {
        throw new BadRequestException(
          'The existing reporting hierarchy contains a cycle',
        );
      }

      visited.add(currentId);

      const current = await manager.getRepository(Employee).findOne({
        where: { id: currentId, company_id: companyId },
        select: ['id', 'reports_to'],
      });

      currentId = current?.reports_to ?? null;
    }
  }

  async recordInitialAssignments(
    companyId: number,
    employee: Employee,
    actor: AuthenticatedUser,
    manager: EntityManager,
  ): Promise<void> {
    const effectiveDate = employee.hire_date ?? addDaysToDateOnly(new Date().toISOString().slice(0, 10), 0);

    if (employee.primary_branch_id) {
      await manager.getRepository(EmployeeBranchAssignment).save({
        company_id: companyId,
        employee_id: employee.id,
        branch_id: employee.primary_branch_id,
        effective_from: effectiveDate,
        effective_to: null,
        status: EmployeeAssignmentHistoryStatusEnum.ACTIVE,
        assignment_reason: 'Initial employee assignment',
        assigned_by_company_user_id: actor.companyMembershipId ?? null,
        ended_by_company_user_id: null,
      });
    }

    const departments = await manager.getRepository(EmployeeDepartment).find({
      where: { employee_id: employee.id },
    });

    if (departments.length) {
      await manager.getRepository(EmployeeDepartmentAssignmentHistory).save(
        departments.map((assignment) => ({
          company_id: companyId,
          employee_id: employee.id,
          department_id: assignment.department_id,
          is_primary: assignment.is_primary,
          effective_from: effectiveDate,
          effective_to: null,
          status: EmployeeAssignmentHistoryStatusEnum.ACTIVE,
          assignment_reason: 'Initial employee assignment',
          assigned_by_company_user_id: actor.companyMembershipId ?? null,
          ended_by_company_user_id: null,
        })),
      );
    }

    if (employee.reports_to) {
      await manager.getRepository(EmployeeReportingLine).save({
        company_id: companyId,
        employee_id: employee.id,
        manager_employee_id: employee.reports_to,
        effective_from: effectiveDate,
        effective_to: null,
        status: EmployeeAssignmentHistoryStatusEnum.ACTIVE,
        assignment_reason: 'Initial reporting assignment',
        assigned_by_company_user_id: actor.companyMembershipId ?? null,
        ended_by_company_user_id: null,
      });
    }
  }

  async changeAssignment(
    companyId: number,
    employeeId: number,
    dto: ChangeEmployeeAssignmentDto,
    actor: AuthenticatedUser,
    context: AuditRequestContext,
  ) {
    const existing = await this.employeeRepository.findOne({
      where: { id: employeeId, company_id: companyId },
    });

    if (!existing) {
      throw new NotFoundException('Employee not found');
    }

    await this.hrAccessService.assertCanAccessEmployee(actor, existing);

    const employeeResult = await this.dataSource.transaction(async (manager) => {
      const employee = await this.findEmployeeOrFail(manager, companyId, employeeId);
      const effectiveDate = dto.effective_date;
      const endDate = this.previousDate(effectiveDate);
      const reason = this.normalizeReason(dto.reason);
      const oldValues = {
        primary_branch_id: employee.primary_branch_id,
        primary_department_id: employee.primary_department_id,
        primary_position_id: employee.primary_position_id,
        reports_to: employee.reports_to,
        grade_id: employee.grade_id,
        cost_center_id: employee.cost_center_id,
      };

      if (Object.prototype.hasOwnProperty.call(dto, 'branch_id')) {
        const branch = dto.branch_id
          ? await this.resolveBranch(manager, companyId, dto.branch_id, actor)
          : null;

        await manager
          .getRepository(EmployeeBranchAssignment)
          .createQueryBuilder()
          .update(EmployeeBranchAssignment)
          .set({
            effective_to: endDate,
            status: EmployeeAssignmentHistoryStatusEnum.ENDED,
            ended_by_company_user_id: actor.companyMembershipId ?? null,
          })
          .where('company_id = :companyId', { companyId })
          .andWhere('employee_id = :employeeId', { employeeId })
          .andWhere('status = :status', {
            status: EmployeeAssignmentHistoryStatusEnum.ACTIVE,
          })
          .andWhere('effective_to IS NULL')
          .execute();

        if (branch) {
          await manager.getRepository(EmployeeBranchAssignment).save({
            company_id: companyId,
            employee_id: employee.id,
            branch_id: branch.id,
            effective_from: effectiveDate,
            effective_to: null,
            status: EmployeeAssignmentHistoryStatusEnum.ACTIVE,
            assignment_reason: reason,
            assigned_by_company_user_id: actor.companyMembershipId ?? null,
            ended_by_company_user_id: null,
          });
        }

        employee.primary_branch_id = branch?.id ?? null;
      }

      if (dto.departments !== undefined) {
        const assignments = await this.resolveDepartments(manager, companyId, dto, actor);

        await manager
          .getRepository(EmployeeDepartmentAssignmentHistory)
          .createQueryBuilder()
          .update(EmployeeDepartmentAssignmentHistory)
          .set({
            effective_to: endDate,
            status: EmployeeAssignmentHistoryStatusEnum.ENDED,
            ended_by_company_user_id: actor.companyMembershipId ?? null,
          })
          .where('company_id = :companyId', { companyId })
          .andWhere('employee_id = :employeeId', { employeeId })
          .andWhere('status = :status', {
            status: EmployeeAssignmentHistoryStatusEnum.ACTIVE,
          })
          .andWhere('effective_to IS NULL')
          .execute();

        await manager.getRepository(EmployeeDepartment).delete({
          employee_id: employee.id,
        });

        if (assignments.length) {
          await manager.getRepository(EmployeeDepartment).save(
            assignments.map((assignment) => ({
              employee_id: employee.id,
              department_id: assignment.department.id,
              is_primary: assignment.isPrimary,
            })),
          );

          await manager.getRepository(EmployeeDepartmentAssignmentHistory).save(
            assignments.map((assignment) => ({
              company_id: companyId,
              employee_id: employee.id,
              department_id: assignment.department.id,
              is_primary: assignment.isPrimary,
              effective_from: effectiveDate,
              effective_to: null,
              status: EmployeeAssignmentHistoryStatusEnum.ACTIVE,
              assignment_reason: reason,
              assigned_by_company_user_id: actor.companyMembershipId ?? null,
              ended_by_company_user_id: null,
            })),
          );
        }

        const primaryDepartment =
          assignments.find((assignment) => assignment.isPrimary)?.department ?? null;

        employee.primary_department_id = primaryDepartment?.id ?? null;

        if (
          primaryDepartment?.branch_id &&
          !Object.prototype.hasOwnProperty.call(dto, 'branch_id')
        ) {
          employee.primary_branch_id = primaryDepartment.branch_id;
        }
      }

      if (Object.prototype.hasOwnProperty.call(dto, 'primary_position_id')) {
        const position = dto.primary_position_id
          ? await manager.getRepository(Position).findOne({
              where: { id: dto.primary_position_id, company_id: companyId },
            })
          : null;

        if (dto.primary_position_id && !position) {
          throw new NotFoundException('Position not found');
        }

        if (
          position &&
          employee.primary_department_id &&
          !(await this.positionAvailabilityService.isPositionAvailableForDepartment(
            companyId,
            position,
            employee.primary_department_id,
          ))
        ) {
          throw new BadRequestException(
            'The position is not available for the employee primary department',
          );
        }

        if (
          position &&
          employee.primary_branch_id &&
          !(await this.positionAvailabilityService.isPositionAvailableForBranch(
            companyId,
            position,
            employee.primary_branch_id,
          ))
        ) {
          throw new BadRequestException(
            'The position is not available for the employee primary branch',
          );
        }

        await manager
          .getRepository(EmployeePosition)
          .createQueryBuilder()
          .update(EmployeePosition)
          .set({
            is_primary: false,
            end_date: endDate,
            status: EmployeePositionStatusEnum.COMPLETED,
            ended_by_company_user_id: actor.companyMembershipId ?? null,
          })
          .where('company_id = :companyId', { companyId })
          .andWhere('employee_id = :employeeId', { employeeId })
          .andWhere('is_primary = true')
          .andWhere('status = :status', { status: EmployeePositionStatusEnum.ACTIVE })
          .andWhere('end_date IS NULL')
          .execute();

        if (position) {
          await manager.getRepository(EmployeePosition).save({
            company_id: companyId,
            employee_id: employee.id,
            position_id: position.id,
            is_primary: true,
            start_date: effectiveDate,
            end_date: null,
            assignment_type: EmployeePositionAssignmentTypeEnum.PRIMARY,
            status: EmployeePositionStatusEnum.ACTIVE,
            notes: null,
            assignment_reason: reason,
            assigned_by_company_user_id: actor.companyMembershipId ?? null,
            ended_by_company_user_id: null,
          });
        }

        employee.primary_position_id = position?.id ?? null;
      }

      if (Object.prototype.hasOwnProperty.call(dto, 'reports_to')) {
        const reportingManager = dto.reports_to
          ? await manager.getRepository(Employee).findOne({
              where: { id: dto.reports_to, company_id: companyId },
            })
          : null;

        if (dto.reports_to && !reportingManager) {
          throw new NotFoundException('Reporting manager not found');
        }

        if (reportingManager) {
          await this.assertNoCircularManager(
            manager,
            companyId,
            employee.id,
            reportingManager.id,
          );

          await this.hrAccessService.assertCanAccessEmployee(actor, reportingManager);
        }

        await manager
          .getRepository(EmployeeReportingLine)
          .createQueryBuilder()
          .update(EmployeeReportingLine)
          .set({
            effective_to: endDate,
            status: EmployeeAssignmentHistoryStatusEnum.ENDED,
            ended_by_company_user_id: actor.companyMembershipId ?? null,
          })
          .where('company_id = :companyId', { companyId })
          .andWhere('employee_id = :employeeId', { employeeId })
          .andWhere('status = :status', {
            status: EmployeeAssignmentHistoryStatusEnum.ACTIVE,
          })
          .andWhere('effective_to IS NULL')
          .execute();

        if (reportingManager) {
          await manager.getRepository(EmployeeReportingLine).save({
            company_id: companyId,
            employee_id: employee.id,
            manager_employee_id: reportingManager.id,
            effective_from: effectiveDate,
            effective_to: null,
            status: EmployeeAssignmentHistoryStatusEnum.ACTIVE,
            assignment_reason: reason,
            assigned_by_company_user_id: actor.companyMembershipId ?? null,
            ended_by_company_user_id: null,
          });
        }

        employee.reports_to = reportingManager?.id ?? null;
      }

      if (Object.prototype.hasOwnProperty.call(dto, 'grade_id')) {
        if (dto.grade_id === null) {
          employee.grade_id = null;
        } else if (typeof dto.grade_id === 'number') {
          const grade = await manager.getRepository(EmployeeGrade).findOne({
            where: { id: dto.grade_id, company_id: companyId },
          });

          if (!grade) {
            throw new NotFoundException('Employee grade not found');
          }

          employee.grade_id = grade.id;
        }
      }

      if (Object.prototype.hasOwnProperty.call(dto, 'cost_center_id')) {
        if (dto.cost_center_id === null) {
          employee.cost_center_id = null;
        } else if (typeof dto.cost_center_id === 'number') {
          const costCenter = await manager.getRepository(CostCenter).findOne({
            where: { id: dto.cost_center_id, company_id: companyId },
          });

          if (!costCenter) {
            throw new NotFoundException('Cost center not found');
          }

          employee.cost_center_id = costCenter.id;
        }
      }

      const savedEmployee = await manager.getRepository(Employee).save(employee);

      await this.securityEventsService.log(
        {
          eventType: SecurityEventType.EMPLOYEE_ASSIGNMENT_CHANGED,
          outcome: SecurityEventOutcome.SUCCESS,
          actor,
          companyId,
          targetCompanyUserId: savedEmployee.company_user_id,
          resourceType: 'employee',
          resourceId: savedEmployee.id,
          oldValues,
          newValues: {
            primary_branch_id: savedEmployee.primary_branch_id,
            primary_department_id: savedEmployee.primary_department_id,
            primary_position_id: savedEmployee.primary_position_id,
            reports_to: savedEmployee.reports_to,
            grade_id: savedEmployee.grade_id,
            cost_center_id: savedEmployee.cost_center_id,
            effective_date: effectiveDate,
            reason,
          },
          context,
        },
        manager,
      );

      return savedEmployee.id;
    });

    return {
      employee_id: employeeResult,
      message: 'Employee assignment updated successfully',
    };
  }

  /**
   * Ends all active branch/department/position/reporting-line assignments for an
   * employee who is exiting, preserving the historical rows (status=ENDED with an
   * effective_to/end_date), and clears the employee's primary assignment pointers.
   * Idempotent: re-running against an employee with no active assignments is a no-op.
   */
  async endAssignmentsForExit(
    companyId: number,
    employeeId: number,
    effectiveDate: string,
    actor: AuthenticatedUser,
    manager: EntityManager,
  ): Promise<void> {
    const endDate = effectiveDate;

    await manager
      .getRepository(EmployeeBranchAssignment)
      .createQueryBuilder()
      .update(EmployeeBranchAssignment)
      .set({
        effective_to: endDate,
        status: EmployeeAssignmentHistoryStatusEnum.ENDED,
        ended_by_company_user_id: actor.companyMembershipId ?? null,
      })
      .where('company_id = :companyId', { companyId })
      .andWhere('employee_id = :employeeId', { employeeId })
      .andWhere('status = :status', {
        status: EmployeeAssignmentHistoryStatusEnum.ACTIVE,
      })
      .execute();

    await manager
      .getRepository(EmployeeDepartmentAssignmentHistory)
      .createQueryBuilder()
      .update(EmployeeDepartmentAssignmentHistory)
      .set({
        effective_to: endDate,
        status: EmployeeAssignmentHistoryStatusEnum.ENDED,
        ended_by_company_user_id: actor.companyMembershipId ?? null,
      })
      .where('company_id = :companyId', { companyId })
      .andWhere('employee_id = :employeeId', { employeeId })
      .andWhere('status = :status', {
        status: EmployeeAssignmentHistoryStatusEnum.ACTIVE,
      })
      .execute();

    await manager
      .getRepository(EmployeeReportingLine)
      .createQueryBuilder()
      .update(EmployeeReportingLine)
      .set({
        effective_to: endDate,
        status: EmployeeAssignmentHistoryStatusEnum.ENDED,
        ended_by_company_user_id: actor.companyMembershipId ?? null,
      })
      .where('company_id = :companyId', { companyId })
      .andWhere('employee_id = :employeeId', { employeeId })
      .andWhere('status = :status', {
        status: EmployeeAssignmentHistoryStatusEnum.ACTIVE,
      })
      .execute();

    await manager
      .getRepository(EmployeePosition)
      .createQueryBuilder()
      .update(EmployeePosition)
      .set({
        end_date: endDate,
        is_primary: false,
        status: EmployeePositionStatusEnum.COMPLETED,
        ended_by_company_user_id: actor.companyMembershipId ?? null,
      })
      .where('company_id = :companyId', { companyId })
      .andWhere('employee_id = :employeeId', { employeeId })
      .andWhere('status = :status', {
        status: EmployeePositionStatusEnum.ACTIVE,
      })
      .execute();

    await manager.getRepository(EmployeeDepartment).delete({
      employee_id: employeeId,
    });

    await manager.getRepository(Employee).update(
      { id: employeeId, company_id: companyId },
      {
        primary_branch_id: null,
        primary_department_id: null,
        primary_position_id: null,
        reports_to: null,
      },
    );
  }
}
