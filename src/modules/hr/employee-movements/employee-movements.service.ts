import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
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
import { HrAccessService } from '../shared/hr-access.service';
import { PositionAvailabilityService } from '../shared/position-availability.service';
import { addDaysToDateOnly, formatDateOnly } from '../shared/hr.utils';
import {
  EmployeeCompensationVersion,
  EmployeeCompensationVersionStatusEnum,
} from './entities/employee-compensation-version.entity';
import { EmployeeMovement } from './entities/employee-movement.entity';
import { EmployeeMovementChange } from './entities/employee-movement-change.entity';
import { EmployeeMovementNumberSequence } from './entities/employee-movement-number-sequence.entity';
import { EmployeeMovementTypeEnum } from './enums/employee-movement-type.enum';
import {
  EmployeeMovementStatusEnum,
  OPEN_EMPLOYEE_MOVEMENT_STATUSES,
} from './enums/employee-movement-status.enum';
import { EmployeeMovementFieldEnum } from './enums/employee-movement-field.enum';
import { CreateEmployeeMovementDto } from './dtos/create-employee-movement.dto';
import { ApproveEmployeeMovementDto } from './dtos/approve-employee-movement.dto';

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
      throw new BadRequestException(
        'An employee cannot report to themselves.',
      );
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
      salary_currency:
        dto.salary_revision?.currency ?? current.salary_currency,
      salary_structure_code:
        dto.salary_revision?.salary_structure_code ??
        current.salary_structure_code,
    };
  }

  private hashSnapshot(snapshot: Record<string, unknown>): string {
    return createHash('sha256').update(stableStringify(snapshot)).digest('hex');
  }

  private async createMovementChanges(
    movement: EmployeeMovement,
    dto: CreateEmployeeMovementDto,
    current: Record<string, unknown>,
    manager: EntityManager,
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
        oldReferenceId:
          current.reporting_manager_employee_id as number | null,
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
      changes.push({
        field: EmployeeMovementFieldEnum.BASE_SALARY,
        oldValue: {
          amount: current.base_salary,
          currency: current.salary_currency,
        },
        newValue: {
          amount: dto.salary_revision.base_salary,
          currency: dto.salary_revision.currency.toUpperCase(),
          salary_structure_code: dto.salary_revision.salary_structure_code,
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

  private movementHasSalaryChange(
    changes: EmployeeMovementChange[] | undefined,
  ): boolean {
    return (changes ?? []).some(
      (change) => change.field === EmployeeMovementFieldEnum.BASE_SALARY,
    );
  }

  private movementHasSeniorChange(movementType: EmployeeMovementTypeEnum): boolean {
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
      const proposedSnapshot = this.buildProposedSnapshot(
        currentSnapshot,
        dto,
      );

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
    query: { status?: string; movement_type?: string },
  ): Promise<EmployeeMovement[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    return this.movementRepository.find({
      where: {
        companyId,
        ...(query.status
          ? { status: query.status as EmployeeMovementStatusEnum }
          : {}),
        ...(query.movement_type
          ? { movementType: query.movement_type as EmployeeMovementTypeEnum }
          : {}),
      },
      relations: { employee: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(actor: AuthenticatedUser, id: number): Promise<EmployeeMovement> {
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

  async submit(actor: AuthenticatedUser, movementId: number): Promise<EmployeeMovement> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    return this.dataSource.transaction(async (manager) => {
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

      movement.submittedAt = new Date();
      movement.status = EmployeeMovementStatusEnum.PENDING_APPROVAL;

      await manager.getRepository(EmployeeMovement).save(movement);

      return movement;
    });
  }

  async cancel(actor: AuthenticatedUser, movementId: number): Promise<EmployeeMovement> {
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

    return this.dataSource.transaction(async (manager) => {
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

      return movement;
    });
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

  private assertApproverAuthorized(
    movement: EmployeeMovement,
    actor: AuthenticatedUser,
  ): void {
    if (!actor.permissions.includes('employee_movements:approve')) {
      throw new ForbiddenException(
        'You do not have permission to approve employee movements.',
      );
    }

    if (
      this.movementHasSalaryChange(movement.changes) &&
      !actor.permissions.includes('employee_movements:finance-approve')
    ) {
      throw new ForbiddenException(
        'This movement includes a salary change and requires Finance approval.',
      );
    }

    if (
      this.configService.get<boolean>(
        'MOVEMENT_REQUIRE_MANAGEMENT_APPROVAL_FOR_PROMOTION',
      ) &&
      this.movementHasSeniorChange(movement.movementType) &&
      !actor.permissions.includes('employee_movements:management-approve')
    ) {
      throw new ForbiddenException(
        'This movement requires senior management approval.',
      );
    }
  }

  async approve(
    actor: AuthenticatedUser,
    movementId: number,
    dto: ApproveEmployeeMovementDto,
  ): Promise<EmployeeMovement> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    return this.dataSource.transaction(async (manager) => {
      const movement = await this.lockMovement(companyId, movementId, manager);
      this.assertMakerChecker(movement, actor);
      this.assertApproverAuthorized(movement, actor);

      if (movement.status !== EmployeeMovementStatusEnum.PENDING_APPROVAL) {
        throw new ConflictException(
          'This movement is not pending approval.',
        );
      }

      const today = formatDateOnly(new Date());

      movement.status =
        movement.effectiveDate > today
          ? EmployeeMovementStatusEnum.SCHEDULED
          : EmployeeMovementStatusEnum.APPROVED;
      movement.approvedAt = new Date();
      movement.approvedByCompanyUserId = actor.companyMembershipId ?? null;
      movement.metadata = {
        ...(movement.metadata ?? {}),
        approval_comments: dto.comments ?? null,
      };

      await manager.getRepository(EmployeeMovement).save(movement);

      return movement;
    });
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
          ([, key]) =>
            movement.currentSnapshot[key] !== currentSnapshot[key],
        )
        .map(([field]) => field);

      if (conflicts.length) {
        throw new ConflictException({
          message:
            'Employee data changed after this movement was submitted.',
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

    await repository.save(
      repository.create({
        companyId: movement.companyId,
        employeeId: employee.id,
        movementId: movement.id,
        baseSalary: value.amount,
        currency: value.currency.toUpperCase(),
        salaryStructureCode: value.salary_structure_code ?? null,
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

  async apply(actor: AuthenticatedUser, movementId: number): Promise<EmployeeMovement> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    try {
      return await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
        const movement = await this.lockMovement(companyId, movementId, manager);

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
          throw new ConflictException('Movement is not ready for application.');
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

        return movement;
      });
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
}
