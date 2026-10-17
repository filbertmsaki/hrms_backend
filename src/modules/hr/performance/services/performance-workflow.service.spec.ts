import { BadRequestException, ConflictException } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Department } from '../../departments/entities/department.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { HrAccessService } from '../../shared/hr-access.service';
import { PerformancePeriodAssignment } from '../entities/performance-period-assignment.entity';
import {
  PerformanceReviewWorkflowStep,
  PerformanceReviewWorkflowStepStatusEnum,
} from '../entities/performance-review-workflow-step.entity';
import { PerformanceReview } from '../entities/performance-review.entity';
import { PerformanceReviewStatusEnum } from '../enums/performance-review-status.enum';
import { PerformanceWorkflowConfig } from '../entities/performance-workflow-config.entity';
import { PerformanceWorkflowStepTypeEnum } from '../enums/performance-workflow-step-type.enum';
import { PerformanceAuditService } from './performance-audit.service';
import { PerformanceWorkflowService } from './performance-workflow.service';

const actor: AuthenticatedUser = {
  id: 1,
  email: 'hr@example.com',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 1,
  companyMembershipId: 10,
  employeeId: 5,
  roles: [],
  permissions: [],
};

function repository<T>(overrides: Partial<Repository<T>> = {}) {
  return {
    create: jest.fn((value: T) => value),
    save: jest.fn(async (value: T) => value),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    ...overrides,
  } as unknown as Repository<T>;
}

function harness() {
  const hrAccess = {
    ensureActorCompanyId: jest.fn().mockReturnValue(1),
    hasCompanyScope: jest.fn().mockReturnValue(true),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const workflowRepository = repository<PerformanceWorkflowConfig>();
  const reviewStepRepository = repository<PerformanceReviewWorkflowStep>();
  const reviewRepository = repository<PerformanceReview>();
  const assignmentRepository = repository<PerformancePeriodAssignment>();
  const employeeRepository = repository<Employee>();
  const departmentRepository = repository<Department>();

  const manager = {
    getRepository: (entity: unknown) =>
      entity === PerformanceReview
        ? reviewRepository
        : entity === PerformancePeriodAssignment
          ? assignmentRepository
          : reviewStepRepository,
  } as unknown as EntityManager;
  Object.assign(reviewRepository, {
    manager: {
      transaction: (work: (value: EntityManager) => Promise<unknown>) =>
        work(manager),
    },
  });

  const service = new PerformanceWorkflowService(
    hrAccess as unknown as HrAccessService,
    audit as unknown as PerformanceAuditService,
    workflowRepository,
    reviewStepRepository,
    reviewRepository,
    assignmentRepository,
    employeeRepository,
    departmentRepository,
  );

  return {
    service,
    workflowRepository,
    reviewStepRepository,
    reviewRepository,
    assignmentRepository,
  };
}

describe('PerformanceWorkflowService', () => {
  it.each([false, true])(
    'permits skipping only an optional step (required: %s)',
    async (required) => {
      const {
        service,
        reviewRepository,
        assignmentRepository,
        reviewStepRepository,
      } = harness();
      jest.spyOn(reviewRepository, 'findOne').mockResolvedValue({
        id: 50,
        companyId: 1,
        periodAssignmentId: 70,
        status: PerformanceReviewStatusEnum.HR_REVIEW_PENDING,
      } as PerformanceReview);
      jest
        .spyOn(assignmentRepository, 'findOne')
        .mockResolvedValue({ id: 70 } as PerformancePeriodAssignment);
      const step = {
        id: 100,
        status: PerformanceReviewWorkflowStepStatusEnum.PENDING,
        metadata: { required, can_finalize: false },
      } as PerformanceReviewWorkflowStep;
      jest.spyOn(reviewStepRepository, 'find').mockResolvedValue([step]);
      const action = service.actOnCurrentStep(actor, 50, {
        decision: 'SKIP',
        comment: 'Not needed',
      });
      if (required) await expect(action).rejects.toThrow('Only optional');
      else {
        expect((await action).completed).toBe(false);
        expect(step.status).toBe(
          PerformanceReviewWorkflowStepStatusEnum.SKIPPED,
        );
      }
    },
  );

  it('final approval skips remaining optional steps', async () => {
    const {
      service,
      reviewRepository,
      assignmentRepository,
      reviewStepRepository,
    } = harness();
    jest.spyOn(reviewRepository, 'findOne').mockResolvedValue({
      id: 50,
      companyId: 1,
      periodAssignmentId: 70,
      status: PerformanceReviewStatusEnum.HR_REVIEW_PENDING,
    } as PerformanceReview);
    jest
      .spyOn(assignmentRepository, 'findOne')
      .mockResolvedValue({ id: 70 } as PerformancePeriodAssignment);
    const steps = [
      {
        id: 100,
        status: PerformanceReviewWorkflowStepStatusEnum.PENDING,
        metadata: { required: true, can_finalize: true },
      },
      {
        id: 101,
        status: PerformanceReviewWorkflowStepStatusEnum.PENDING,
        metadata: { required: false, can_finalize: false },
      },
    ] as PerformanceReviewWorkflowStep[];
    jest.spyOn(reviewStepRepository, 'find').mockResolvedValue(steps);
    expect(
      (await service.actOnCurrentStep(actor, 50, { decision: 'APPROVE' }))
        .completed,
    ).toBe(true);
    expect(steps[1].status).toBe(
      PerformanceReviewWorkflowStepStatusEnum.SKIPPED,
    );
  });

  it('does not finalize a workflow merely because a non-final step is last', async () => {
    const {
      service,
      reviewRepository,
      assignmentRepository,
      reviewStepRepository,
    } = harness();
    jest.spyOn(reviewRepository, 'findOne').mockResolvedValue({
      id: 50,
      companyId: 1,
      periodAssignmentId: 70,
      status: PerformanceReviewStatusEnum.HR_REVIEW_PENDING,
    } as PerformanceReview);
    jest
      .spyOn(assignmentRepository, 'findOne')
      .mockResolvedValue({ id: 70 } as PerformancePeriodAssignment);
    const step = {
      id: 100,
      status: PerformanceReviewWorkflowStepStatusEnum.PENDING,
      metadata: { required: true, can_finalize: false },
    } as PerformanceReviewWorkflowStep;
    jest.spyOn(reviewStepRepository, 'find').mockResolvedValue([step]);
    expect(
      (await service.actOnCurrentStep(actor, 50, { decision: 'APPROVE' }))
        .completed,
    ).toBe(false);
    expect(
      (await service.actOnCurrentStep(actor, 50, { decision: 'APPROVE' }))
        .completed,
    ).toBe(false);
  });

  it('rejects duplicate workflow step codes', async () => {
    const { service } = harness();

    await expect(
      service.create(actor, {
        code: 'annual',
        name: 'Annual review',
        steps: [
          {
            code: 'HR',
            label: 'HR review',
            type: PerformanceWorkflowStepTypeEnum.HR_REVIEW,
            sequence_number: 1,
          },
          {
            code: 'HR',
            label: 'Final HR review',
            type: PerformanceWorkflowStepTypeEnum.FINAL_APPROVAL,
            sequence_number: 2,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks the workflow complete when the last pending step is approved', async () => {
    const {
      service,
      reviewRepository,
      assignmentRepository,
      reviewStepRepository,
    } = harness();
    const review = {
      id: 50,
      companyId: 1,
      employeeId: 20,
      periodAssignmentId: 70,
      status: PerformanceReviewStatusEnum.HR_REVIEW_PENDING,
    } as PerformanceReview;
    const assignment = { id: 70, companyId: 1 } as PerformancePeriodAssignment;
    const pendingStep = {
      id: 100,
      companyId: 1,
      performanceReviewId: 50,
      periodAssignmentId: 70,
      sequenceNumber: 1,
      code: 'FINAL',
      label: 'Final approval',
      stepType: PerformanceWorkflowStepTypeEnum.FINAL_APPROVAL,
      status: PerformanceReviewWorkflowStepStatusEnum.PENDING,
      assignedEmployeeId: null,
      assignedCompanyUserId: null,
    } as PerformanceReviewWorkflowStep;
    const approvedStep = {
      ...pendingStep,
      status: PerformanceReviewWorkflowStepStatusEnum.APPROVED,
    };

    jest.spyOn(reviewRepository, 'findOne').mockResolvedValue(review);
    jest.spyOn(assignmentRepository, 'findOne').mockResolvedValue(assignment);
    jest
      .spyOn(reviewStepRepository, 'find')
      .mockResolvedValueOnce([pendingStep])
      .mockResolvedValueOnce([approvedStep]);

    const result = await service.actOnCurrentStep(actor, 50, {
      decision: 'APPROVE',
    });

    expect(result.completed).toBe(true);
    expect(reviewStepRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 100,
        status: PerformanceReviewWorkflowStepStatusEnum.APPROVED,
      }),
    );
  });
  it('does not allow an approval action to change an already published review', async () => {
    const {
      service,
      reviewRepository,
      reviewStepRepository,
      assignmentRepository,
    } = harness();
    jest.spyOn(reviewRepository, 'findOne').mockResolvedValue({
      id: 50,
      companyId: 1,
      status: PerformanceReviewStatusEnum.PUBLISHED,
    } as PerformanceReview);
    jest.spyOn(assignmentRepository, 'findOne').mockResolvedValue({
      id: 70,
      companyId: 1,
    } as PerformancePeriodAssignment);
    await expect(
      service.actOnCurrentStep(actor, 50, { decision: 'APPROVE' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(reviewStepRepository.save).not.toHaveBeenCalled();
  });
});
