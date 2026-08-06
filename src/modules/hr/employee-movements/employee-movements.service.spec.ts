import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EmployeeMovementsService } from './employee-movements.service';
import { EmployeeMovement } from './entities/employee-movement.entity';
import { EmployeeMovementTypeEnum } from './enums/employee-movement-type.enum';
import { EmployeeMovementStatusEnum } from './enums/employee-movement-status.enum';
import { EmployeeMovementFieldEnum } from './enums/employee-movement-field.enum';
import { Employee } from '../employees/entities/employee.entity';
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
  };
  let positionAvailabilityService: {
    isPositionAvailableForDepartment: jest.Mock;
    isPositionAvailableForBranch: jest.Mock;
  };
  let movementRepository: MockRepo;
  let eventEmitter: { emit: jest.Mock };

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
    };
    positionAvailabilityService = {
      isPositionAvailableForDepartment: jest.fn().mockResolvedValue(true),
      isPositionAvailableForBranch: jest.fn().mockResolvedValue(true),
    };
    movementRepository = createRepositoryMock();
    eventEmitter = { emit: jest.fn() };

    service = new EmployeeMovementsService(
      dataSource as never,
      configService as never,
      hrAccessService as never,
      positionAvailabilityService as never,
      eventEmitter as never,
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
        createQueryBuilderMock({ getOne: jest.fn().mockResolvedValue(movement) }),
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
        createQueryBuilderMock({ getOne: jest.fn().mockResolvedValue(movement) }),
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
        changes: [
          { field: EmployeeMovementFieldEnum.BASE_SALARY } as never,
        ],
        metadata: {
          approval_steps: ['PRIMARY', 'FINANCE'],
          completed_approval_steps: ['PRIMARY'],
        },
      });
      const movementRepo = createRepositoryMock();
      movementRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({ getOne: jest.fn().mockResolvedValue(movement) }),
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
        createQueryBuilderMock({ getOne: jest.fn().mockResolvedValue(movement) }),
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
        createQueryBuilderMock({ getOne: jest.fn().mockResolvedValue(movement) }),
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
});
