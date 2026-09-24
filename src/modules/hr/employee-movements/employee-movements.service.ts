import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createHash } from 'crypto';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { AttendanceRecalculationJob } from '../attendance/processing/entities/attendance-recalculation-job.entity';
import { AttendanceProcessingJobStatusEnum } from '../attendance/processing/enums/attendance-processing-job-status.enum';
import { CompanyUserBranchAccess } from '../branches/entities/company-user-branch-access.entity';
import { Employee } from '../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { EmploymentTypeEnum } from '../employees/enums/employment-type.enum';
import { EmployeeAssignmentHistoryStatusEnum } from '../employees/enums/employee-assignment-history-status.enum';
import { EmployeePositionAssignmentTypeEnum } from '../employees/enums/employee-position-assignment-type.enum';
import { EmployeePositionStatusEnum } from '../employees/enums/employee-position-status.enum';
import { EmployeeBranchAssignment } from '../employees/entities/employee-branch-assignment.entity';
import { EmployeeDepartmentAssignmentHistory } from '../employees/entities/employee-department-assignment-history.entity';
import { EmployeeDepartment } from '../employees/entities/employee-department.entity';
import { EmployeeReportingLine } from '../employees/entities/employee-reporting-line.entity';
import { EmployeeGradeHistory } from '../employees/entities/employee-grade-history.entity';
import { EmployeeCostCenterHistory } from '../employees/entities/employee-cost-center-history.entity';
import { EmployeePosition } from '../employees/entities/employee-position.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { Position } from '../positions/entities/position.entity';
import { EmployeeGrade } from '../grades/entities/employee-grade.entity';
import { CostCenter } from '../cost-centers/entities/cost-center.entity';
import { Document } from '../documents/entities/document.entity';
import { HrAccessService } from '../shared/hr-access.service';
import {
  PayrollComponent,
  SalaryStructure,
  SalaryStructureComponent,
} from '../payroll/entities/payroll-configuration.entities';
import { SalaryStructureStatusEnum } from '../payroll/payroll.enums';
import {
  fitSalaryOverridesToStructure,
  normalizeSalaryOverrideInputs,
} from '../payroll/services/salary-structure-lines.util';
import { PositionAvailabilityService } from '../shared/position-availability.service';
import { addDaysToDateOnly, formatDateOnly } from '../shared/hr.utils';
import {
  EmployeeCompensationVersion,
  EmployeeCompensationVersionStatusEnum,
  SalaryComponentOverride,
} from './entities/employee-compensation-version.entity';
import {
  MovementCompensationInputDto,
  MovementSalaryComponentOverrideDto,
} from './dtos/movement-compensation-input.dto';
import { EmployeeMovement } from './entities/employee-movement.entity';
import { EmployeeMovementChange } from './entities/employee-movement-change.entity';
import { EmployeeMovementNumberSequence } from './entities/employee-movement-number-sequence.entity';
import { EmployeeMovementTypeEnum } from './enums/employee-movement-type.enum';
import {
  EmployeeMovementStatusEnum,
  OPEN_EMPLOYEE_MOVEMENT_STATUSES,
} from './enums/employee-movement-status.enum';
import { EmployeeMovementFieldEnum } from './enums/employee-movement-field.enum';
import { EmployeeMovementLetterTypeEnum } from './enums/employee-movement-letter-type.enum';
import { EmployeeMovementLetterService } from './services/employee-movement-letter.service';
import { CreateEmployeeMovementDto } from './dtos/create-employee-movement.dto';
import { UpdateEmployeeMovementDto } from './dtos/update-employee-movement.dto';
import { ApproveEmployeeMovementDto } from './dtos/approve-employee-movement.dto';
import { EmployeeMovementOperation } from './entities/employee-movement-operation.entity';
import { EmployeeMovementOperationTypeEnum } from './enums/employee-movement-operation-type.enum';
import { EmployeeMovementOperationStatusEnum } from './enums/employee-movement-operation-status.enum';
import { ProbationCase } from '../probation/entities/probation-case.entity';
import { OPEN_PROBATION_CASE_STATUSES } from '../probation/enums/probation-case-status.enum';
import {
  EmployeeMovementApprovalRequiredEvent,
  EmployeeMovementApprovedEvent,
  EmployeeMovementRejectedEvent,
  EmployeeMovementAppliedEvent,
} from '../notifications/events';
import { buildNotificationRecipient } from '../notifications/notification-recipient.util';

type MovementApprovalStep = 'PRIMARY' | 'FINANCE' | 'MANAGEMENT';

const MOVEMENT_APPROVAL_STEP_PERMISSIONS: Record<MovementApprovalStep, string> =
  {
    PRIMARY: 'employee_movements:approve',
    FINANCE: 'employee_movements:finance-approve',
    MANAGEMENT: 'employee_movements:management-approve',
  };

const SOURCE_TYPE = 'EMPLOYEE_MOVEMENT';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const keys = Object.keys(value as Record<string, unknown>).sort();
  const body = keys
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`,
    )
    .join(',');
  return `{${body}}`;
}

@Injectable()
export class EmployeeMovementsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly hrAccessService: HrAccessService,
    private readonly positionAvailabilityService: PositionAvailabilityService,
    private readonly eventEmitter: EventEmitter2,
    private readonly letterService: EmployeeMovementLetterService,
    @InjectRepository(EmployeeMovement)
    private readonly movementRepository: Repository<EmployeeMovement>,
  ) {}

  // ---------------------------------------------------------------------
  // Validation helpers
  // ---------------------------------------------------------------------

  private validateFieldsForType(dto: CreateEmployeeMovementDto): void {
    const hasStructuralChange = Boolean(
      dto.new_branch_id ||
      dto.new_department_id ||
      dto.new_position_id ||
      dto.new_grade_id ||
      dto.new_cost_center_id ||
      dto.new_manager_employee_id ||
      dto.new_employment_type,
    );

    switch (dto.movement_type) {
      case EmployeeMovementTypeEnum.BRANCH_TRANSFER:
        if (!dto.new_branch_id) {
          throw new BadRequestException(
            'new_branch_id is required for a branch transfer.',
          );
        }
        break;
      case EmployeeMovementTypeEnum.DEPARTMENT_TRANSFER:
        if (!dto.new_department_id) {
          throw new BadRequestException(
            'new_department_id is required for a department transfer.',
          );
        }
        break;
      case EmployeeMovementTypeEnum.POSITION_CHANGE:
        if (!dto.new_position_id) {
          throw new BadRequestException(
            'new_position_id is required for a position change.',
          );
        }
        break;
      case EmployeeMovementTypeEnum.PROMOTION:
      case EmployeeMovementTypeEnum.DEMOTION:
        if (!dto.new_position_id && !dto.new_grade_id) {
          throw new BadRequestException(
            'A promotion or demotion requires a new position or grade.',
          );
        }
        break;
      case EmployeeMovementTypeEnum.REPORTING_MANAGER_CHANGE:
        if (!dto.new_manager_employee_id) {
          throw new BadRequestException('new_manager_employee_id is required.');
        }
        break;
      case EmployeeMovementTypeEnum.GRADE_CHANGE:
        if (!dto.new_grade_id) {
          throw new BadRequestException('new_grade_id is required.');
        }
        break;
      case EmployeeMovementTypeEnum.COST_CENTER_CHANGE:
        if (!dto.new_cost_center_id) {
          throw new BadRequestException('new_cost_center_id is required.');
        }
        break;
      case EmployeeMovementTypeEnum.EMPLOYMENT_TYPE_CHANGE:
        if (!dto.new_employment_type) {
          throw new BadRequestException('new_employment_type is required.');
        }
        break;
      case EmployeeMovementTypeEnum.SALARY_REVISION:
        if (!dto.salary_revision) {
          throw new BadRequestException('salary_revision is required.');
        }
        break;
      case EmployeeMovementTypeEnum.COMPOSITE:
        if (!hasStructuralChange && !dto.salary_revision) {
          throw new BadRequestException(
            'At least one movement change is required.',
          );
        }
        break;
    }
  }

  private daysBetween(from: string, to: string): number {
    const fromDate = new Date(`${from}T00:00:00Z`).getTime();
    const toDate = new Date(`${to}T00:00:00Z`).getTime();
    return Math.round((toDate - fromDate) / (1000 * 60 * 60 * 24));
  }

  private validateEffectiveDate(
    employee: Employee,
    effectiveDate: string,
    actor: AuthenticatedUser,
  ): void {
    if (employee.hire_date && effectiveDate < employee.hire_date) {
      throw new BadRequestException(
        'Movement effective date cannot be before the employee hire date.',
      );
    }

    if (employee.exit_date && effectiveDate > employee.exit_date) {
      throw new BadRequestException(
        'Movement effective date cannot be after the employee exit date.',
      );
    }

    const today = formatDateOnly(new Date());

    if (effectiveDate < today) {
      const allowed = this.configService.get<boolean>(
        'MOVEMENT_ALLOW_BACKDATED_APPLICATION',
      );

      if (!allowed) {
        throw new BadRequestException(
          'Backdated employee movements are disabled.',
        );
      }

      if (!actor.permissions.includes('employee_movements:backdate')) {
        throw new ForbiddenException(
          'You do not have permission to create backdated employee movements.',
        );
      }

      const maximumDays =
        this.configService.get<number>('MOVEMENT_MAX_BACKDATE_DAYS') ?? 30;

      if (this.daysBetween(effectiveDate, today) > maximumDays) {
        throw new BadRequestException(
          `Movement cannot be backdated by more than ${maximumDays} days.`,
        );
      }
    }
  }

  private async assertNoManagerCycle(
    companyId: number,
    employeeId: number,
    managerEmployeeId: number,
    manager: EntityManager,
  ): Promise<void> {
    if (employeeId === managerEmployeeId) {
      throw new BadRequestException('An employee cannot report to themselves.');
    }

    const result = await manager.query<Array<{ id: number }>>(
      `
      WITH RECURSIVE reporting_chain AS (
        SELECT id, reports_to FROM employees WHERE id = $1
        UNION ALL
        SELECT employee.id, employee.reports_to
        FROM employees employee
        INNER JOIN reporting_chain chain ON employee.id = chain.reports_to
        WHERE chain.reports_to IS NOT NULL
      )
      SELECT id FROM reporting_chain WHERE id = $2 LIMIT 1
      `,
      [managerEmployeeId, employeeId],
    );

    if (result.length) {
      throw new BadRequestException(
        'The manager change would create a reporting-line cycle.',
      );
    }

    const proposedManager = await manager.getRepository(Employee).findOne({
      where: { id: managerEmployeeId, company_id: companyId },
    });

    if (!proposedManager) {
      throw new NotFoundException('Proposed reporting manager was not found.');
    }
  }

  private async validatePositionChange(
    companyId: number,
    employee: Employee,
    branchId: number | null,
    departmentId: number | null,
    positionId: number | null,
    manager: EntityManager,
  ): Promise<Position | null> {
    if (!positionId) {
      return null;
    }

    const position = await manager.getRepository(Position).findOne({
      where: { id: positionId, company_id: companyId, is_active: true },
    });

    if (!position) {
      throw new NotFoundException(
        'Proposed position was not found or is inactive.',
      );
    }

    if (
      departmentId &&
      !(await this.positionAvailabilityService.isPositionAvailableForDepartment(
        companyId,
        position,
        departmentId,
      ))
    ) {
      throw new BadRequestException(
        'The proposed position is not available in the proposed department.',
      );
    }

    if (
      branchId &&
      !(await this.positionAvailabilityService.isPositionAvailableForBranch(
        companyId,
        position,
        branchId,
      ))
    ) {
      throw new BadRequestException(
        'The proposed position is not available in the proposed branch.',
      );
    }

    const occupied = await manager.getRepository(EmployeePosition).count({
      where: {
        company_id: companyId,
        position_id: positionId,
        is_primary: true,
        status: EmployeePositionStatusEnum.ACTIVE,
      },
    });

    const employeeAlreadyThere = employee.primary_position_id === positionId;

    if (!employeeAlreadyThere && occupied >= position.headcount) {
      throw new ConflictException(
        `The proposed position has reached its configured headcount of ${position.headcount}.`,
      );
    }

    return position;
  }

  private async validateMovementReferences(
    companyId: number,
    employee: Employee,
    branchId: number | null,
    departmentId: number | null,
    positionId: number | null,
    dto: CreateEmployeeMovementDto,
    manager: EntityManager,
  ): Promise<void> {
    if (dto.new_branch_id) {
      const branch = await manager.getRepository(Branch).findOne({
        where: { id: dto.new_branch_id, company_id: companyId },
      });
      if (!branch) {
        throw new NotFoundException('Proposed branch was not found.');
      }
    }

    if (dto.new_department_id) {
      const department = await manager.getRepository(Department).findOne({
        where: { id: dto.new_department_id, company_id: companyId },
      });
      if (!department) {
        throw new NotFoundException('Proposed department was not found.');
      }
    }

    await this.validatePositionChange(
      companyId,
      employee,
      branchId,
      departmentId,
      positionId,
      manager,
    );

    if (dto.new_grade_id) {
      const grade = await manager.getRepository(EmployeeGrade).findOne({
        where: { id: dto.new_grade_id, company_id: companyId },
      });
      if (!grade) {
        throw new NotFoundException('Proposed grade was not found.');
      }
    }

    if (dto.new_cost_center_id) {
      const costCenter = await manager.getRepository(CostCenter).findOne({
        where: { id: dto.new_cost_center_id, company_id: companyId },
      });
      if (!costCenter) {
        throw new NotFoundException('Proposed cost center was not found.');
      }
    }

    if (dto.new_manager_employee_id) {
      await this.assertNoManagerCycle(
        companyId,
        employee.id,
        dto.new_manager_employee_id,
        manager,
      );
    }
  }

  // ---------------------------------------------------------------------
  // Snapshots
  // ---------------------------------------------------------------------

  private async getCurrentCompensation(
    companyId: number,
    employeeId: number,
    manager: EntityManager,
  ): Promise<EmployeeCompensationVersion | null> {
    return manager.getRepository(EmployeeCompensationVersion).findOne({
      where: {
        companyId,
        employeeId,
        status: EmployeeCompensationVersionStatusEnum.ACTIVE,
      },
    });
  }

  private buildCurrentSnapshot(
    employee: Employee,
    compensation: EmployeeCompensationVersion | null,
  ): Record<string, unknown> {
    return {
      branch_id: employee.primary_branch_id,
      department_id: employee.primary_department_id,
      position_id: employee.primary_position_id,
      grade_id: employee.grade_id,
      cost_center_id: employee.cost_center_id,
      reporting_manager_employee_id: employee.reports_to,
      employment_type: employee.employment_type,
      base_salary: compensation?.baseSalary ?? null,
      salary_currency: compensation?.currency ?? null,
      salary_structure_code: compensation?.salaryStructureCode ?? null,
    };
  }

  private buildProposedSnapshot(
    current: Record<string, unknown>,
    dto: CreateEmployeeMovementDto,
  ): Record<string, unknown> {
    return {
      ...current,
      branch_id: dto.new_branch_id ?? current.branch_id,
      department_id: dto.new_department_id ?? current.department_id,
      position_id: dto.new_position_id ?? current.position_id,
      grade_id: dto.new_grade_id ?? current.grade_id,
      cost_center_id: dto.new_cost_center_id ?? current.cost_center_id,
      reporting_manager_employee_id:
        dto.new_manager_employee_id ?? current.reporting_manager_employee_id,
      employment_type: dto.new_employment_type ?? current.employment_type,
      base_salary: dto.salary_revision?.base_salary ?? current.base_salary,
      salary_currency: dto.salary_revision?.currency ?? current.salary_currency,
      salary_structure_code:
        dto.salary_revision?.salary_structure_code ??
        current.salary_structure_code,
    };
  }

  private hashSnapshot(snapshot: Record<string, unknown>): string {
    return createHash('sha256').update(stableStringify(snapshot)).digest('hex');
  }

  /**
   * The active version of a salary structure in effect on a date, with the
   * components of its lines keyed by code. `includeRetired` matches the
   * payroll resolver, which still pays from a retired version in its range.
   */
  private async findEffectiveSalaryStructure(
    companyId: number,
    code: string,
    onDate: string,
    manager: EntityManager,
    includeRetired = false,
  ): Promise<{
    structure: SalaryStructure;
    components: Map<string, PayrollComponent>;
  } | null> {
    const base = {
      companyId,
      code: code.trim().toUpperCase(),
      status: includeRetired
        ? In([
            SalaryStructureStatusEnum.ACTIVE,
            SalaryStructureStatusEnum.RETIRED,
          ])
        : SalaryStructureStatusEnum.ACTIVE,
      effectiveFrom: LessThanOrEqual(onDate),
    };
    const structure = await manager.getRepository(SalaryStructure).findOne({
      where: [
        { ...base, effectiveTo: IsNull() },
        { ...base, effectiveTo: MoreThanOrEqual(onDate) },
      ],
      order: { effectiveFrom: 'DESC', versionNumber: 'DESC' },
    });
    if (!structure) return null;
    const lines = await manager.getRepository(SalaryStructureComponent).find({
      where: { companyId, salaryStructureId: structure.id },
    });
    const components = lines.length
      ? await manager.getRepository(PayrollComponent).find({
          where: { companyId, id: In(lines.map((line) => line.componentId)) },
        })
      : [];
    return {
      structure,
      components: new Map(components.map((item) => [item.code, item])),
    };
  }

  /**
   * Validates the salary part of a revision: the structure code must have a
   * version in effect on the effective date (ACTIVE for a new code; ACTIVE or
   * RETIRED when keeping the current one, as payroll does), and explicit
   * overrides must match that version's components. `componentOverrides` is
   * undefined when the revision does not set overrides (they then carry over
   * on apply); null or [] clears them. Overrides kept from the saved movement
   * on an edit are trimmed to the target structure instead of rejected.
   */
  private async resolveSalaryRevisionStructure(
    movement: EmployeeMovement,
    revision: MovementCompensationInputDto,
    currentCompensation: EmployeeCompensationVersion | null,
    manager: EntityManager,
    savedOverridesKept = false,
  ): Promise<{
    salaryStructureCode: string | undefined;
    componentOverrides:
      | Record<string, SalaryComponentOverride>
      | null
      | undefined;
  }> {
    const requestedCode =
      revision.salary_structure_code?.trim().toUpperCase() || undefined;
    const targetCode =
      requestedCode ?? currentCompensation?.salaryStructureCode ?? undefined;
    const overrides =
      revision.component_overrides === null ? [] : revision.component_overrides;
    const needsStructure = Boolean(requestedCode) || overrides !== undefined;
    if (!needsStructure) {
      return { salaryStructureCode: undefined, componentOverrides: undefined };
    }
    if (!targetCode) {
      if (!requestedCode && !overrides?.length) {
        // Clearing overrides for an employee without a structure is a no-op.
        return { salaryStructureCode: undefined, componentOverrides: null };
      }
      throw new BadRequestException(
        'Component overrides need a salary structure. Choose one for this revision.',
      );
    }
    const keepsCurrentCode =
      !requestedCode ||
      requestedCode === currentCompensation?.salaryStructureCode;
    const target = await this.findEffectiveSalaryStructure(
      movement.companyId,
      targetCode,
      movement.effectiveDate,
      manager,
      keepsCurrentCode,
    );
    if (!target) {
      throw new BadRequestException(
        `Salary structure ${targetCode} has no ${keepsCurrentCode ? '' : 'active '}version effective on ${movement.effectiveDate}.`,
      );
    }
    if (overrides === undefined) {
      return {
        salaryStructureCode: requestedCode,
        componentOverrides: undefined,
      };
    }
    const inputs = savedOverridesKept
      ? overrides.filter((item) =>
          target.components.has(item.component_code.trim().toUpperCase()),
        )
      : overrides;
    return {
      salaryStructureCode: requestedCode,
      componentOverrides: normalizeSalaryOverrideInputs(
        inputs,
        target.components,
        targetCode,
      ),
    };
  }

  private async createMovementChanges(
    movement: EmployeeMovement,
    dto: CreateEmployeeMovementDto,
    current: Record<string, unknown>,
    manager: EntityManager,
    savedOverridesKept = false,
  ): Promise<void> {
    const changes: Partial<EmployeeMovementChange>[] = [];

    if (dto.new_branch_id && dto.new_branch_id !== current.branch_id) {
      changes.push({
        field: EmployeeMovementFieldEnum.BRANCH,
        oldReferenceId: current.branch_id as number | null,
        newReferenceId: dto.new_branch_id,
      });
    }

    if (
      dto.new_department_id &&
      dto.new_department_id !== current.department_id
    ) {
      changes.push({
        field: EmployeeMovementFieldEnum.DEPARTMENT,
        oldReferenceId: current.department_id as number | null,
        newReferenceId: dto.new_department_id,
      });
    }

    if (dto.new_position_id && dto.new_position_id !== current.position_id) {
      changes.push({
        field: EmployeeMovementFieldEnum.POSITION,
        oldReferenceId: current.position_id as number | null,
        newReferenceId: dto.new_position_id,
      });
    }

    if (dto.new_grade_id && dto.new_grade_id !== current.grade_id) {
      changes.push({
        field: EmployeeMovementFieldEnum.GRADE,
        oldReferenceId: current.grade_id as number | null,
        newReferenceId: dto.new_grade_id,
      });
    }

    if (
      dto.new_cost_center_id &&
      dto.new_cost_center_id !== current.cost_center_id
    ) {
      changes.push({
        field: EmployeeMovementFieldEnum.COST_CENTER,
        oldReferenceId: current.cost_center_id as number | null,
        newReferenceId: dto.new_cost_center_id,
      });
    }

    if (
      dto.new_manager_employee_id &&
      dto.new_manager_employee_id !== current.reporting_manager_employee_id
    ) {
      changes.push({
        field: EmployeeMovementFieldEnum.REPORTING_MANAGER,
        oldReferenceId: current.reporting_manager_employee_id as number | null,
        newReferenceId: dto.new_manager_employee_id,
      });
    }

    if (
      dto.new_employment_type &&
      dto.new_employment_type !== current.employment_type
    ) {
      changes.push({
        field: EmployeeMovementFieldEnum.EMPLOYMENT_TYPE,
        oldValue: { value: current.employment_type },
        newValue: { value: dto.new_employment_type },
      });
    }

    if (dto.salary_revision) {
      const currentCompensation = await this.getCurrentCompensation(
        movement.companyId,
        movement.employeeId,
        manager,
      );
      const { salaryStructureCode, componentOverrides } =
        await this.resolveSalaryRevisionStructure(
          movement,
          dto.salary_revision,
          currentCompensation,
          manager,
          savedOverridesKept,
        );
      changes.push({
        field: EmployeeMovementFieldEnum.BASE_SALARY,
        oldValue: {
          amount: current.base_salary,
          currency: current.salary_currency,
          salary_structure_code: current.salary_structure_code,
          component_overrides: currentCompensation?.componentOverrides ?? null,
        },
        newValue: {
          amount: dto.salary_revision.base_salary,
          currency: dto.salary_revision.currency.toUpperCase(),
          salary_structure_code: salaryStructureCode,
          // Present only when the revision sets overrides; null clears them.
          ...(componentOverrides !== undefined
            ? { component_overrides: componentOverrides }
            : {}),
          revision_reference: dto.salary_revision.revision_reference,
          justification: dto.salary_revision.justification,
        },
      });
    }

    if (!changes.length) {
      throw new BadRequestException(
        'This movement would not change any field from the employee current values.',
      );
    }

    await manager.getRepository(EmployeeMovementChange).save(
      changes.map((change) =>
        manager.getRepository(EmployeeMovementChange).create({
          movementId: movement.id,
          ...change,
        }),
      ),
    );
  }

  private dtoFromMovement(
    movement: EmployeeMovement,
  ): CreateEmployeeMovementDto {
    const dto: CreateEmployeeMovementDto = {
      employee_id: movement.employeeId,
      movement_type: movement.movementType,
      title: movement.title,
      reason: movement.reason,
      effective_date: movement.effectiveDate,
      metadata: movement.metadata ?? undefined,
    };

    for (const change of movement.changes ?? []) {
      switch (change.field) {
        case EmployeeMovementFieldEnum.BRANCH:
          dto.new_branch_id = change.newReferenceId ?? undefined;
          break;
        case EmployeeMovementFieldEnum.DEPARTMENT:
          dto.new_department_id = change.newReferenceId ?? undefined;
          break;
        case EmployeeMovementFieldEnum.POSITION:
          dto.new_position_id = change.newReferenceId ?? undefined;
          break;
        case EmployeeMovementFieldEnum.GRADE:
          dto.new_grade_id = change.newReferenceId ?? undefined;
          break;
        case EmployeeMovementFieldEnum.COST_CENTER:
          dto.new_cost_center_id = change.newReferenceId ?? undefined;
          break;
        case EmployeeMovementFieldEnum.REPORTING_MANAGER:
          dto.new_manager_employee_id = change.newReferenceId ?? undefined;
          break;
        case EmployeeMovementFieldEnum.EMPLOYMENT_TYPE:
          dto.new_employment_type = change.newValue?.value as
            | EmploymentTypeEnum
            | undefined;
          break;
        case EmployeeMovementFieldEnum.BASE_SALARY:
          dto.salary_revision = {
            base_salary: this.stringFromMovementValue(change.newValue?.amount),
            currency: this.stringFromMovementValue(change.newValue?.currency),
            salary_structure_code:
              typeof change.newValue?.salary_structure_code === 'string'
                ? change.newValue.salary_structure_code
                : undefined,
            component_overrides: this.overridesFromMovementValue(
              change.newValue,
            ),
            revision_reference:
              typeof change.newValue?.revision_reference === 'string'
                ? change.newValue.revision_reference
                : undefined,
            justification: this.stringFromMovementValue(
              change.newValue?.justification,
            ),
          };
          break;
      }
    }

    return dto;
  }

  /** Stored override map -> DTO list, so edits re-validate what was saved. */
  private overridesFromMovementValue(
    value: Record<string, unknown> | null | undefined,
  ): MovementSalaryComponentOverrideDto[] | undefined {
    if (
      !value ||
      !Object.prototype.hasOwnProperty.call(value, 'component_overrides')
    ) {
      return undefined;
    }
    const raw = value.component_overrides;
    if (!raw || typeof raw !== 'object') return [];
    return Object.entries(raw as Record<string, SalaryComponentOverride>).map(
      ([code, override]) => ({
        component_code: code,
        ...(override.amount ? { amount: override.amount } : {}),
        ...(override.rate ? { rate: override.rate } : {}),
        ...(override.excluded ? { excluded: true } : {}),
      }),
    );
  }

  private stringFromMovementValue(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    return '';
  }

  /**
   * Saved values fill in what the update leaves out. A salary_revision that
   * omits component_overrides keeps the overrides saved on the movement, so
   * an edit made without the overrides editor cannot silently drop them.
   */
  private mergeUpdateDto(
    movement: EmployeeMovement,
    dto: UpdateEmployeeMovementDto,
  ): { mergedDto: CreateEmployeeMovementDto; savedOverridesKept: boolean } {
    const saved = this.dtoFromMovement(movement);
    const mergedDto: CreateEmployeeMovementDto = { ...saved, ...dto };
    const savedOverrides = saved.salary_revision?.component_overrides;
    if (
      dto.salary_revision &&
      dto.salary_revision.component_overrides === undefined &&
      savedOverrides !== undefined
    ) {
      mergedDto.salary_revision = {
        ...dto.salary_revision,
        component_overrides: savedOverrides,
      };
      return { mergedDto, savedOverridesKept: true };
    }
    return { mergedDto, savedOverridesKept: false };
  }

  private assertMovementCanBeEdited(movement: EmployeeMovement): void {
    if (
      ![
        EmployeeMovementStatusEnum.DRAFT,
        EmployeeMovementStatusEnum.RETURNED_FOR_CORRECTION,
      ].includes(movement.status)
    ) {
      throw new ConflictException(
        'Only draft or returned movements can be edited.',
      );
    }
  }

  private movementHasSalaryChange(
    changes: EmployeeMovementChange[] | undefined,
  ): boolean {
    return (changes ?? []).some(
      (change) => change.field === EmployeeMovementFieldEnum.BASE_SALARY,
    );
  }

  private movementHasSeniorChange(
    movementType: EmployeeMovementTypeEnum,
  ): boolean {
    return (
      movementType === EmployeeMovementTypeEnum.PROMOTION ||
      movementType === EmployeeMovementTypeEnum.DEMOTION
    );
  }

  private async allocateMovementNo(
    companyId: number,
    manager: EntityManager,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const repository = manager.getRepository(EmployeeMovementNumberSequence);

    let sequence = await repository
      .createQueryBuilder('sequence')
      .setLock('pessimistic_write')
      .where('sequence.company_id = :companyId', { companyId })
      .andWhere('sequence.sequence_year = :year', { year })
      .getOne();

    if (!sequence) {
      try {
        sequence = await repository.save(
          repository.create({ companyId, sequenceYear: year, nextNumber: 1 }),
        );
      } catch {
        sequence = await repository
          .createQueryBuilder('sequence')
          .setLock('pessimistic_write')
          .where('sequence.company_id = :companyId', { companyId })
          .andWhere('sequence.sequence_year = :year', { year })
          .getOneOrFail();
      }
    }

    const number = sequence.nextNumber;
    sequence.nextNumber = number + 1;
    await repository.save(sequence);

    return `MOV-${year}-${String(number).padStart(6, '0')}`;
  }

  // ---------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------

  async create(
    actor: AuthenticatedUser,
    dto: CreateEmployeeMovementDto,
  ): Promise<EmployeeMovement> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    this.validateFieldsForType(dto);

    return this.dataSource.transaction(async (manager) => {
      const employee = await manager
        .getRepository(Employee)
        .createQueryBuilder('employee')
        .setLock('pessimistic_read')
        .where('employee.id = :employeeId', { employeeId: dto.employee_id })
        .andWhere('employee.company_id = :companyId', { companyId })
        .getOne();

      if (!employee) {
        throw new NotFoundException('Employee not found.');
      }

      await this.hrAccessService.assertCanAccessEmployee(actor, employee);

      if (employee.employment_status !== EmploymentStatusEnum.ACTIVE) {
        throw new BadRequestException(
          'Only active employees can have an organizational movement.',
        );
      }

      this.validateEffectiveDate(employee, dto.effective_date, actor);

      const branchId = dto.new_branch_id ?? employee.primary_branch_id;
      const departmentId =
        dto.new_department_id ?? employee.primary_department_id;
      const positionId = dto.new_position_id ?? employee.primary_position_id;

      await this.validateMovementReferences(
        companyId,
        employee,
        branchId,
        departmentId,
        positionId,
        dto,
        manager,
      );

      const activeConflict = await manager
        .getRepository(EmployeeMovement)
        .createQueryBuilder('movement')
        .where('movement.company_id = :companyId', { companyId })
        .andWhere('movement.employee_id = :employeeId', {
          employeeId: employee.id,
        })
        .andWhere('movement.status IN (:...statuses)', {
          statuses: OPEN_EMPLOYEE_MOVEMENT_STATUSES,
        })
        .andWhere('movement.effective_date = :effectiveDate', {
          effectiveDate: dto.effective_date,
        })
        .getOne();

      if (activeConflict) {
        throw new ConflictException(
          `An active movement already exists for this employee on ${dto.effective_date}.`,
        );
      }

      const currentCompensation = await this.getCurrentCompensation(
        companyId,
        employee.id,
        manager,
      );

      const currentSnapshot = this.buildCurrentSnapshot(
        employee,
        currentCompensation,
      );
      const proposedSnapshot = this.buildProposedSnapshot(currentSnapshot, dto);

      const movementNo = await this.allocateMovementNo(companyId, manager);

      const movement = await manager.getRepository(EmployeeMovement).save(
        manager.getRepository(EmployeeMovement).create({
          companyId,
          employeeId: employee.id,
          movementNo,
          movementType: dto.movement_type,
          status: EmployeeMovementStatusEnum.DRAFT,
          title: dto.title.trim(),
          reason: dto.reason.trim(),
          effectiveDate: dto.effective_date,
          requestedByCompanyUserId: actor.companyMembershipId ?? null,
          currentSnapshot,
          proposedSnapshot,
          employeeVersionAtCreation: employee.version ?? null,
          snapshotHash: this.hashSnapshot(currentSnapshot),
          metadata: dto.metadata ?? null,
        }),
      );

      await this.createMovementChanges(movement, dto, currentSnapshot, manager);

      return movement;
    });
  }

  // ---------------------------------------------------------------------
  // Retrieval
  // ---------------------------------------------------------------------

  async findAll(
    actor: AuthenticatedUser,
    query: { employee_id?: number; status?: string; movement_type?: string },
  ): Promise<EmployeeMovement[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const accessibleEmployeeIds =
      await this.hrAccessService.getAccessibleEmployeeIds(actor);

    if (accessibleEmployeeIds !== null) {
      if (query.employee_id) {
        if (!accessibleEmployeeIds.includes(query.employee_id)) {
          return [];
        }
      } else if (accessibleEmployeeIds.length === 0) {
        return [];
      }
    }

    return this.movementRepository.find({
      where: {
        companyId,
        ...(query.status
          ? { status: query.status as EmployeeMovementStatusEnum }
          : {}),
        ...(query.movement_type
          ? { movementType: query.movement_type as EmployeeMovementTypeEnum }
          : {}),
        ...(query.employee_id
          ? { employeeId: query.employee_id }
          : accessibleEmployeeIds !== null
            ? { employeeId: In(accessibleEmployeeIds) }
            : {}),
      },
      relations: { employee: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(
    actor: AuthenticatedUser,
    id: number,
  ): Promise<EmployeeMovement> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    const movement = await this.movementRepository.findOne({
      where: { id, companyId },
      relations: { employee: true, changes: true },
    });

    if (!movement) {
      throw new NotFoundException('Employee movement not found.');
    }

    await this.hrAccessService.assertCanAccessEmployee(
      actor,
      movement.employee,
    );

    return movement;
  }

  async generateLetter(
    actor: AuthenticatedUser,
    movementId: number,
    letterType: EmployeeMovementLetterTypeEnum,
  ): Promise<Document> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    const movement = await this.movementRepository.findOne({
      where: { id: movementId, companyId },
      relations: { employee: true },
    });

    if (!movement) {
      throw new NotFoundException('Employee movement not found.');
    }

    await this.hrAccessService.assertCanAccessEmployee(
      actor,
      movement.employee,
    );

    if (
      ![
        EmployeeMovementStatusEnum.APPROVED,
        EmployeeMovementStatusEnum.SCHEDULED,
        EmployeeMovementStatusEnum.APPLIED,
      ].includes(movement.status)
    ) {
      throw new ConflictException(
        'Letters can only be generated for approved, scheduled, or applied movements.',
      );
    }

    return this.letterService.generateAndStore(
      companyId,
      movementId,
      letterType,
    );
  }

  async update(
    actor: AuthenticatedUser,
    movementId: number,
    dto: UpdateEmployeeMovementDto,
  ): Promise<EmployeeMovement> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    return this.dataSource.transaction(async (manager) => {
      const movement = await this.lockMovement(companyId, movementId, manager);
      this.assertMovementCanBeEdited(movement);

      const { mergedDto, savedOverridesKept } = this.mergeUpdateDto(
        movement,
        dto,
      );
      this.validateFieldsForType(mergedDto);

      const employee = await manager
        .getRepository(Employee)
        .createQueryBuilder('employee')
        .setLock('pessimistic_read')
        .where('employee.id = :employeeId', {
          employeeId: mergedDto.employee_id,
        })
        .andWhere('employee.company_id = :companyId', { companyId })
        .getOne();

      if (!employee) {
        throw new NotFoundException('Employee not found.');
      }

      await this.hrAccessService.assertCanAccessEmployee(actor, employee);

      if (employee.employment_status !== EmploymentStatusEnum.ACTIVE) {
        throw new BadRequestException(
          'Only active employees can have an organizational movement.',
        );
      }

      this.validateEffectiveDate(employee, mergedDto.effective_date, actor);

      const branchId = mergedDto.new_branch_id ?? employee.primary_branch_id;
      const departmentId =
        mergedDto.new_department_id ?? employee.primary_department_id;
      const positionId =
        mergedDto.new_position_id ?? employee.primary_position_id;

      await this.validateMovementReferences(
        companyId,
        employee,
        branchId,
        departmentId,
        positionId,
        mergedDto,
        manager,
      );

      const activeConflict = await manager
        .getRepository(EmployeeMovement)
        .createQueryBuilder('movement')
        .where('movement.company_id = :companyId', { companyId })
        .andWhere('movement.id != :movementId', { movementId })
        .andWhere('movement.employee_id = :employeeId', {
          employeeId: employee.id,
        })
        .andWhere('movement.status IN (:...statuses)', {
          statuses: OPEN_EMPLOYEE_MOVEMENT_STATUSES,
        })
        .andWhere('movement.effective_date = :effectiveDate', {
          effectiveDate: mergedDto.effective_date,
        })
        .getOne();

      if (activeConflict) {
        throw new ConflictException(
          `An active movement already exists for this employee on ${mergedDto.effective_date}.`,
        );
      }

      const currentCompensation = await this.getCurrentCompensation(
        companyId,
        employee.id,
        manager,
      );
      const currentSnapshot = this.buildCurrentSnapshot(
        employee,
        currentCompensation,
      );
      const proposedSnapshot = this.buildProposedSnapshot(
        currentSnapshot,
        mergedDto,
      );

      movement.employeeId = employee.id;
      movement.movementType = mergedDto.movement_type;
      movement.title = mergedDto.title.trim();
      movement.reason = mergedDto.reason.trim();
      movement.effectiveDate = mergedDto.effective_date;
      movement.currentSnapshot = currentSnapshot;
      movement.proposedSnapshot = proposedSnapshot;
      movement.employeeVersionAtCreation = employee.version ?? null;
      movement.snapshotHash = this.hashSnapshot(currentSnapshot);
      movement.metadata = mergedDto.metadata ?? null;

      const repository = manager.getRepository(EmployeeMovement);
      await repository.save(movement);
      await manager
        .getRepository(EmployeeMovementChange)
        .delete({ movementId });
      await this.createMovementChanges(
        movement,
        mergedDto,
        currentSnapshot,
        manager,
        savedOverridesKept,
      );

      return repository.findOneOrFail({
        where: { id: movement.id, companyId },
        relations: { employee: true, changes: true },
      });
    });
  }

  async remove(
    actor: AuthenticatedUser,
    movementId: number,
  ): Promise<{ message: string }> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    await this.dataSource.transaction(async (manager) => {
      const movement = await this.lockMovement(companyId, movementId, manager);
      this.assertMovementCanBeEdited(movement);
      await this.hrAccessService.assertCanAccessEmployee(
        actor,
        movement.employee,
      );
      await manager.getRepository(EmployeeMovement).remove(movement);
    });

    return { message: 'Employee movement deleted.' };
  }

  private async lockMovement(
    companyId: number,
    movementId: number,
    manager: EntityManager,
  ): Promise<EmployeeMovement> {
    const movement = await manager
      .getRepository(EmployeeMovement)
      .createQueryBuilder('movement')
      .setLock('pessimistic_write')
      .leftJoinAndSelect('movement.changes', 'change')
      .leftJoinAndSelect('movement.employee', 'employee')
      .where('movement.id = :movementId', { movementId })
      .andWhere('movement.company_id = :companyId', { companyId })
      .getOne();

    if (!movement) {
      throw new NotFoundException('Employee movement not found.');
    }

    return movement;
  }

  // ---------------------------------------------------------------------
  // Submit / maker-checker / approve / reject / cancel
  // ---------------------------------------------------------------------

  private assertMakerChecker(
    movement: EmployeeMovement,
    actor: AuthenticatedUser,
  ): void {
    if (movement.requestedByCompanyUserId === actor.companyMembershipId) {
      throw new ForbiddenException(
        'The movement creator cannot approve the same movement.',
      );
    }

    if (movement.employee.company_user_id === actor.companyMembershipId) {
      throw new ForbiddenException(
        'An employee cannot approve their own movement.',
      );
    }
  }

  private computeRequiredApprovalSteps(
    movement: EmployeeMovement,
  ): MovementApprovalStep[] {
    const steps: MovementApprovalStep[] = ['PRIMARY'];

    if (this.movementHasSalaryChange(movement.changes)) {
      steps.push('FINANCE');
    }

    if (
      this.configService.get<boolean>(
        'MOVEMENT_REQUIRE_MANAGEMENT_APPROVAL_FOR_PROMOTION',
      ) &&
      this.movementHasSeniorChange(movement.movementType)
    ) {
      steps.push('MANAGEMENT');
    }

    return steps;
  }

  private getApprovalProgress(movement: EmployeeMovement): {
    steps: MovementApprovalStep[];
    completed: MovementApprovalStep[];
  } {
    const metadata = movement.metadata ?? {};
    const steps = Array.isArray(metadata.approval_steps)
      ? (metadata.approval_steps as MovementApprovalStep[])
      : this.computeRequiredApprovalSteps(movement);
    const completed = Array.isArray(metadata.completed_approval_steps)
      ? (metadata.completed_approval_steps as MovementApprovalStep[])
      : [];

    return { steps, completed };
  }

  private async resolveEmployeeRecipient(
    movement: EmployeeMovement,
    manager: EntityManager,
  ) {
    const employee = await manager.getRepository(Employee).findOne({
      where: { id: movement.employeeId },
      relations: { company_user: { user: true } },
    });

    return buildNotificationRecipient(
      (employee?.company_user as unknown as { user?: unknown })?.user as
        | {
            first_name?: string | null;
            last_name?: string | null;
            email?: string | null;
          }
        | null
        | undefined,
      { employeeId: employee?.id ?? null },
    );
  }

  private async resolveManagerRecipient(
    movement: EmployeeMovement,
    manager: EntityManager,
  ) {
    const employee = await manager.getRepository(Employee).findOne({
      where: { id: movement.employeeId },
    });

    if (!employee?.reports_to) {
      return null;
    }

    const managerEmployee = await manager.getRepository(Employee).findOne({
      where: { id: employee.reports_to },
      relations: { company_user: { user: true } },
    });

    return buildNotificationRecipient(
      (managerEmployee?.company_user as unknown as { user?: unknown })?.user as
        | {
            first_name?: string | null;
            last_name?: string | null;
            email?: string | null;
          }
        | null
        | undefined,
      { employeeId: managerEmployee?.id ?? null },
    );
  }

  private buildMovementDashboardUrl(movement: EmployeeMovement): string {
    const appUrl = this.configService.get<string>('APP_FRONTEND_URL')!;
    return `${appUrl}/employee-movements/${movement.id}`;
  }

  async submit(
    actor: AuthenticatedUser,
    movementId: number,
  ): Promise<EmployeeMovement> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    const movement = await this.dataSource.transaction(async (manager) => {
      const movement = await this.lockMovement(companyId, movementId, manager);

      if (
        ![
          EmployeeMovementStatusEnum.DRAFT,
          EmployeeMovementStatusEnum.RETURNED_FOR_CORRECTION,
        ].includes(movement.status)
      ) {
        throw new ConflictException(
          'Only draft or returned movements can be submitted.',
        );
      }

      const steps = this.computeRequiredApprovalSteps(movement);

      movement.submittedAt = new Date();
      movement.status = EmployeeMovementStatusEnum.PENDING_APPROVAL;
      movement.metadata = {
        ...(movement.metadata ?? {}),
        approval_steps: steps,
        completed_approval_steps: [],
      };

      await manager.getRepository(EmployeeMovement).save(movement);

      const managerRecipient = await this.resolveManagerRecipient(
        movement,
        manager,
      );

      if (managerRecipient) {
        this.eventEmitter.emit(
          EmployeeMovementApprovalRequiredEvent.EVENT,
          new EmployeeMovementApprovalRequiredEvent(
            movement.companyId,
            movement.id,
            movement.movementNo,
            movement.movementType,
            `${movement.employee.first_name} ${movement.employee.last_name}`,
            movement.effectiveDate,
            this.buildMovementDashboardUrl(movement),
            [managerRecipient],
          ),
        );
      }

      return movement;
    });

    return movement;
  }

  async cancel(
    actor: AuthenticatedUser,
    movementId: number,
  ): Promise<EmployeeMovement> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    return this.dataSource.transaction(async (manager) => {
      const movement = await this.lockMovement(companyId, movementId, manager);

      if (
        [
          EmployeeMovementStatusEnum.APPLIED,
          EmployeeMovementStatusEnum.CANCELLED,
          EmployeeMovementStatusEnum.REJECTED,
        ].includes(movement.status)
      ) {
        throw new ConflictException(
          'This movement can no longer be cancelled.',
        );
      }

      movement.status = EmployeeMovementStatusEnum.CANCELLED;
      movement.cancelledAt = new Date();

      await manager.getRepository(EmployeeMovement).save(movement);

      return movement;
    });
  }

  async reject(
    actor: AuthenticatedUser,
    movementId: number,
    comments: string,
  ): Promise<EmployeeMovement> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    const movement = await this.dataSource.transaction(async (manager) => {
      const movement = await this.lockMovement(companyId, movementId, manager);
      this.assertMakerChecker(movement, actor);

      if (movement.status !== EmployeeMovementStatusEnum.PENDING_APPROVAL) {
        throw new ConflictException(
          'Only movements pending approval can be rejected.',
        );
      }

      movement.status = EmployeeMovementStatusEnum.REJECTED;
      movement.rejectedAt = new Date();
      movement.metadata = {
        ...(movement.metadata ?? {}),
        rejection_comments: comments,
      };

      await manager.getRepository(EmployeeMovement).save(movement);

      const employeeRecipient = await this.resolveEmployeeRecipient(
        movement,
        manager,
      );

      if (employeeRecipient) {
        this.eventEmitter.emit(
          EmployeeMovementRejectedEvent.EVENT,
          new EmployeeMovementRejectedEvent(
            movement.companyId,
            movement.id,
            movement.movementNo,
            movement.movementType,
            `${movement.employee.first_name} ${movement.employee.last_name}`,
            employeeRecipient.email,
            comments,
            this.buildMovementDashboardUrl(movement),
          ),
        );
      }

      return movement;
    });

    return movement;
  }

  async returnForCorrection(
    actor: AuthenticatedUser,
    movementId: number,
    comments: string,
  ): Promise<EmployeeMovement> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    return this.dataSource.transaction(async (manager) => {
      const movement = await this.lockMovement(companyId, movementId, manager);
      this.assertMakerChecker(movement, actor);

      if (movement.status !== EmployeeMovementStatusEnum.PENDING_APPROVAL) {
        throw new ConflictException(
          'Only movements pending approval can be returned for correction.',
        );
      }

      movement.status = EmployeeMovementStatusEnum.RETURNED_FOR_CORRECTION;
      movement.metadata = {
        ...(movement.metadata ?? {}),
        return_comments: comments,
      };

      await manager.getRepository(EmployeeMovement).save(movement);

      return movement;
    });
  }

  private assertStepApproverAuthorized(
    step: MovementApprovalStep,
    actor: AuthenticatedUser,
  ): void {
    const requiredPermission = MOVEMENT_APPROVAL_STEP_PERMISSIONS[step];

    if (!actor.permissions.includes(requiredPermission)) {
      throw new ForbiddenException(
        `You do not have the required permission (${requiredPermission}) to approve this step of the movement.`,
      );
    }
  }

  async approve(
    actor: AuthenticatedUser,
    movementId: number,
    dto: ApproveEmployeeMovementDto,
  ): Promise<EmployeeMovement> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    const movement = await this.dataSource.transaction(async (manager) => {
      const movement = await this.lockMovement(companyId, movementId, manager);
      this.assertMakerChecker(movement, actor);

      if (movement.status !== EmployeeMovementStatusEnum.PENDING_APPROVAL) {
        throw new ConflictException('This movement is not pending approval.');
      }

      const { steps, completed } = this.getApprovalProgress(movement);
      const currentStep = steps.find((step) => !completed.includes(step));

      if (!currentStep) {
        throw new ConflictException(
          'All required approval steps have already been completed.',
        );
      }

      this.assertStepApproverAuthorized(currentStep, actor);

      const nextCompleted = [...completed, currentStep];
      const approvalHistory = Array.isArray(
        (movement.metadata ?? {}).approval_history,
      )
        ? ((movement.metadata as { approval_history: unknown[] })
            .approval_history as Record<string, unknown>[])
        : [];

      movement.metadata = {
        ...(movement.metadata ?? {}),
        approval_steps: steps,
        completed_approval_steps: nextCompleted,
        approval_history: [
          ...approvalHistory,
          {
            step: currentStep,
            approved_by_company_user_id: actor.companyMembershipId ?? null,
            comments: dto.comments ?? null,
            approved_at: new Date().toISOString(),
          },
        ],
      };

      const isFullyApproved = nextCompleted.length === steps.length;

      if (isFullyApproved) {
        const today = formatDateOnly(new Date());

        movement.status =
          movement.effectiveDate > today
            ? EmployeeMovementStatusEnum.SCHEDULED
            : EmployeeMovementStatusEnum.APPROVED;
        movement.approvedAt = new Date();
        movement.approvedByCompanyUserId = actor.companyMembershipId ?? null;
      }

      await manager.getRepository(EmployeeMovement).save(movement);

      if (isFullyApproved) {
        const employeeRecipient = await this.resolveEmployeeRecipient(
          movement,
          manager,
        );

        if (employeeRecipient) {
          this.eventEmitter.emit(
            EmployeeMovementApprovedEvent.EVENT,
            new EmployeeMovementApprovedEvent(
              movement.companyId,
              movement.id,
              movement.movementNo,
              movement.movementType,
              `${movement.employee.first_name} ${movement.employee.last_name}`,
              employeeRecipient.email,
              movement.effectiveDate,
              this.buildMovementDashboardUrl(movement),
            ),
          );
        }
      }

      return movement;
    });

    return movement;
  }

  // ---------------------------------------------------------------------
  // Apply
  // ---------------------------------------------------------------------

  private async assertMovementStillApplicable(
    movement: EmployeeMovement,
    employee: Employee,
    manager: EntityManager,
  ): Promise<void> {
    const currentCompensation = await this.getCurrentCompensation(
      movement.companyId,
      employee.id,
      manager,
    );
    const currentSnapshot = this.buildCurrentSnapshot(
      employee,
      currentCompensation,
    );
    const currentHash = this.hashSnapshot(currentSnapshot);

    if (currentHash !== movement.snapshotHash) {
      const affectedFields = new Set(
        (movement.changes ?? []).map((change) => change.field),
      );

      const structuralKeys: Array<[EmployeeMovementFieldEnum, string]> = [
        [EmployeeMovementFieldEnum.BRANCH, 'branch_id'],
        [EmployeeMovementFieldEnum.DEPARTMENT, 'department_id'],
        [EmployeeMovementFieldEnum.POSITION, 'position_id'],
        [EmployeeMovementFieldEnum.GRADE, 'grade_id'],
        [EmployeeMovementFieldEnum.COST_CENTER, 'cost_center_id'],
        [
          EmployeeMovementFieldEnum.REPORTING_MANAGER,
          'reporting_manager_employee_id',
        ],
        [EmployeeMovementFieldEnum.EMPLOYMENT_TYPE, 'employment_type'],
      ];

      const conflicts = structuralKeys
        .filter(([field]) => affectedFields.has(field))
        .filter(
          ([, key]) => movement.currentSnapshot[key] !== currentSnapshot[key],
        )
        .map(([field]) => field);

      if (conflicts.length) {
        throw new ConflictException({
          message: 'Employee data changed after this movement was submitted.',
          conflicting_fields: conflicts,
          current_snapshot: currentSnapshot,
          submitted_snapshot: movement.currentSnapshot,
        });
      }
    }
  }

  private previousDate(effectiveDate: string): string {
    return addDaysToDateOnly(effectiveDate, -1);
  }

  private async applyBranchChange(
    movement: EmployeeMovement,
    employee: Employee,
    branchId: number,
    manager: EntityManager,
  ): Promise<void> {
    const endDate = this.previousDate(movement.effectiveDate);

    await manager
      .getRepository(EmployeeBranchAssignment)
      .createQueryBuilder()
      .update(EmployeeBranchAssignment)
      .set({
        effective_to: endDate,
        status: EmployeeAssignmentHistoryStatusEnum.ENDED,
        ended_by_company_user_id: movement.approvedByCompanyUserId,
      })
      .where('company_id = :companyId', { companyId: movement.companyId })
      .andWhere('employee_id = :employeeId', { employeeId: employee.id })
      .andWhere('status = :status', {
        status: EmployeeAssignmentHistoryStatusEnum.ACTIVE,
      })
      .execute();

    await manager.getRepository(EmployeeBranchAssignment).save({
      company_id: movement.companyId,
      employee_id: employee.id,
      branch_id: branchId,
      effective_from: movement.effectiveDate,
      effective_to: null,
      status: EmployeeAssignmentHistoryStatusEnum.ACTIVE,
      assignment_reason: movement.reason,
      assigned_by_company_user_id: movement.approvedByCompanyUserId,
      ended_by_company_user_id: null,
    });

    employee.primary_branch_id = branchId;
  }

  private async applyDepartmentChange(
    movement: EmployeeMovement,
    employee: Employee,
    departmentId: number,
    manager: EntityManager,
  ): Promise<void> {
    const endDate = this.previousDate(movement.effectiveDate);

    await manager
      .getRepository(EmployeeDepartmentAssignmentHistory)
      .createQueryBuilder()
      .update(EmployeeDepartmentAssignmentHistory)
      .set({
        effective_to: endDate,
        status: EmployeeAssignmentHistoryStatusEnum.ENDED,
        ended_by_company_user_id: movement.approvedByCompanyUserId,
      })
      .where('company_id = :companyId', { companyId: movement.companyId })
      .andWhere('employee_id = :employeeId', { employeeId: employee.id })
      .andWhere('status = :status', {
        status: EmployeeAssignmentHistoryStatusEnum.ACTIVE,
      })
      .execute();

    await manager.getRepository(EmployeeDepartmentAssignmentHistory).save({
      company_id: movement.companyId,
      employee_id: employee.id,
      department_id: departmentId,
      is_primary: true,
      effective_from: movement.effectiveDate,
      effective_to: null,
      status: EmployeeAssignmentHistoryStatusEnum.ACTIVE,
      assignment_reason: movement.reason,
      assigned_by_company_user_id: movement.approvedByCompanyUserId,
      ended_by_company_user_id: null,
    });

    const projectionRepository = manager.getRepository(EmployeeDepartment);
    await projectionRepository.update(
      { employee_id: employee.id, is_primary: true },
      { is_primary: false },
    );

    let projection = await projectionRepository.findOne({
      where: { employee_id: employee.id, department_id: departmentId },
    });

    if (!projection) {
      projection = projectionRepository.create({
        employee_id: employee.id,
        department_id: departmentId,
        is_primary: true,
      });
    } else {
      projection.is_primary = true;
    }

    await projectionRepository.save(projection);

    employee.primary_department_id = departmentId;
  }

  private async applyPrimaryPositionChange(
    movement: EmployeeMovement,
    employee: Employee,
    positionId: number,
    manager: EntityManager,
  ): Promise<void> {
    const repository = manager.getRepository(EmployeePosition);
    const endDate = this.previousDate(movement.effectiveDate);

    if (employee.primary_position_id !== positionId) {
      const position = await manager
        .getRepository(Position)
        .createQueryBuilder('position')
        .setLock('pessimistic_write')
        .where('position.id = :positionId', { positionId })
        .getOne();

      if (position) {
        const occupied = await repository.count({
          where: {
            company_id: movement.companyId,
            position_id: positionId,
            is_primary: true,
            status: EmployeePositionStatusEnum.ACTIVE,
          },
        });

        if (occupied >= position.headcount) {
          throw new ConflictException(
            `The proposed position has reached its configured headcount of ${position.headcount}.`,
          );
        }
      }
    }

    await repository
      .createQueryBuilder()
      .update(EmployeePosition)
      .set({
        is_primary: false,
        end_date: endDate,
        status: EmployeePositionStatusEnum.COMPLETED,
        ended_by_company_user_id: movement.approvedByCompanyUserId,
      })
      .where('company_id = :companyId', { companyId: movement.companyId })
      .andWhere('employee_id = :employeeId', { employeeId: employee.id })
      .andWhere('is_primary = true')
      .andWhere('status = :status', {
        status: EmployeePositionStatusEnum.ACTIVE,
      })
      .execute();

    await repository.save({
      company_id: movement.companyId,
      employee_id: employee.id,
      position_id: positionId,
      is_primary: true,
      start_date: movement.effectiveDate,
      end_date: null,
      assignment_type: EmployeePositionAssignmentTypeEnum.PRIMARY,
      status: EmployeePositionStatusEnum.ACTIVE,
      notes: movement.reason,
      assignment_reason: movement.reason,
      assigned_by_company_user_id: movement.approvedByCompanyUserId,
      ended_by_company_user_id: null,
    });

    employee.primary_position_id = positionId;
  }

  private async applyManagerChange(
    movement: EmployeeMovement,
    employee: Employee,
    managerEmployeeId: number,
    manager: EntityManager,
  ): Promise<void> {
    await this.assertNoManagerCycle(
      movement.companyId,
      employee.id,
      managerEmployeeId,
      manager,
    );

    const endDate = this.previousDate(movement.effectiveDate);
    const repository = manager.getRepository(EmployeeReportingLine);

    await repository
      .createQueryBuilder()
      .update(EmployeeReportingLine)
      .set({
        effective_to: endDate,
        status: EmployeeAssignmentHistoryStatusEnum.ENDED,
        ended_by_company_user_id: movement.approvedByCompanyUserId,
      })
      .where('company_id = :companyId', { companyId: movement.companyId })
      .andWhere('employee_id = :employeeId', { employeeId: employee.id })
      .andWhere('status = :status', {
        status: EmployeeAssignmentHistoryStatusEnum.ACTIVE,
      })
      .execute();

    await repository.save({
      company_id: movement.companyId,
      employee_id: employee.id,
      manager_employee_id: managerEmployeeId,
      effective_from: movement.effectiveDate,
      effective_to: null,
      status: EmployeeAssignmentHistoryStatusEnum.ACTIVE,
      assignment_reason: movement.reason,
      assigned_by_company_user_id: movement.approvedByCompanyUserId,
      ended_by_company_user_id: null,
    });

    employee.reports_to = managerEmployeeId;
  }

  private async applyGradeChange(
    movement: EmployeeMovement,
    employee: Employee,
    gradeId: number,
    manager: EntityManager,
  ): Promise<void> {
    const endDate = this.previousDate(movement.effectiveDate);
    const repository = manager.getRepository(EmployeeGradeHistory);

    await repository
      .createQueryBuilder()
      .update(EmployeeGradeHistory)
      .set({
        effective_to: endDate,
        status: EmployeeAssignmentHistoryStatusEnum.ENDED,
        ended_by_company_user_id: movement.approvedByCompanyUserId,
      })
      .where('company_id = :companyId', { companyId: movement.companyId })
      .andWhere('employee_id = :employeeId', { employeeId: employee.id })
      .andWhere('status = :status', {
        status: EmployeeAssignmentHistoryStatusEnum.ACTIVE,
      })
      .execute();

    await repository.save({
      company_id: movement.companyId,
      employee_id: employee.id,
      grade_id: gradeId,
      effective_from: movement.effectiveDate,
      effective_to: null,
      status: EmployeeAssignmentHistoryStatusEnum.ACTIVE,
      source_type: SOURCE_TYPE,
      source_id: movement.id,
      assignment_reason: movement.reason,
      assigned_by_company_user_id: movement.approvedByCompanyUserId,
      ended_by_company_user_id: null,
    });

    employee.grade_id = gradeId;
  }

  private async applyCostCenterChange(
    movement: EmployeeMovement,
    employee: Employee,
    costCenterId: number,
    manager: EntityManager,
  ): Promise<void> {
    const endDate = this.previousDate(movement.effectiveDate);
    const repository = manager.getRepository(EmployeeCostCenterHistory);

    await repository
      .createQueryBuilder()
      .update(EmployeeCostCenterHistory)
      .set({
        effective_to: endDate,
        status: EmployeeAssignmentHistoryStatusEnum.ENDED,
        ended_by_company_user_id: movement.approvedByCompanyUserId,
      })
      .where('company_id = :companyId', { companyId: movement.companyId })
      .andWhere('employee_id = :employeeId', { employeeId: employee.id })
      .andWhere('status = :status', {
        status: EmployeeAssignmentHistoryStatusEnum.ACTIVE,
      })
      .execute();

    await repository.save({
      company_id: movement.companyId,
      employee_id: employee.id,
      cost_center_id: costCenterId,
      effective_from: movement.effectiveDate,
      effective_to: null,
      status: EmployeeAssignmentHistoryStatusEnum.ACTIVE,
      source_type: SOURCE_TYPE,
      source_id: movement.id,
      assignment_reason: movement.reason,
      assigned_by_company_user_id: movement.approvedByCompanyUserId,
      ended_by_company_user_id: null,
    });

    employee.cost_center_id = costCenterId;
  }

  private async applySalaryRevision(
    movement: EmployeeMovement,
    employee: Employee,
    change: EmployeeMovementChange,
    manager: EntityManager,
  ): Promise<void> {
    const value = change.newValue as {
      amount: string;
      currency: string;
      salary_structure_code?: string;
      component_overrides?: Record<string, SalaryComponentOverride> | null;
      revision_reference?: string;
      justification: string;
    };

    const repository = manager.getRepository(EmployeeCompensationVersion);

    const current = await repository
      .createQueryBuilder('version')
      .setLock('pessimistic_write')
      .where('version.company_id = :companyId', {
        companyId: movement.companyId,
      })
      .andWhere('version.employee_id = :employeeId', {
        employeeId: employee.id,
      })
      .andWhere('version.status = :status', {
        status: EmployeeCompensationVersionStatusEnum.ACTIVE,
      })
      .getOne();

    if (current) {
      current.status = EmployeeCompensationVersionStatusEnum.SUPERSEDED;
      current.effectiveTo = this.previousDate(movement.effectiveDate);
      await repository.save(current);
    }

    // A revision without a structure code keeps the current structure.
    const salaryStructureCode =
      value.salary_structure_code?.trim().toUpperCase() ||
      current?.salaryStructureCode ||
      null;
    // Overrides set on the revision win; otherwise the current ones carry
    // over. Either way only components in the target structure are kept, so a
    // structure switch preserves custom amounts for shared components.
    const sourceOverrides = Object.prototype.hasOwnProperty.call(
      value,
      'component_overrides',
    )
      ? (value.component_overrides ?? null)
      : (current?.componentOverrides ?? null);
    let componentOverrides: Record<string, SalaryComponentOverride> | null =
      null;
    if (sourceOverrides && salaryStructureCode) {
      const target = await this.findEffectiveSalaryStructure(
        movement.companyId,
        salaryStructureCode,
        movement.effectiveDate,
        manager,
        true,
      );
      componentOverrides = target
        ? fitSalaryOverridesToStructure(sourceOverrides, target.components)
        : sourceOverrides;
    }

    await repository.save(
      repository.create({
        companyId: movement.companyId,
        employeeId: employee.id,
        movementId: movement.id,
        baseSalary: value.amount,
        currency: value.currency.toUpperCase(),
        salaryStructureCode,
        componentOverrides,
        payFrequency: 'MONTHLY',
        effectiveFrom: movement.effectiveDate,
        effectiveTo: null,
        status: EmployeeCompensationVersionStatusEnum.ACTIVE,
        revisionReference: value.revision_reference ?? null,
        justification: value.justification,
        approvedByCompanyUserId: movement.approvedByCompanyUserId,
        createdByCompanyUserId: movement.requestedByCompanyUserId,
        payrollSyncStatus: 'PENDING_PAYROLL_INTEGRATION',
      }),
    );
  }

  private async applyStructuralChanges(
    movement: EmployeeMovement,
    employee: Employee,
    manager: EntityManager,
  ): Promise<void> {
    for (const change of movement.changes ?? []) {
      switch (change.field) {
        case EmployeeMovementFieldEnum.BRANCH:
          await this.applyBranchChange(
            movement,
            employee,
            change.newReferenceId as number,
            manager,
          );
          break;
        case EmployeeMovementFieldEnum.DEPARTMENT:
          await this.applyDepartmentChange(
            movement,
            employee,
            change.newReferenceId as number,
            manager,
          );
          break;
        case EmployeeMovementFieldEnum.POSITION:
          await this.applyPrimaryPositionChange(
            movement,
            employee,
            change.newReferenceId as number,
            manager,
          );
          break;
        case EmployeeMovementFieldEnum.REPORTING_MANAGER:
          await this.applyManagerChange(
            movement,
            employee,
            change.newReferenceId as number,
            manager,
          );
          break;
        case EmployeeMovementFieldEnum.GRADE:
          await this.applyGradeChange(
            movement,
            employee,
            change.newReferenceId as number,
            manager,
          );
          break;
        case EmployeeMovementFieldEnum.COST_CENTER:
          await this.applyCostCenterChange(
            movement,
            employee,
            change.newReferenceId as number,
            manager,
          );
          break;
        case EmployeeMovementFieldEnum.EMPLOYMENT_TYPE: {
          const value = change.newValue as { value: EmploymentTypeEnum };
          employee.employment_type = value.value;
          break;
        }
        case EmployeeMovementFieldEnum.BASE_SALARY:
          await this.applySalaryRevision(movement, employee, change, manager);
          break;
      }
    }

    await manager.getRepository(Employee).save(employee);
  }

  async apply(
    actor: AuthenticatedUser,
    movementId: number,
  ): Promise<EmployeeMovement> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    return this.applyMovementById(companyId, movementId);
  }

  async applyScheduled(
    companyId: number,
    movementId: number,
  ): Promise<EmployeeMovement> {
    return this.applyMovementById(companyId, movementId);
  }

  private async applyMovementById(
    companyId: number,
    movementId: number,
  ): Promise<EmployeeMovement> {
    try {
      return await this.dataSource.transaction(
        'SERIALIZABLE',
        async (manager) => {
          const movement = await this.lockMovement(
            companyId,
            movementId,
            manager,
          );

          if (
            movement.status === EmployeeMovementStatusEnum.APPLIED ||
            movement.appliedAt
          ) {
            return movement;
          }

          const allowedStatuses = [
            EmployeeMovementStatusEnum.APPROVED,
            EmployeeMovementStatusEnum.SCHEDULED,
            EmployeeMovementStatusEnum.APPLICATION_FAILED,
          ];

          if (!allowedStatuses.includes(movement.status)) {
            throw new ConflictException(
              'Movement is not ready for application.',
            );
          }

          if (movement.effectiveDate > formatDateOnly(new Date())) {
            throw new BadRequestException(
              'Movement effective date has not been reached yet.',
            );
          }

          const employee = await manager
            .getRepository(Employee)
            .createQueryBuilder('employee')
            .setLock('pessimistic_write')
            .where('employee.id = :employeeId', {
              employeeId: movement.employeeId,
            })
            .andWhere('employee.company_id = :companyId', { companyId })
            .getOneOrFail();

          await this.assertMovementStillApplicable(movement, employee, manager);

          movement.status = EmployeeMovementStatusEnum.APPLYING;
          movement.applicationAttemptCount += 1;
          movement.applicationError = null;

          await manager.getRepository(EmployeeMovement).save(movement);

          await this.applyStructuralChanges(movement, employee, manager);
          await this.createMovementOperations(movement, manager);
          await this.processImmediateOperations(movement, manager);

          const finalCompensation = await this.getCurrentCompensation(
            companyId,
            employee.id,
            manager,
          );

          movement.status = EmployeeMovementStatusEnum.APPLIED;
          movement.appliedAt = new Date();
          movement.applicationSnapshot = this.buildCurrentSnapshot(
            employee,
            finalCompensation,
          );

          await manager.getRepository(EmployeeMovement).save(movement);

          const employeeRecipient = await this.resolveEmployeeRecipient(
            movement,
            manager,
          );

          if (employeeRecipient) {
            this.eventEmitter.emit(
              EmployeeMovementAppliedEvent.EVENT,
              new EmployeeMovementAppliedEvent(
                movement.companyId,
                movement.id,
                movement.movementNo,
                movement.movementType,
                `${movement.employee.first_name} ${movement.employee.last_name}`,
                employeeRecipient.email,
                movement.effectiveDate,
                this.buildMovementDashboardUrl(movement),
              ),
            );
          }

          return movement;
        },
      );
    } catch (error) {
      await this.movementRepository.update(
        { id: movementId, companyId },
        {
          status: EmployeeMovementStatusEnum.APPLICATION_FAILED,
          applicationFailedAt: new Date(),
          applicationError:
            error instanceof Error
              ? error.message
              : 'Movement application failed',
        },
      );

      throw error;
    }
  }

  // ---------------------------------------------------------------------
  // Operations / outbox for downstream side effects
  // ---------------------------------------------------------------------

  private async createMovementOperations(
    movement: EmployeeMovement,
    manager: EntityManager,
  ): Promise<void> {
    const changedFields = new Set(
      (movement.changes ?? []).map((change) => change.field),
    );
    const repository = manager.getRepository(EmployeeMovementOperation);

    const structuralFieldsAffectingAttendance = [
      EmployeeMovementFieldEnum.BRANCH,
      EmployeeMovementFieldEnum.DEPARTMENT,
      EmployeeMovementFieldEnum.POSITION,
    ];

    if (
      structuralFieldsAffectingAttendance.some((field) =>
        changedFields.has(field),
      )
    ) {
      await this.createOperationIfMissing(
        repository,
        movement,
        EmployeeMovementOperationTypeEnum.RECALCULATE_ATTENDANCE_ASSIGNMENT,
        `employee:${movement.employeeId}`,
        {
          employee_id: movement.employeeId,
          movement_no: movement.movementNo,
          effective_date: movement.effectiveDate,
        },
      );
    }

    if (changedFields.has(EmployeeMovementFieldEnum.BRANCH)) {
      const branchChange = (movement.changes ?? []).find(
        (change) => change.field === EmployeeMovementFieldEnum.BRANCH,
      );
      await this.createOperationIfMissing(
        repository,
        movement,
        EmployeeMovementOperationTypeEnum.UPDATE_BRANCH_ACCESS,
        `employee:${movement.employeeId}`,
        {
          employee_id: movement.employeeId,
          branch_id: branchChange?.newReferenceId ?? null,
        },
      );
    }

    const fieldsAffectingLeave = [
      EmployeeMovementFieldEnum.DEPARTMENT,
      EmployeeMovementFieldEnum.POSITION,
      EmployeeMovementFieldEnum.GRADE,
      EmployeeMovementFieldEnum.EMPLOYMENT_TYPE,
    ];

    if (fieldsAffectingLeave.some((field) => changedFields.has(field))) {
      await this.createOperationIfMissing(
        repository,
        movement,
        EmployeeMovementOperationTypeEnum.REEVALUATE_LEAVE_POLICY,
        `employee:${movement.employeeId}`,
        { employee_id: movement.employeeId },
      );
    }

    if (changedFields.has(EmployeeMovementFieldEnum.REPORTING_MANAGER)) {
      await this.createOperationIfMissing(
        repository,
        movement,
        EmployeeMovementOperationTypeEnum.REEVALUATE_PROBATION_REVIEWER,
        `employee:${movement.employeeId}`,
        {
          employee_id: movement.employeeId,
          new_manager_employee_id: movement.employee?.reports_to ?? null,
        },
      );
    }
  }

  private async createOperationIfMissing(
    repository: Repository<EmployeeMovementOperation>,
    movement: EmployeeMovement,
    operationType: EmployeeMovementOperationTypeEnum,
    resourceKey: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const existing = await repository.findOne({
      where: {
        movementId: movement.id,
        operationType,
        resourceKey,
      },
    });

    if (existing) {
      return;
    }

    await repository.save(
      repository.create({
        companyId: movement.companyId,
        movementId: movement.id,
        operationType,
        resourceKey,
        status: EmployeeMovementOperationStatusEnum.PENDING,
        payload,
      }),
    );
  }

  private async processProbationReviewerReassignment(
    companyId: number,
    employeeId: number,
    newManagerEmployeeId: number | null,
    manager: EntityManager,
  ): Promise<Record<string, unknown>> {
    if (!newManagerEmployeeId) {
      return { updated_cases: 0, reason: 'No new manager on the movement.' };
    }

    const repository = manager.getRepository(ProbationCase);
    const result = await repository
      .createQueryBuilder()
      .update(ProbationCase)
      .set({ managerEmployeeId: newManagerEmployeeId })
      .where('company_id = :companyId', { companyId })
      .andWhere('employee_id = :employeeId', { employeeId })
      .andWhere('status IN (:...statuses)', {
        statuses: OPEN_PROBATION_CASE_STATUSES,
      })
      .execute();

    return { updated_cases: result.affected ?? 0 };
  }

  private async queueAttendanceRefreshForMovement(
    movement: EmployeeMovement,
    manager: EntityManager,
  ): Promise<Record<string, unknown>> {
    const repository = manager.getRepository(AttendanceRecalculationJob);
    const today = formatDateOnly(new Date());
    const dateTo =
      movement.effectiveDate > today ? movement.effectiveDate : today;
    const reason = `Employee movement ${movement.movementNo} attendance refresh`;

    let job = await repository.findOne({
      where: {
        companyId: movement.companyId,
        employeeId: movement.employeeId,
        dateFrom: movement.effectiveDate,
        dateTo,
        reason,
      },
    });

    if (!job) {
      job = await repository.save(
        repository.create({
          companyId: movement.companyId,
          employeeId: movement.employeeId,
          dateFrom: movement.effectiveDate,
          dateTo,
          reason,
          status: AttendanceProcessingJobStatusEnum.PENDING,
          attempts: 0,
          requestedByCompanyUserId:
            movement.approvedByCompanyUserId ??
            movement.requestedByCompanyUserId ??
            null,
          metadata: {
            source: SOURCE_TYPE,
            movement_id: movement.id,
            movement_no: movement.movementNo,
            operation_type:
              EmployeeMovementOperationTypeEnum.RECALCULATE_ATTENDANCE_ASSIGNMENT,
          },
        }),
      );

      return {
        queued: true,
        job_id: job.id,
        status: job.status,
        date_from: job.dateFrom,
        date_to: job.dateTo,
      };
    }

    if (job.status === AttendanceProcessingJobStatusEnum.FAILED) {
      job.status = AttendanceProcessingJobStatusEnum.PENDING;
      job.lastError = null;
      job.processedAt = null;
      job.requestedByCompanyUserId =
        movement.approvedByCompanyUserId ??
        movement.requestedByCompanyUserId ??
        job.requestedByCompanyUserId;
      job.metadata = {
        ...(job.metadata ?? {}),
        source: SOURCE_TYPE,
        movement_id: movement.id,
        movement_no: movement.movementNo,
        operation_type:
          EmployeeMovementOperationTypeEnum.RECALCULATE_ATTENDANCE_ASSIGNMENT,
      };
      job = await repository.save(job);
    }

    return {
      queued: false,
      job_id: job.id,
      status: job.status,
      date_from: job.dateFrom,
      date_to: job.dateTo,
    };
  }

  private async ensureMovementBranchAccess(
    movement: EmployeeMovement,
    branchId: number | null,
    manager: EntityManager,
  ): Promise<Record<string, unknown>> {
    if (!branchId) {
      return {
        granted: false,
        reason: 'Movement did not specify a target branch.',
      };
    }

    const employee = await manager.getRepository(Employee).findOne({
      where: { id: movement.employeeId, company_id: movement.companyId },
      select: ['id', 'company_user_id'],
    });

    if (!employee?.company_user_id) {
      return {
        granted: false,
        reason:
          'Employee has no linked company user for branch access assignment.',
      };
    }

    const repository = manager.getRepository(CompanyUserBranchAccess);
    let assignment = await repository.findOne({
      where: {
        company_user_id: employee.company_user_id,
        branch_id: branchId,
      },
    });

    if (!assignment) {
      assignment = await repository.save(
        repository.create({
          company_user_id: employee.company_user_id,
          branch_id: branchId,
        }),
      );

      return {
        granted: true,
        assignment_id: assignment.id,
        branch_id: branchId,
        company_user_id: employee.company_user_id,
      };
    }

    return {
      granted: false,
      assignment_id: assignment.id,
      branch_id: branchId,
      company_user_id: employee.company_user_id,
      reason: 'Branch access assignment already exists.',
    };
  }

  private async processImmediateOperations(
    movement: EmployeeMovement,
    manager: EntityManager,
  ): Promise<void> {
    const repository = manager.getRepository(EmployeeMovementOperation);
    const pendingOperations = await repository.find({
      where: {
        movementId: movement.id,
        status: EmployeeMovementOperationStatusEnum.PENDING,
      },
      order: { createdAt: 'ASC' },
    });

    for (const operation of pendingOperations) {
      try {
        await this.processOperation(operation, manager);
      } catch (error) {
        operation.status = EmployeeMovementOperationStatusEnum.FAILED;
        operation.lastError =
          error instanceof Error
            ? error.message
            : 'Operation failed during movement application';
      }

      await repository.save(operation);
    }
  }

  private async processOperation(
    operation: EmployeeMovementOperation,
    manager: EntityManager,
  ): Promise<void> {
    operation.lastError = null;

    switch (operation.operationType) {
      case EmployeeMovementOperationTypeEnum.REEVALUATE_PROBATION_REVIEWER: {
        const payload = operation.payload as {
          employee_id: number;
          new_manager_employee_id: number | null;
        };
        operation.result = await this.processProbationReviewerReassignment(
          operation.companyId,
          payload.employee_id,
          payload.new_manager_employee_id,
          manager,
        );
        operation.status = EmployeeMovementOperationStatusEnum.COMPLETED;
        operation.completedAt = new Date();
        break;
      }
      case EmployeeMovementOperationTypeEnum.RECALCULATE_ATTENDANCE_ASSIGNMENT: {
        const movement = await manager
          .getRepository(EmployeeMovement)
          .findOneOrFail({
            where: { id: operation.movementId, companyId: operation.companyId },
          });
        operation.result = await this.queueAttendanceRefreshForMovement(
          movement,
          manager,
        );
        operation.status = EmployeeMovementOperationStatusEnum.COMPLETED;
        operation.completedAt = new Date();
        break;
      }
      case EmployeeMovementOperationTypeEnum.UPDATE_BRANCH_ACCESS: {
        const movement = await manager.getRepository(EmployeeMovement).findOne({
          where: { id: operation.movementId, companyId: operation.companyId },
          relations: { changes: true },
        });
        const payload = operation.payload as {
          branch_id?: number | null;
        } | null;
        const branchId =
          payload?.branch_id ??
          movement?.changes?.find(
            (change) => change.field === EmployeeMovementFieldEnum.BRANCH,
          )?.newReferenceId ??
          null;

        if (!movement) {
          throw new NotFoundException('Employee movement not found.');
        }

        operation.result = await this.ensureMovementBranchAccess(
          movement,
          branchId,
          manager,
        );
        operation.status = EmployeeMovementOperationStatusEnum.COMPLETED;
        operation.completedAt = new Date();
        break;
      }
      case EmployeeMovementOperationTypeEnum.REEVALUATE_LEAVE_POLICY:
        operation.status = EmployeeMovementOperationStatusEnum.SKIPPED;
        operation.result = {
          skipped: true,
          reason:
            'Leave eligibility is resolved dynamically in the leave domain; no standalone reassignment hook is implemented yet.',
        };
        operation.lastError =
          'Leave-policy reevaluation still requires manual follow-up.';
        operation.completedAt = new Date();
        break;
    }
  }

  async findOperations(actor: AuthenticatedUser, movementId: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    await this.findOne(actor, movementId);

    return this.dataSource.getRepository(EmployeeMovementOperation).find({
      where: { companyId, movementId },
      order: { createdAt: 'ASC' },
    });
  }

  async retryOperation(
    actor: AuthenticatedUser,
    movementId: number,
    operationId: number,
  ): Promise<EmployeeMovementOperation> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    await this.findOne(actor, movementId);

    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(EmployeeMovementOperation);
      const operation = await repository
        .createQueryBuilder('operation')
        .setLock('pessimistic_write')
        .where('operation.id = :operationId', { operationId })
        .andWhere('operation.movement_id = :movementId', { movementId })
        .andWhere('operation.company_id = :companyId', { companyId })
        .getOne();

      if (!operation) {
        throw new NotFoundException('Movement operation not found.');
      }

      if (operation.status !== EmployeeMovementOperationStatusEnum.FAILED) {
        throw new ConflictException('Only failed operations can be retried.');
      }

      operation.attemptCount += 1;
      operation.status = EmployeeMovementOperationStatusEnum.PROCESSING;
      operation.lastError = null;

      try {
        await this.processOperation(operation, manager);
      } catch (error) {
        operation.status = EmployeeMovementOperationStatusEnum.FAILED;
        operation.lastError =
          error instanceof Error ? error.message : 'Operation retry failed';
      }

      return repository.save(operation);
    });
  }

  // ---------------------------------------------------------------------
  // Employee self-service
  // ---------------------------------------------------------------------

  private readonly sensitiveMovementFields = new Set([
    EmployeeMovementFieldEnum.BASE_SALARY,
  ]);

  private mapMovementForSelfService(movement: EmployeeMovement) {
    return {
      id: movement.id,
      movement_no: movement.movementNo,
      movement_type: movement.movementType,
      status: movement.status,
      title: movement.title,
      effective_date: movement.effectiveDate,
      submitted_at: movement.submittedAt,
      approved_at: movement.approvedAt,
      applied_at: movement.appliedAt,
      cancelled_at: movement.cancelledAt,
      rejected_at: movement.rejectedAt,
      employee_acknowledgement_required:
        movement.employeeAcknowledgementRequired,
      employee_acknowledged_at: movement.employeeAcknowledgedAt,
      changes: (movement.changes ?? [])
        .filter((change) => !this.sensitiveMovementFields.has(change.field))
        .map((change) => ({
          field: change.field,
          old_reference_id: change.oldReferenceId ?? null,
          new_reference_id: change.newReferenceId ?? null,
          old_value: change.oldValue ?? null,
          new_value: change.newValue ?? null,
        })),
    };
  }

  private async findEmployeeForActorOrFail(
    actor: AuthenticatedUser,
  ): Promise<Employee> {
    if (!actor.companyMembershipId) {
      throw new ForbiddenException('Active company membership is required');
    }

    const employee = await this.dataSource.getRepository(Employee).findOne({
      where: { company_user_id: actor.companyMembershipId },
    });

    if (!employee) {
      throw new NotFoundException(
        'No employee record is linked to the current user.',
      );
    }

    return employee;
  }

  async findMyMovements(actor: AuthenticatedUser) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const employee = await this.findEmployeeForActorOrFail(actor);

    const movements = await this.movementRepository.find({
      where: { companyId, employeeId: employee.id },
      relations: { changes: true },
      order: { createdAt: 'DESC' },
    });

    return movements.map((movement) =>
      this.mapMovementForSelfService(movement),
    );
  }

  async findMyMovement(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const employee = await this.findEmployeeForActorOrFail(actor);

    const movement = await this.movementRepository.findOne({
      where: { id, companyId, employeeId: employee.id },
      relations: { changes: true },
    });

    if (!movement) {
      throw new NotFoundException('Employee movement not found.');
    }

    return this.mapMovementForSelfService(movement);
  }

  async acknowledgeMyMovement(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const employee = await this.findEmployeeForActorOrFail(actor);

    const movement = await this.movementRepository.findOne({
      where: { id, companyId, employeeId: employee.id },
      relations: { changes: true },
    });

    if (!movement) {
      throw new NotFoundException('Employee movement not found.');
    }

    if (!movement.employeeAcknowledgementRequired) {
      throw new BadRequestException(
        'This movement does not require employee acknowledgement.',
      );
    }

    if (movement.status !== EmployeeMovementStatusEnum.APPLIED) {
      throw new ConflictException(
        'Only an applied movement can be acknowledged.',
      );
    }

    if (!movement.employeeAcknowledgedAt) {
      movement.employeeAcknowledgedAt = new Date();
      await this.movementRepository.save(movement);
    }

    return this.mapMovementForSelfService(movement);
  }
}
