import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { EmployeeMovementsService } from './employee-movements.service';
import { AttendanceRecalculationJob } from '../attendance/processing/entities/attendance-recalculation-job.entity';
import { CompanyUserBranchAccess } from '../branches/entities/company-user-branch-access.entity';
import { EmployeeMovement } from './entities/employee-movement.entity';
import { EmployeeMovementChange } from './entities/employee-movement-change.entity';
import { EmployeeMovementOperation } from './entities/employee-movement-operation.entity';
import { EmployeeCompensationVersion } from './entities/employee-compensation-version.entity';
import { EmployeeMovementTypeEnum } from './enums/employee-movement-type.enum';
import { EmployeeMovementOperationStatusEnum } from './enums/employee-movement-operation-status.enum';
import { EmployeeMovementOperationTypeEnum } from './enums/employee-movement-operation-type.enum';
import { EmployeeMovementStatusEnum } from './enums/employee-movement-status.enum';
import { EmployeeMovementFieldEnum } from './enums/employee-movement-field.enum';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeePosition } from '../employees/entities/employee-position.entity';
import { Position } from '../positions/entities/position.entity';
import { Branch } from '../branches/entities/branch.entity';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { EmploymentTypeEnum } from '../employees/enums/employment-type.enum';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';

type MockRepo = Record<string, jest.Mock>;

const createQueryBuilderMock = (overrides: Record<string, unknown> = {}) => {
  const builder: Record<string, jest.Mock> = {
    setLock: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(null),
    getOneOrFail: jest.fn().mockRejectedValue(new Error('not stubbed')),
    getCount: jest.fn().mockResolvedValue(0),
    execute: jest.fn().mockResolvedValue({ affected: 0 }),
    ...overrides,
  };
  return builder;
};

const createRepositoryMock = (): MockRepo => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findOneOrFail: jest.fn(),
  update: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
  save: jest.fn((value: unknown) => Promise.resolve(value)),
  create: jest.fn((value: unknown) => value),
  createQueryBuilder: jest.fn(() => createQueryBuilderMock()),
});

describe('EmployeeMovementsService', () => {
  let service: EmployeeMovementsService;
  let dataSource: { transaction: jest.Mock };
  let configService: { get: jest.Mock };
  let hrAccessService: {
    ensureActorCompanyId: jest.Mock;
    assertCanAccessEmployee: jest.Mock;
    getAccessibleEmployeeIds: jest.Mock;
  };
  let positionAvailabilityService: {
    isPositionAvailableForDepartment: jest.Mock;
    isPositionAvailableForBranch: jest.Mock;
  };
  let movementRepository: MockRepo;
  let eventEmitter: { emit: jest.Mock };
  let letterService: { generateAndStore: jest.Mock };

  const actor: AuthenticatedUser = {
    id: 1,
    email: 'hr@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: 10,
    companyMembershipId: 90,
    employeeId: 5,
    roles: [],
    permissions: ['employee_movements:approve'],
  };

  const buildEmployee = (overrides: Partial<Employee> = {}): Employee =>
    ({
      id: 2,
      company_id: 10,
      company_user_id: 20,
      employee_no: 'EMP-002',
      first_name: 'John',
      last_name: 'Smith',
      employment_status: EmploymentStatusEnum.ACTIVE,
      employment_type: EmploymentTypeEnum.FULL_TIME,
      hire_date: '2025-01-01',
      exit_date: null,
      primary_branch_id: 1,
      primary_department_id: 1,
      primary_position_id: 1,
      grade_id: null,
      cost_center_id: null,
      reports_to: null,
      version: 1,
      ...overrides,
    }) as Employee;

  beforeEach(() => {
    dataSource = { transaction: jest.fn() };
    configService = {
      get: jest.fn((key: string) => {
        const defaults: Record<string, unknown> = {
          MOVEMENT_ALLOW_BACKDATED_APPLICATION: false,
          MOVEMENT_MAX_BACKDATE_DAYS: 30,
          MOVEMENT_REQUIRE_MANAGEMENT_APPROVAL_FOR_PROMOTION: true,
        };
        return defaults[key];
      }),
    };
    hrAccessService = {
      ensureActorCompanyId: jest.fn(() => 10),
      assertCanAccessEmployee: jest.fn(),
      getAccessibleEmployeeIds: jest.fn().mockResolvedValue(null),
    };
    positionAvailabilityService = {
      isPositionAvailableForDepartment: jest.fn().mockResolvedValue(true),
      isPositionAvailableForBranch: jest.fn().mockResolvedValue(true),
    };
    movementRepository = createRepositoryMock();
    eventEmitter = { emit: jest.fn() };
    letterService = {
      generateAndStore: jest.fn().mockResolvedValue({ id: 501 }),
    };

    service = new EmployeeMovementsService(
      dataSource as never,
      configService as never,
      hrAccessService as never,
      positionAvailabilityService as never,
      eventEmitter as never,
      letterService as never,
      movementRepository as never,
    );
  });

  describe('create — field validation', () => {
    it('rejects a branch transfer without a new_branch_id', async () => {
      await expect(
        service.create(actor, {
          employee_id: 2,
          movement_type: EmployeeMovementTypeEnum.BRANCH_TRANSFER,
          title: 'Transfer',
          reason: 'Business need',
          effective_date: '2026-09-01',
        } as never),
      ).rejects.toThrow(BadRequestException);

      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects a promotion without a new position or grade', async () => {
      await expect(
        service.create(actor, {
          employee_id: 2,
          movement_type: EmployeeMovementTypeEnum.PROMOTION,
          title: 'Promotion',
          reason: 'Performance',
          effective_date: '2026-09-01',
        } as never),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('create — effective date validation', () => {
    it('rejects a backdated movement without the backdate permission', async () => {
      const employee = buildEmployee();
      dataSource.transaction.mockImplementation(async (cb) =>
        cb({
          getRepository: jest.fn((entity: unknown) => {
            if (entity === Employee) {
              const repo = createRepositoryMock();
              repo.createQueryBuilder.mockReturnValue(
                createQueryBuilderMock({
                  getOne: jest.fn().mockResolvedValue(employee),
                }),
              );
              return repo;
            }
            throw new Error('Unexpected repository requested');
          }),
        }),
      );

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const backdate = yesterday.toISOString().slice(0, 10);

      await expect(
        service.create(actor, {
          employee_id: 2,
          movement_type: EmployeeMovementTypeEnum.BRANCH_TRANSFER,
          new_branch_id: 5,
          title: 'Transfer',
          reason: 'Business need',
          effective_date: backdate,
        } as never),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll — scoped access', () => {
    it('filters movement lists to employees in the actor accessible scope', async () => {
      hrAccessService.getAccessibleEmployeeIds.mockResolvedValue([2, 3]);
      movementRepository.find.mockResolvedValue([]);

      await service.findAll(actor, {});

      expect(movementRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 10,
            employeeId: expect.objectContaining({
              _value: [2, 3],
            }),
          }),
        }),
      );
    });

    it('returns an empty list when a requested employee is outside scope', async () => {
      hrAccessService.getAccessibleEmployeeIds.mockResolvedValue([2, 3]);

      await expect(
        service.findAll(actor, { employee_id: 99 }),
      ).resolves.toEqual([]);

      expect(movementRepository.find).not.toHaveBeenCalled();
    });
  });

  describe('maker-checker enforcement', () => {
    const buildMovement = (
      overrides: Partial<EmployeeMovement> = {},
    ): EmployeeMovement =>
      ({
        id: 1,
        companyId: 10,
        employeeId: 2,
        status: EmployeeMovementStatusEnum.PENDING_APPROVAL,
        requestedByCompanyUserId: 90,
        movementType: EmployeeMovementTypeEnum.BRANCH_TRANSFER,
        effectiveDate: '2026-09-01',
        changes: [],
        employee: buildEmployee({ company_user_id: 20 }),
        metadata: null,
        ...overrides,
      }) as EmployeeMovement;

    it('rejects the movement creator approving their own movement', async () => {
      const movement = buildMovement({ requestedByCompanyUserId: 90 });
      const movementRepo = createRepositoryMock();
      movementRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(movement),
        }),
      );

      dataSource.transaction.mockImplementation(async (cb) =>
        cb({
          getRepository: jest.fn(() => movementRepo),
        }),
      );

      await expect(service.approve(actor, 1, {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects the employee approving their own movement', async () => {
      const movement = buildMovement({
        requestedByCompanyUserId: 999,
        employee: buildEmployee({ company_user_id: actor.companyMembershipId }),
      });
      const movementRepo = createRepositoryMock();
      movementRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(movement),
        }),
      );

      dataSource.transaction.mockImplementation(async (cb) =>
        cb({ getRepository: jest.fn(() => movementRepo) }),
      );

      await expect(service.approve(actor, 1, {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('requires finance-approve permission when the movement includes a salary change', async () => {
      const movement = buildMovement({
        requestedByCompanyUserId: 999,
        changes: [{ field: EmployeeMovementFieldEnum.BASE_SALARY } as never],
        metadata: {
          approval_steps: ['PRIMARY', 'FINANCE'],
          completed_approval_steps: ['PRIMARY'],
        },
      });
      const movementRepo = createRepositoryMock();
      movementRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(movement),
        }),
      );

      dataSource.transaction.mockImplementation(async (cb) =>
        cb({ getRepository: jest.fn(() => movementRepo) }),
      );

      await expect(service.approve(actor, 1, {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('requires management-approve permission for a promotion', async () => {
      const movement = buildMovement({
        requestedByCompanyUserId: 999,
        movementType: EmployeeMovementTypeEnum.PROMOTION,
        metadata: {
          approval_steps: ['PRIMARY', 'MANAGEMENT'],
          completed_approval_steps: ['PRIMARY'],
        },
      });
      const movementRepo = createRepositoryMock();
      movementRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(movement),
        }),
      );

      dataSource.transaction.mockImplementation(async (cb) =>
        cb({ getRepository: jest.fn(() => movementRepo) }),
      );

      await expect(service.approve(actor, 1, {})).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('apply — status guards', () => {
    it('rejects applying a movement that is not approved, scheduled, or failed', async () => {
      const movement = {
        id: 1,
        companyId: 10,
        employeeId: 2,
        status: EmployeeMovementStatusEnum.DRAFT,
        changes: [],
        employee: buildEmployee(),
      } as unknown as EmployeeMovement;

      const movementRepo = createRepositoryMock();
      movementRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(movement),
        }),
      );

      dataSource.transaction.mockImplementation(async (cb) =>
        cb({ getRepository: jest.fn(() => movementRepo) }),
      );

      await expect(service.apply(actor, 1)).rejects.toThrow();
      expect(movementRepository.update).toHaveBeenCalledWith(
        { id: 1, companyId: 10 },
        expect.objectContaining({
          status: EmployeeMovementStatusEnum.APPLICATION_FAILED,
        }),
      );
    });
  });

  describe('retryOperation - downstream integrations', () => {
    const buildMovement = (
      overrides: Partial<EmployeeMovement> = {},
    ): EmployeeMovement =>
      ({
        id: 1,
        companyId: 10,
        employeeId: 2,
        movementNo: 'MOV-2026-000001',
        status: EmployeeMovementStatusEnum.APPLIED,
        requestedByCompanyUserId: 90,
        approvedByCompanyUserId: 91,
        movementType: EmployeeMovementTypeEnum.BRANCH_TRANSFER,
        effectiveDate: '2026-08-01',
        changes: [],
        employee: buildEmployee({ company_user_id: 20 }),
        metadata: null,
        ...overrides,
      }) as EmployeeMovement;

    it('queues an attendance recalculation job when retrying that operation type', async () => {
      const movement = buildMovement();
      const operation = {
        id: 55,
        companyId: 10,
        movementId: movement.id,
        operationType:
          EmployeeMovementOperationTypeEnum.RECALCULATE_ATTENDANCE_ASSIGNMENT,
        status: EmployeeMovementOperationStatusEnum.FAILED,
        attemptCount: 0,
        payload: { employee_id: movement.employeeId },
      } as EmployeeMovementOperation;

      const operationRepo = createRepositoryMock();
      operationRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(operation),
        }),
      );

      const movementTxRepo = createRepositoryMock();
      movementTxRepo.findOneOrFail.mockResolvedValue(movement);

      const jobRepo = createRepositoryMock();
      jobRepo.findOne.mockResolvedValue(null);
      jobRepo.save.mockImplementation(
        async (value: Record<string, unknown>) => ({
          id: 77,
          ...value,
        }),
      );

      movementRepository.findOne.mockResolvedValue(movement);
      dataSource.transaction.mockImplementation(async (cb) =>
        cb({
          getRepository: jest.fn((entity: unknown) => {
            if (entity === EmployeeMovementOperation) {
              return operationRepo;
            }
            if (entity === EmployeeMovement) {
              return movementTxRepo;
            }
            if (entity === AttendanceRecalculationJob) {
              return jobRepo;
            }
            throw new Error('Unexpected repository requested');
          }),
        }),
      );

      const result = await service.retryOperation(
        actor,
        movement.id,
        operation.id,
      );

      expect(result.status).toBe(EmployeeMovementOperationStatusEnum.COMPLETED);
      expect(result.result).toEqual(
        expect.objectContaining({
          queued: true,
          job_id: 77,
        }),
      );
      expect(jobRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 10,
          employeeId: movement.employeeId,
          reason: `Employee movement ${movement.movementNo} attendance refresh`,
        }),
      );
    });

    it('grants missing branch access when retrying the branch access operation', async () => {
      const movement = buildMovement({
        changes: [
          {
            field: EmployeeMovementFieldEnum.BRANCH,
            newReferenceId: 5,
          } as never,
        ],
      });
      const operation = {
        id: 56,
        companyId: 10,
        movementId: movement.id,
        operationType: EmployeeMovementOperationTypeEnum.UPDATE_BRANCH_ACCESS,
        status: EmployeeMovementOperationStatusEnum.FAILED,
        attemptCount: 0,
        payload: { branch_id: 5 },
      } as EmployeeMovementOperation;

      const operationRepo = createRepositoryMock();
      operationRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(operation),
        }),
      );

      const movementTxRepo = createRepositoryMock();
      movementTxRepo.findOne.mockResolvedValue(movement);

      const employeeRepo = createRepositoryMock();
      employeeRepo.findOne.mockResolvedValue({
        id: movement.employeeId,
        company_user_id: 20,
      });

      const branchAccessRepo = createRepositoryMock();
      branchAccessRepo.findOne.mockResolvedValue(null);
      branchAccessRepo.save.mockImplementation(
        async (value: Record<string, unknown>) => ({
          id: 88,
          ...value,
        }),
      );

      movementRepository.findOne.mockResolvedValue(movement);
      dataSource.transaction.mockImplementation(async (cb) =>
        cb({
          getRepository: jest.fn((entity: unknown) => {
            if (entity === EmployeeMovementOperation) {
              return operationRepo;
            }
            if (entity === EmployeeMovement) {
              return movementTxRepo;
            }
            if (entity === Employee) {
              return employeeRepo;
            }
            if (entity === CompanyUserBranchAccess) {
              return branchAccessRepo;
            }
            throw new Error('Unexpected repository requested');
          }),
        }),
      );

      const result = await service.retryOperation(
        actor,
        movement.id,
        operation.id,
      );

      expect(result.status).toBe(EmployeeMovementOperationStatusEnum.COMPLETED);
      expect(result.result).toEqual(
        expect.objectContaining({
          granted: true,
          assignment_id: 88,
          branch_id: 5,
        }),
      );
      expect(branchAccessRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          company_user_id: 20,
          branch_id: 5,
        }),
      );
    });
  });

  describe('approve — multi-step progression', () => {
    const buildMovement = (
      overrides: Partial<EmployeeMovement> = {},
    ): EmployeeMovement =>
      ({
        id: 1,
        companyId: 10,
        employeeId: 2,
        status: EmployeeMovementStatusEnum.PENDING_APPROVAL,
        requestedByCompanyUserId: 999,
        movementType: EmployeeMovementTypeEnum.SALARY_REVISION,
        effectiveDate: '2026-09-01',
        changes: [{ field: EmployeeMovementFieldEnum.BASE_SALARY } as never],
        employee: buildEmployee({ company_user_id: 20 }),
        metadata: null,
        approvedAt: null,
        approvedByCompanyUserId: null,
        ...overrides,
      }) as EmployeeMovement;

    const mockTransactionOnMovementRepo = (movementRepo: MockRepo) => {
      dataSource.transaction.mockImplementation(async (cb) =>
        cb({ getRepository: jest.fn(() => movementRepo) }),
      );
    };

    it('leaves a salary-change movement PENDING_APPROVAL after only the PRIMARY step', async () => {
      const movement = buildMovement();
      const movementRepo = createRepositoryMock();
      movementRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(movement),
        }),
      );
      mockTransactionOnMovementRepo(movementRepo);

      const result = await service.approve(actor, 1, {});

      expect(result.status).toBe(EmployeeMovementStatusEnum.PENDING_APPROVAL);
      expect(
        (result.metadata as { completed_approval_steps: string[] })
          .completed_approval_steps,
      ).toEqual(['PRIMARY']);
    });

    it('requires the finance-approve permission for the second step', async () => {
      const movement = buildMovement({
        metadata: {
          approval_steps: ['PRIMARY', 'FINANCE'],
          completed_approval_steps: ['PRIMARY'],
        },
      });
      const movementRepo = createRepositoryMock();
      movementRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(movement),
        }),
      );
      mockTransactionOnMovementRepo(movementRepo);

      await expect(service.approve(actor, 1, {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('reaches APPROVED/SCHEDULED only after both PRIMARY and FINANCE steps complete', async () => {
      const financeActor: AuthenticatedUser = {
        ...actor,
        permissions: [
          'employee_movements:approve',
          'employee_movements:finance-approve',
        ],
      };
      const movement = buildMovement({
        metadata: {
          approval_steps: ['PRIMARY', 'FINANCE'],
          completed_approval_steps: ['PRIMARY'],
        },
      });
      const movementRepo = createRepositoryMock();
      movementRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(movement),
        }),
      );
      mockTransactionOnMovementRepo(movementRepo);

      const result = await service.approve(financeActor, 1, {});

      expect(
        (result.metadata as { completed_approval_steps: string[] })
          .completed_approval_steps,
      ).toEqual(['PRIMARY', 'FINANCE']);
      expect([
        EmployeeMovementStatusEnum.APPROVED,
        EmployeeMovementStatusEnum.SCHEDULED,
      ]).toContain(result.status);
    });

    it('requires PRIMARY then MANAGEMENT for a promotion when management approval is required by config', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'MOVEMENT_REQUIRE_MANAGEMENT_APPROVAL_FOR_PROMOTION') {
          return true;
        }
        return undefined;
      });
      const movement = buildMovement({
        movementType: EmployeeMovementTypeEnum.PROMOTION,
        changes: [],
        metadata: null,
      });
      const movementRepo = createRepositoryMock();
      movementRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(movement),
        }),
      );
      mockTransactionOnMovementRepo(movementRepo);

      const result = await service.approve(actor, 1, {});

      expect(result.status).toBe(EmployeeMovementStatusEnum.PENDING_APPROVAL);
      expect(
        (result.metadata as { approval_steps: string[] }).approval_steps,
      ).toEqual(['PRIMARY', 'MANAGEMENT']);
    });

    it('allows PRIMARY alone to fully approve a promotion when management approval is not required', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'MOVEMENT_REQUIRE_MANAGEMENT_APPROVAL_FOR_PROMOTION') {
          return false;
        }
        return undefined;
      });
      const movement = buildMovement({
        movementType: EmployeeMovementTypeEnum.PROMOTION,
        changes: [],
        metadata: null,
      });
      const movementRepo = createRepositoryMock();
      movementRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(movement),
        }),
      );
      mockTransactionOnMovementRepo(movementRepo);

      const result = await service.approve(actor, 1, {});

      expect([
        EmployeeMovementStatusEnum.APPROVED,
        EmployeeMovementStatusEnum.SCHEDULED,
      ]).toContain(result.status);
    });
  });

  describe('assertMovementStillApplicable — snapshot conflict detection', () => {
    const buildApplyMovement = (
      overrides: Partial<EmployeeMovement> = {},
    ): EmployeeMovement =>
      ({
        id: 1,
        companyId: 10,
        employeeId: 2,
        movementNo: 'MOV-2026-000001',
        status: EmployeeMovementStatusEnum.APPROVED,
        movementType: EmployeeMovementTypeEnum.BRANCH_TRANSFER,
        effectiveDate: '2026-01-01',
        applicationAttemptCount: 0,
        applicationError: null,
        changes: [
          {
            field: EmployeeMovementFieldEnum.BRANCH,
            newReferenceId: 5,
          } as never,
        ],
        currentSnapshot: {
          branch_id: 1,
          department_id: 1,
          position_id: 1,
          grade_id: null,
          cost_center_id: null,
          reporting_manager_employee_id: null,
          employment_type: EmploymentTypeEnum.FULL_TIME,
          base_salary: null,
          salary_currency: null,
          salary_structure_code: null,
        },
        snapshotHash: 'stale-hash',
        employee: buildEmployee(),
        ...overrides,
      }) as EmployeeMovement;

    const mockApplyTransaction = (
      movement: EmployeeMovement,
      employeeAtApplyTime: Employee,
    ) => {
      const movementRepo = createRepositoryMock();
      movementRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(movement),
        }),
      );

      const employeeRepo = createRepositoryMock();
      employeeRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOneOrFail: jest.fn().mockResolvedValue(employeeAtApplyTime),
        }),
      );
      employeeRepo.save = jest.fn((value: unknown) => Promise.resolve(value));

      const compensationRepo = createRepositoryMock();
      compensationRepo.findOne.mockResolvedValue(null);

      const operationRepo = createRepositoryMock();
      operationRepo.find.mockResolvedValue([]);

      dataSource.transaction.mockImplementation(
        async (isolationOrFn: unknown, maybeFn?: unknown) => {
          const cb = (
            typeof isolationOrFn === 'function' ? isolationOrFn : maybeFn
          ) as (manager: unknown) => Promise<unknown>;

          return cb({
            getRepository: jest.fn((entity: unknown) => {
              if (entity === EmployeeMovement) return movementRepo;
              if (entity === Employee) return employeeRepo;
              if (entity === EmployeeCompensationVersion)
                return compensationRepo;
              if (entity === EmployeeMovementOperation) return operationRepo;
              throw new Error('Unexpected repository requested');
            }),
          });
        },
      );

      return { movementRepo, employeeRepo, compensationRepo, operationRepo };
    };

    it('throws ConflictException with conflicting_fields when a touched field drifted', async () => {
      const movement = buildApplyMovement();
      const driftedEmployee = buildEmployee({ primary_branch_id: 2 });
      mockApplyTransaction(movement, driftedEmployee);

      await expect(service.apply(actor, 1)).rejects.toThrow(ConflictException);

      try {
        await service.apply(actor, 1);
      } catch (error) {
        expect((error as { response?: unknown }).response).toEqual(
          expect.objectContaining({
            conflicting_fields: [EmployeeMovementFieldEnum.BRANCH],
          }),
        );
      }
    });

    it('does not block application when the drifted field is not part of this movement changes', async () => {
      const movement = buildApplyMovement({
        changes: [],
        currentSnapshot: {
          branch_id: 1,
          department_id: 1,
          position_id: 1,
          grade_id: null,
          cost_center_id: null,
          reporting_manager_employee_id: null,
          employment_type: EmploymentTypeEnum.FULL_TIME,
          base_salary: null,
          salary_currency: null,
          salary_structure_code: null,
        },
      });
      const driftedEmployee = buildEmployee({ primary_department_id: 99 });
      mockApplyTransaction(movement, driftedEmployee);

      const result = await service.apply(actor, 1);

      expect(result.status).toBe(EmployeeMovementStatusEnum.APPLIED);
    });
  });

  describe('retryOperation — attempt tracking', () => {
    it('increments attemptCount and moves a retried operation through processing', async () => {
      const movement = {
        id: 1,
        companyId: 10,
        employeeId: 2,
        movementNo: 'MOV-2026-000002',
        status: EmployeeMovementStatusEnum.APPLIED,
        changes: [],
        employee: buildEmployee(),
      } as unknown as EmployeeMovement;

      movementRepository.findOne.mockResolvedValue(movement);

      const operation = {
        id: 60,
        companyId: 10,
        movementId: movement.id,
        operationType:
          EmployeeMovementOperationTypeEnum.REEVALUATE_PROBATION_REVIEWER,
        status: EmployeeMovementOperationStatusEnum.FAILED,
        attemptCount: 1,
        payload: {
          employee_id: movement.employeeId,
          new_manager_employee_id: null,
        },
      } as EmployeeMovementOperation;

      const operationRepo = createRepositoryMock();
      operationRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(operation),
        }),
      );
      operationRepo.save.mockImplementation((value: unknown) =>
        Promise.resolve(value),
      );

      dataSource.transaction.mockImplementation(async (cb) =>
        cb({
          getRepository: jest.fn((entity: unknown) => {
            if (entity === EmployeeMovementOperation) return operationRepo;
            throw new Error('Unexpected repository requested');
          }),
        }),
      );

      const result = await service.retryOperation(
        actor,
        movement.id,
        operation.id,
      );

      expect(operation.attemptCount).toBe(2);
      expect(operationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ attemptCount: 2 }),
      );
      expect(result.status).toBe(EmployeeMovementOperationStatusEnum.COMPLETED);
    });

    it('rejects retrying an operation that is not FAILED', async () => {
      const movement = {
        id: 1,
        companyId: 10,
        employeeId: 2,
        movementNo: 'MOV-2026-000002',
        status: EmployeeMovementStatusEnum.APPLIED,
        changes: [],
        employee: buildEmployee(),
      } as unknown as EmployeeMovement;

      movementRepository.findOne.mockResolvedValue(movement);

      const operation = {
        id: 61,
        companyId: 10,
        movementId: movement.id,
        operationType:
          EmployeeMovementOperationTypeEnum.REEVALUATE_PROBATION_REVIEWER,
        status: EmployeeMovementOperationStatusEnum.COMPLETED,
        attemptCount: 1,
        payload: {
          employee_id: movement.employeeId,
          new_manager_employee_id: null,
        },
      } as EmployeeMovementOperation;

      const operationRepo = createRepositoryMock();
      operationRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(operation),
        }),
      );

      dataSource.transaction.mockImplementation(async (cb) =>
        cb({
          getRepository: jest.fn((entity: unknown) => {
            if (entity === EmployeeMovementOperation) return operationRepo;
            throw new Error('Unexpected repository requested');
          }),
        }),
      );

      await expect(
        service.retryOperation(actor, movement.id, operation.id),
      ).rejects.toThrow(ConflictException);
      expect(operationRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('reject / returnForCorrection flows', () => {
    const buildMovement = (
      overrides: Partial<EmployeeMovement> = {},
    ): EmployeeMovement =>
      ({
        id: 1,
        companyId: 10,
        employeeId: 2,
        status: EmployeeMovementStatusEnum.PENDING_APPROVAL,
        requestedByCompanyUserId: 999,
        movementType: EmployeeMovementTypeEnum.BRANCH_TRANSFER,
        effectiveDate: '2026-09-01',
        changes: [],
        employee: buildEmployee({ company_user_id: 20 }),
        metadata: null,
        ...overrides,
      }) as EmployeeMovement;

    const mockLockOnMovementRepo = (movement: EmployeeMovement) => {
      const movementRepo = createRepositoryMock();
      movementRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(movement),
        }),
      );
      dataSource.transaction.mockImplementation(async (cb) =>
        cb({ getRepository: jest.fn(() => movementRepo) }),
      );
      return movementRepo;
    };

    it('rejects a PENDING_APPROVAL movement, sets REJECTED, and emits the rejected event', async () => {
      const movement = buildMovement();
      const employeeRepo = createRepositoryMock();
      employeeRepo.findOne.mockResolvedValue({
        id: movement.employeeId,
        company_user: {
          user: {
            first_name: 'Jane',
            last_name: 'Doe',
            email: 'jane@example.com',
          },
        },
      });
      const movementRepo = createRepositoryMock();
      movementRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(movement),
        }),
      );
      dataSource.transaction.mockImplementation(async (cb) =>
        cb({
          getRepository: jest.fn((entity: unknown) => {
            if (entity === Employee) return employeeRepo;
            return movementRepo;
          }),
        }),
      );

      const result = await service.reject(actor, 1, 'Not aligned with policy');

      expect(result.status).toBe(EmployeeMovementStatusEnum.REJECTED);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({}),
      );
    });

    it('blocks reject when the actor is the requester', async () => {
      const movement = buildMovement({ requestedByCompanyUserId: 90 });
      mockLockOnMovementRepo(movement);

      await expect(service.reject(actor, 1, 'comment')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('blocks reject when the actor is the employee themself', async () => {
      const movement = buildMovement({
        employee: buildEmployee({ company_user_id: actor.companyMembershipId }),
      });
      mockLockOnMovementRepo(movement);

      await expect(service.reject(actor, 1, 'comment')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects reject() for a movement that is not PENDING_APPROVAL', async () => {
      const movement = buildMovement({
        status: EmployeeMovementStatusEnum.APPROVED,
      });
      mockLockOnMovementRepo(movement);

      await expect(service.reject(actor, 1, 'comment')).rejects.toThrow(
        ConflictException,
      );
    });

    it('returns a PENDING_APPROVAL movement for correction', async () => {
      const movement = buildMovement();
      mockLockOnMovementRepo(movement);

      const result = await service.returnForCorrection(
        actor,
        1,
        'Fix the reason',
      );

      expect(result.status).toBe(
        EmployeeMovementStatusEnum.RETURNED_FOR_CORRECTION,
      );
    });

    it('rejects returnForCorrection() for a movement that is not PENDING_APPROVAL', async () => {
      const movement = buildMovement({
        status: EmployeeMovementStatusEnum.DRAFT,
      });
      mockLockOnMovementRepo(movement);

      await expect(
        service.returnForCorrection(actor, 1, 'comment'),
      ).rejects.toThrow(ConflictException);
    });

    it('allows a RETURNED_FOR_CORRECTION movement to be re-submitted', async () => {
      const movement = buildMovement({
        status: EmployeeMovementStatusEnum.RETURNED_FOR_CORRECTION,
        employee: buildEmployee({ company_user_id: 20, reports_to: null }),
      });
      const movementRepo = mockLockOnMovementRepo(movement);
      movementRepo.save = jest.fn((value: unknown) => Promise.resolve(value));

      const result = await service.submit(actor, 1);

      expect(result.status).toBe(EmployeeMovementStatusEnum.PENDING_APPROVAL);
    });

    it('allows a RETURNED_FOR_CORRECTION movement to be edited via update()', async () => {
      const movement = buildMovement({
        status: EmployeeMovementStatusEnum.RETURNED_FOR_CORRECTION,
        movementType: EmployeeMovementTypeEnum.BRANCH_TRANSFER,
        changes: [
          {
            field: EmployeeMovementFieldEnum.BRANCH,
            newReferenceId: 5,
          } as never,
        ],
      });
      const employee = buildEmployee();

      const movementRepo = createRepositoryMock();
      movementRepo.createQueryBuilder
        .mockReturnValueOnce(
          createQueryBuilderMock({
            getOne: jest.fn().mockResolvedValue(movement),
          }),
        )
        .mockReturnValueOnce(
          createQueryBuilderMock({ getOne: jest.fn().mockResolvedValue(null) }),
        );
      movementRepo.save = jest.fn((value: unknown) => Promise.resolve(value));
      movementRepo.findOneOrFail.mockResolvedValue(movement);

      const employeeRepo = createRepositoryMock();
      employeeRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(employee),
        }),
      );

      const branchRepo = createRepositoryMock();
      branchRepo.findOne.mockResolvedValue({ id: 5, company_id: 10 });

      const positionRepo = createRepositoryMock();
      positionRepo.findOne.mockResolvedValue({
        id: 1,
        company_id: 10,
        is_active: true,
        headcount: 10,
      });

      const employeePositionRepo = createRepositoryMock();
      employeePositionRepo.count.mockResolvedValue(0);

      const changeRepo = createRepositoryMock();
      changeRepo.delete = jest.fn().mockResolvedValue({ affected: 1 });

      const compensationRepo = createRepositoryMock();
      compensationRepo.findOne.mockResolvedValue(null);

      dataSource.transaction.mockImplementation(async (cb) =>
        cb({
          getRepository: jest.fn((entity: unknown) => {
            if (entity === EmployeeMovement) return movementRepo;
            if (entity === Employee) return employeeRepo;
            if (entity === Branch) return branchRepo;
            if (entity === Position) return positionRepo;
            if (entity === EmployeePosition) return employeePositionRepo;
            if (entity === EmployeeMovementChange) return changeRepo;
            if (entity === EmployeeCompensationVersion) return compensationRepo;
            throw new Error(`Unexpected repository requested`);
          }),
        }),
      );

      await service.update(actor, 1, {
        employee_id: 2,
        movement_type: EmployeeMovementTypeEnum.BRANCH_TRANSFER,
        title: 'Updated transfer',
        reason: 'Updated reason',
        effective_date: '2099-09-05',
        new_branch_id: 5,
      } as never);

      expect(movementRepo.save).toHaveBeenCalled();
      expect(changeRepo.delete).toHaveBeenCalledWith({ movementId: 1 });
    });
  });

  describe('generateLetter', () => {
    const buildMovement = (
      overrides: Partial<EmployeeMovement> = {},
    ): EmployeeMovement =>
      ({
        id: 1,
        companyId: 10,
        employeeId: 2,
        status: EmployeeMovementStatusEnum.APPROVED,
        movementType: EmployeeMovementTypeEnum.BRANCH_TRANSFER,
        employee: buildEmployee(),
        ...overrides,
      }) as EmployeeMovement;

    it('delegates to the letter service for an eligible movement', async () => {
      const movement = buildMovement();
      movementRepository.findOne.mockResolvedValue(movement);

      const result = await service.generateLetter(
        actor,
        1,
        'TRANSFER' as never,
      );

      expect(hrAccessService.assertCanAccessEmployee).toHaveBeenCalledWith(
        actor,
        movement.employee,
      );
      expect(letterService.generateAndStore).toHaveBeenCalledWith(
        10,
        1,
        'TRANSFER',
      );
      expect(result).toEqual({ id: 501 });
    });

    it('rejects generating a letter for a movement that is not approved/scheduled/applied', async () => {
      const movement = buildMovement({
        status: EmployeeMovementStatusEnum.DRAFT,
      });
      movementRepository.findOne.mockResolvedValue(movement);

      await expect(
        service.generateLetter(actor, 1, 'TRANSFER' as never),
      ).rejects.toThrow(ConflictException);

      expect(letterService.generateAndStore).not.toHaveBeenCalled();
    });
  });
});
