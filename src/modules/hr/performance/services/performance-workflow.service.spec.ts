import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
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
});
