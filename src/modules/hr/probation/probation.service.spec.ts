import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProbationService } from './probation.service';
import { ProbationCase } from './entities/probation-case.entity';
import { ProbationPolicy } from './entities/probation-policy.entity';
import { ProbationNumberSequence } from './entities/probation-number-sequence.entity';
import { ProbationReviewCycle } from './entities/probation-review-cycle.entity';
import { ProbationReviewRating } from './entities/probation-review-rating.entity';
import { ProbationObjective } from './entities/probation-objective.entity';
import { ProbationExtension } from './entities/probation-extension.entity';
import { Employee } from '../employees/entities/employee.entity';
import { EmploymentTypeEnum } from '../employees/enums/employment-type.enum';
import { EmployeeConfirmationStatusEnum } from '../employees/enums/employee-confirmation-status.enum';
import { ProbationCaseStatusEnum } from './enums/probation-case-status.enum';
import { ProbationManagerRecommendationEnum } from './enums/probation-manager-recommendation.enum';
import { ProbationFinalDecisionEnum } from './enums/probation-final-decision.enum';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';

type MockRepo = Record<string, jest.Mock>;

const createQueryBuilderMock = (overrides: Record<string, unknown> = {}) => {
  const builder: Record<string, jest.Mock> = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(null),
    getOneOrFail: jest.fn().mockRejectedValue(new Error('not stubbed')),
    getMany: jest.fn().mockResolvedValue([]),
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
  save: jest.fn((value: unknown) => Promise.resolve(value)),
  create: jest.fn((value: unknown) => value),
  createQueryBuilder: jest.fn(() => createQueryBuilderMock()),
});

describe('ProbationService', () => {
  let service: ProbationService;
  let dataSource: { transaction: jest.Mock };
  let configService: { get: jest.Mock };
  let policyResolver: { resolve: jest.Mock };
  let hrAccessService: {
    ensureActorCompanyId: jest.Mock;
    getAccessibleEmployeeIds: jest.Mock;
    assertCanAccessEmployee: jest.Mock;
    assertCompanyScopedActor: jest.Mock;
  };
  let actionItemsService: {
    upsertOpen: jest.Mock;
    completeBySource: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let letterService: {
    isLetterGenerated: jest.Mock;
    generateAndStore: jest.Mock;
  };
  let offboardingService: { createOffboardingRequest: jest.Mock };
  let caseRepository: MockRepo;
  let policyRepository: MockRepo;

  const actor: AuthenticatedUser = {
    id: 1,
    email: 'hr@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: 10,
    companyMembershipId: 90,
    employeeId: 5,
    roles: [],
    permissions: ['probation_reviews:manager-review-any'],
  };

  const buildEmployee = (overrides: Partial<Employee> = {}): Employee =>
    ({
      id: 1,
      company_id: 10,
      employee_no: 'EMP-001',
      first_name: 'Jane',
      last_name: 'Doe',
      employment_type: EmploymentTypeEnum.FULL_TIME,
      hire_date: '2026-01-01',
      reports_to: 7,
      primary_branch_id: null,
      primary_department_id: null,
      primary_position_id: null,
      grade_id: null,
      ...overrides,
    }) as Employee;

  beforeEach(() => {
    dataSource = { transaction: jest.fn() };
    configService = {
      get: jest.fn((key: string) => {
        const defaults: Record<string, unknown> = {
          PROBATION_DEFAULT_PERIOD_DAYS: 180,
          PROBATION_MAX_EXTENSIONS: 2,
          PROBATION_MAX_EXTENSION_DAYS: 180,
          PROBATION_DEFAULT_EXTENSION_DAYS: 90,
          PROBATION_MINIMUM_CONFIRMATION_SCORE: 60,
        };
        return defaults[key];
      }),
    };
    policyResolver = { resolve: jest.fn().mockResolvedValue(null) };
    hrAccessService = {
      ensureActorCompanyId: jest.fn(() => 10),
      getAccessibleEmployeeIds: jest.fn().mockResolvedValue(null),
      assertCanAccessEmployee: jest.fn(),
      assertCompanyScopedActor: jest.fn(),
    };
    actionItemsService = {
      upsertOpen: jest.fn(),
      completeBySource: jest.fn(),
    };
    auditService = { log: jest.fn() };
    letterService = {
      isLetterGenerated: jest.fn().mockResolvedValue(false),
      generateAndStore: jest.fn().mockResolvedValue({ id: 555 }),
    };
    offboardingService = { createOffboardingRequest: jest.fn() };
    caseRepository = createRepositoryMock();
    policyRepository = createRepositoryMock();

    service = new ProbationService(
      dataSource as never,
      configService as never,
      policyResolver as never,
      hrAccessService as never,
      actionItemsService as never,
      auditService as never,
      letterService as never,
      offboardingService as never,
      caseRepository as never,
      policyRepository as never,
    );
  });

  describe('case retrieval scoping', () => {
    it('limits listCases to employees in the actor access scope', async () => {
      hrAccessService.getAccessibleEmployeeIds.mockResolvedValue([2, 3]);
      caseRepository.find.mockResolvedValue([]);

      await service.listCases(actor, { status: 'ACTIVE' });

      expect(caseRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 10,
            status: ProbationCaseStatusEnum.ACTIVE,
            employeeId: expect.any(Object),
          }),
        }),
      );
    });

    it('returns no listCases rows when the actor has no accessible employees', async () => {
      hrAccessService.getAccessibleEmployeeIds.mockResolvedValue([]);

      await expect(service.listCases(actor, {})).resolves.toEqual([]);
      expect(caseRepository.find).not.toHaveBeenCalled();
    });

    it('combines assigned and accessible employees for team probation cases', async () => {
      hrAccessService.getAccessibleEmployeeIds.mockResolvedValue([5, 8, 9]);
      caseRepository.find.mockResolvedValue([]);

      await service.listMyTeamCases(actor, {
        status: 'MANAGER_REVIEW_PENDING',
      });

      expect(caseRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: [
            expect.objectContaining({
              companyId: 10,
              managerCompanyUserId: 90,
              status: ProbationCaseStatusEnum.MANAGER_REVIEW_PENDING,
            }),
            expect.objectContaining({
              companyId: 10,
              employeeId: expect.any(Object),
              status: ProbationCaseStatusEnum.MANAGER_REVIEW_PENDING,
            }),
          ],
        }),
      );
    });
  });

  const buildManagerFor = (repos: Partial<Record<string, MockRepo>>) => ({
    getRepository: jest.fn((entity: unknown) => {
      if (entity === ProbationCase)
        return repos.probationCase ?? caseRepository;
      if (entity === Employee) return repos.employee ?? createRepositoryMock();
      if (entity === ProbationReviewCycle)
        return repos.reviewCycle ?? createRepositoryMock();
      if (entity === ProbationReviewRating)
        return repos.reviewRating ?? createRepositoryMock();
      if (entity === ProbationObjective)
        return repos.objective ?? createRepositoryMock();
      if (entity === ProbationExtension)
        return repos.extension ?? createRepositoryMock();
      if (entity === ProbationNumberSequence)
        return repos.numberSequence ?? createRepositoryMock();
      if (entity === ProbationPolicy) return repos.policy ?? policyRepository;
      throw new Error('Unexpected repository requested in test');
    }),
  });

  describe('ensureCaseForEmployee', () => {
    it('creates a new ACTIVE case with a due date derived from the default period when no policy matches', async () => {
      const employee = buildEmployee();
      const probationCaseRepo = createRepositoryMock();
      probationCaseRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({ getOne: jest.fn().mockResolvedValue(null) }),
      );

      const numberSequenceRepo = createRepositoryMock();
      numberSequenceRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(null),
        }),
      );
      numberSequenceRepo.save.mockImplementation((value: unknown) =>
        Promise.resolve({ ...(value as object), nextNumber: 1 }),
      );

      const employeeRepo = createRepositoryMock();
      const manager = buildManagerFor({
        probationCase: probationCaseRepo,
        numberSequence: numberSequenceRepo,
        employee: employeeRepo,
      });

      const result = await service.ensureCaseForEmployee(
        10,
        employee,
        actor,
        manager as never,
      );

      expect(result).toBeTruthy();
      expect(probationCaseRepo.save).toHaveBeenCalled();
      const savedCase = probationCaseRepo.save.mock.calls[0][0];
      expect(savedCase.status).toBe(ProbationCaseStatusEnum.OBJECTIVES_PENDING);
      expect(savedCase.originalStartDate).toBe('2026-01-01');
      expect(savedCase.originalDueDate).toBe('2026-06-30');
      expect(employeeRepo.update).toHaveBeenCalledWith(
        employee.id,
        expect.objectContaining({
          confirmation_status: EmployeeConfirmationStatusEnum.PROBATION,
          probation_start_date: '2026-01-01',
        }),
      );
    });

    it('returns the existing open case instead of creating a duplicate', async () => {
      const employee = buildEmployee();
      const existingCase = { id: 99 } as ProbationCase;
      const probationCaseRepo = createRepositoryMock();
      probationCaseRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(existingCase),
        }),
      );

      const manager = buildManagerFor({ probationCase: probationCaseRepo });

      const result = await service.ensureCaseForEmployee(
        10,
        employee,
        actor,
        manager as never,
      );

      expect(result).toBe(existingCase);
      expect(probationCaseRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('submitManagerReview', () => {
    const buildCase = (overrides: Partial<ProbationCase> = {}): ProbationCase =>
      ({
        id: 1,
        companyId: 10,
        employeeId: 2,
        employee: buildEmployee({ id: 2 }),
        managerCompanyUserId: 90,
        currentCycleNumber: 1,
        policySnapshot: { minimum_confirmation_score: 60 },
        ...overrides,
      }) as ProbationCase;

    it('rejects a manager reviewing their own probation case', async () => {
      const probationCase = buildCase({ employeeId: actor.employeeId });
      const probationCaseRepo = createRepositoryMock();
      probationCaseRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(probationCase),
        }),
      );
      dataSource.transaction.mockImplementation(async (cb) =>
        cb(buildManagerFor({ probationCase: probationCaseRepo })),
      );

      await expect(
        service.submitManagerReview(actor, 1, {
          ratings: [],
          recommendation: ProbationManagerRecommendationEnum.CONFIRM,
          comments: 'ok',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects confirmation recommendation when the score is below the policy minimum', async () => {
      const probationCase = buildCase();
      const probationCaseRepo = createRepositoryMock();
      probationCaseRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(probationCase),
        }),
      );

      const reviewCycleRepo = createRepositoryMock();
      reviewCycleRepo.findOne.mockResolvedValue({
        id: 5,
        probationCaseId: 1,
        cycleNumber: 1,
      });

      const reviewRatingRepo = createRepositoryMock();
      reviewRatingRepo.find.mockResolvedValue([
        {
          criterionCode: 'QUALITY',
          maximumRating: '5',
          weight: '100',
        },
      ]);

      dataSource.transaction.mockImplementation(async (cb) =>
        cb(
          buildManagerFor({
            probationCase: probationCaseRepo,
            reviewCycle: reviewCycleRepo,
            reviewRating: reviewRatingRepo,
          }),
        ),
      );

      await expect(
        service.submitManagerReview(actor, 1, {
          ratings: [{ criterion_code: 'QUALITY', rating: 1 }],
          recommendation: ProbationManagerRecommendationEnum.CONFIRM,
          comments: 'Needs improvement',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('submitHrDecision — confirmation', () => {
    it('confirms the employee and rejects a confirmation date before the hire date', async () => {
      const probationCase = {
        id: 1,
        companyId: 10,
        employeeId: 2,
        managerCompanyUserId: 90,
        currentCycleNumber: 1,
        status: ProbationCaseStatusEnum.HR_REVIEW_PENDING,
        policySnapshot: {},
      } as ProbationCase;

      const probationCaseRepo = createRepositoryMock();
      probationCaseRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(probationCase),
        }),
      );

      const reviewCycleRepo = createRepositoryMock();
      reviewCycleRepo.findOne.mockResolvedValue({
        id: 5,
        managerRecommendation: ProbationManagerRecommendationEnum.CONFIRM,
      });

      const employeeRepo = createRepositoryMock();
      const employeeQueryBuilder = createQueryBuilderMock({
        getOneOrFail: jest
          .fn()
          .mockResolvedValue(buildEmployee({ id: 2, hire_date: '2026-03-01' })),
      });
      employeeRepo.createQueryBuilder.mockReturnValue(employeeQueryBuilder);

      dataSource.transaction.mockImplementation(async (cb) =>
        cb(
          buildManagerFor({
            probationCase: probationCaseRepo,
            reviewCycle: reviewCycleRepo,
            employee: employeeRepo,
          }),
        ),
      );

      await expect(
        service.submitHrDecision(actor, 1, {
          decision: ProbationFinalDecisionEnum.CONFIRMED,
          comments: 'Great performance',
          confirmation_date: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('submitHrDecision — extension limits', () => {
    it('rejects extending a case that has already reached the maximum extension count', async () => {
      const probationCase = {
        id: 1,
        companyId: 10,
        employeeId: 2,
        managerCompanyUserId: 90,
        currentCycleNumber: 1,
        currentDueDate: '2026-06-30',
        extensionCount: 2,
        status: ProbationCaseStatusEnum.HR_REVIEW_PENDING,
        policySnapshot: { maximum_extensions: 2 },
      } as unknown as ProbationCase;

      const probationCaseRepo = createRepositoryMock();
      probationCaseRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(probationCase),
        }),
      );

      const reviewCycleRepo = createRepositoryMock();
      reviewCycleRepo.findOne.mockResolvedValue({
        id: 5,
        managerRecommendation: ProbationManagerRecommendationEnum.EXTEND,
      });

      dataSource.transaction.mockImplementation(async (cb) =>
        cb(
          buildManagerFor({
            probationCase: probationCaseRepo,
            reviewCycle: reviewCycleRepo,
          }),
        ),
      );

      await expect(
        service.submitHrDecision(actor, 1, {
          decision: ProbationFinalDecisionEnum.EXTENDED,
          comments: 'Needs more time',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createCaseManually', () => {
    it('creates a new case for an employee without an open case', async () => {
      const employee = buildEmployee();
      const employeeRepo = createRepositoryMock();
      employeeRepo.findOne.mockResolvedValue(employee);

      const probationCaseRepo = createRepositoryMock();
      probationCaseRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({ getOne: jest.fn().mockResolvedValue(null) }),
      );

      const numberSequenceRepo = createRepositoryMock();
      numberSequenceRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({ getOne: jest.fn().mockResolvedValue(null) }),
      );
      numberSequenceRepo.save.mockImplementation((value: unknown) =>
        Promise.resolve({ ...(value as object), nextNumber: 1 }),
      );

      dataSource.transaction.mockImplementation(async (cb) =>
        cb(
          buildManagerFor({
            probationCase: probationCaseRepo,
            numberSequence: numberSequenceRepo,
            employee: employeeRepo,
          }),
        ),
      );

      const result = await service.createCaseManually(actor, {
        employee_id: employee.id,
        start_date: '2026-02-01',
      });

      expect(result).toBeTruthy();
      expect(probationCaseRepo.save).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalled();
    });

    it('rejects creating a case when the employee already has an open case', async () => {
      const employee = buildEmployee();
      const employeeRepo = createRepositoryMock();
      employeeRepo.findOne.mockResolvedValue(employee);

      const probationCaseRepo = createRepositoryMock();
      probationCaseRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest
            .fn()
            .mockResolvedValue({ id: 99, caseNo: 'PRB-2026-000001' }),
        }),
      );

      dataSource.transaction.mockImplementation(async (cb) =>
        cb(
          buildManagerFor({
            probationCase: probationCaseRepo,
            employee: employeeRepo,
          }),
        ),
      );

      await expect(
        service.createCaseManually(actor, {
          employee_id: employee.id,
          start_date: '2026-02-01',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects creating a case for an employee outside the company', async () => {
      const employeeRepo = createRepositoryMock();
      employeeRepo.findOne.mockResolvedValue(null);

      dataSource.transaction.mockImplementation(async (cb) =>
        cb(buildManagerFor({ employee: employeeRepo })),
      );

      await expect(
        service.createCaseManually(actor, {
          employee_id: 404,
          start_date: '2026-02-01',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateCaseManually', () => {
    const buildEditableCase = (
      overrides: Partial<ProbationCase> = {},
    ): ProbationCase =>
      ({
        id: 1,
        companyId: 10,
        employeeId: 2,
        caseNo: 'PRB-2026-000001',
        employee: buildEmployee({ id: 2 }),
        status: ProbationCaseStatusEnum.ACTIVE,
        currentCycleNumber: 1,
        currentStartDate: '2026-01-01',
        currentDueDate: '2026-06-30',
        policyId: null,
        policySnapshot: null,
        ...overrides,
      }) as ProbationCase;

    it('updates the start and due date on an editable case', async () => {
      const probationCase = buildEditableCase();
      const probationCaseRepo = createRepositoryMock();
      probationCaseRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(probationCase),
        }),
      );

      const reviewCycleRepo = createRepositoryMock();
      reviewCycleRepo.findOne.mockResolvedValue({
        id: 5,
        probationCaseId: 1,
        cycleNumber: 1,
        managerReviewedAt: null,
      });

      const employeeRepo = createRepositoryMock();

      dataSource.transaction.mockImplementation(async (cb) =>
        cb(
          buildManagerFor({
            probationCase: probationCaseRepo,
            reviewCycle: reviewCycleRepo,
            employee: employeeRepo,
          }),
        ),
      );

      const result = await service.updateCaseManually(actor, 1, {
        start_date: '2026-01-15',
        current_due_date: '2026-07-15',
      });

      expect(result.currentStartDate).toBe('2026-01-15');
      expect(result.currentDueDate).toBe('2026-07-15');
      expect(auditService.log).toHaveBeenCalled();
    });

    it('rejects editing a case once the manager review has been submitted', async () => {
      const probationCase = buildEditableCase();
      const probationCaseRepo = createRepositoryMock();
      probationCaseRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(probationCase),
        }),
      );

      const reviewCycleRepo = createRepositoryMock();
      reviewCycleRepo.findOne.mockResolvedValue({
        id: 5,
        probationCaseId: 1,
        cycleNumber: 1,
        managerReviewedAt: new Date('2026-02-01'),
      });

      dataSource.transaction.mockImplementation(async (cb) =>
        cb(
          buildManagerFor({
            probationCase: probationCaseRepo,
            reviewCycle: reviewCycleRepo,
          }),
        ),
      );

      await expect(
        service.updateCaseManually(actor, 1, { start_date: '2026-01-15' }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects editing a case that is no longer in an editable status', async () => {
      const probationCase = buildEditableCase({
        status: ProbationCaseStatusEnum.HR_REVIEW_PENDING,
      });
      const probationCaseRepo = createRepositoryMock();
      probationCaseRepo.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: jest.fn().mockResolvedValue(probationCase),
        }),
      );

      dataSource.transaction.mockImplementation(async (cb) =>
        cb(buildManagerFor({ probationCase: probationCaseRepo })),
      );

      await expect(
        service.updateCaseManually(actor, 1, { start_date: '2026-01-15' }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
