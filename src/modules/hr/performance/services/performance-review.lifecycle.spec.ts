import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../../shared/hr-access.service';
import { PerformanceReviewService } from './performance-review.service';
import { PerformanceAuditService } from './performance-audit.service';
import { PerformanceCompetencyService } from './performance-competency.service';
import { PerformanceImprovementPlanService } from './performance-improvement-plan.service';
import { PerformanceScorecardService } from './performance-scorecard.service';
import { PerformanceWorkflowService } from './performance-workflow.service';
import { KpiAchievement } from '../entities/kpi-achievement.entity';
import { PerformancePeriodAssignment } from '../entities/performance-period-assignment.entity';
import { PerformancePeriod } from '../entities/performance-period.entity';
import { PerformanceReview } from '../entities/performance-review.entity';
import { PerformanceRatingScale } from '../entities/performance-rating-scale.entity';
import { PerformanceReviewModeration } from '../entities/performance-review-moderation.entity';
import { PerformanceAppeal } from '../entities/performance-appeal.entity';
import { PerformanceReviewStatusEnum } from '../enums/performance-review-status.enum';

const actor: AuthenticatedUser = {
  id: 1,
  email: 'employee@example.test',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 1,
  companyMembershipId: 1,
  employeeId: 10,
  roles: [],
  permissions: [],
};

async function harness(status: PerformanceReviewStatusEnum, closed = false) {
  const assignment = {
    id: 7,
    companyId: 1,
    performancePeriodId: 5,
    employeeId: 10,
    managerEmployeeId: 10,
  };
  const review = {
    id: 8,
    companyId: 1,
    employeeId: 10,
    periodAssignmentId: 7,
    status,
  };
  const assignmentRepository = {
    findOne: jest.fn().mockResolvedValue(assignment),
    save: jest.fn(async (value: unknown) => value),
  };
  const reviewRepository = {
    findOne: jest.fn().mockResolvedValue(review),
    save: jest.fn(async (value: unknown) => value),
    manager: { transaction: jest.fn() },
  };
  const periodRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: 5,
      companyId: 1,
      status: closed ? 'CANCELLED' : 'OPEN',
      startDate: '2020-01-01',
      finalReviewDeadline: '2099-01-01',
    }),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === PerformancePeriodAssignment
        ? assignmentRepository
        : entity === PerformancePeriod
          ? periodRepository
          : reviewRepository,
    ),
  } as unknown as EntityManager;
  reviewRepository.manager.transaction.mockImplementation(
    async (run: (value: EntityManager) => Promise<unknown>) => run(manager),
  );
  const access = {
    ensureActorCompanyId: jest.fn().mockReturnValue(1),
    hasCompanyScope: jest.fn().mockReturnValue(true),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const module = await Test.createTestingModule({
    providers: [
      PerformanceReviewService,
      { provide: ConfigService, useValue: { get: jest.fn() } },
      { provide: HrAccessService, useValue: access },
      { provide: PerformanceAuditService, useValue: audit },
      { provide: PerformanceCompetencyService, useValue: {} },
      { provide: PerformanceImprovementPlanService, useValue: {} },
      { provide: PerformanceScorecardService, useValue: {} },
      {
        provide: PerformanceWorkflowService,
        useValue: { initializeForReview: jest.fn() },
      },
      {
        provide: getRepositoryToken(PerformancePeriodAssignment),
        useValue: assignmentRepository,
      },
      {
        provide: getRepositoryToken(PerformanceReview),
        useValue: reviewRepository,
      },
      ...[
        KpiAchievement,
        PerformanceRatingScale,
        PerformanceReviewModeration,
        PerformanceAppeal,
      ].map((entity) => ({
        provide: getRepositoryToken(entity),
        useValue: { find: jest.fn().mockResolvedValue([]) },
      })),
    ],
  }).compile();
  return {
    service: module.get(PerformanceReviewService),
    module,
    assignmentRepository,
    reviewRepository,
  };
}

describe('PerformanceReview lifecycle enforcement', () => {
  it('locks the assignment and advances self review and assignment together', async () => {
    const h = await harness(PerformanceReviewStatusEnum.DRAFT);
    try {
      const saved = await h.service.submitSelfReview(actor, 7, {
        review: { comment: 'Completed my evidence.' },
      });
      expect(h.assignmentRepository.findOne).toHaveBeenCalledWith({
        where: { id: 7, companyId: 1 },
        lock: { mode: 'pessimistic_write' },
      });
      expect(saved.status).toBe(
        PerformanceReviewStatusEnum.MANAGER_REVIEW_PENDING,
      );
      expect(h.assignmentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'MANAGER_REVIEW' }),
      );
      expect(h.reviewRepository.manager.transaction).toHaveBeenCalledTimes(1);
    } finally {
      await h.module.close();
    }
  });
  it.each([
    PerformanceReviewStatusEnum.PUBLISHED,
    PerformanceReviewStatusEnum.HR_REVIEW_PENDING,
  ])(
    'rejects repeated self submission from %s without writing',
    async (status) => {
      const h = await harness(status);
      try {
        await expect(
          h.service.submitSelfReview(actor, 7, {}),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(h.reviewRepository.save).not.toHaveBeenCalled();
        expect(h.assignmentRepository.save).not.toHaveBeenCalled();
      } finally {
        await h.module.close();
      }
    },
  );
  it('requires self submission before manager review', async () => {
    const h = await harness(PerformanceReviewStatusEnum.DRAFT);
    try {
      await expect(
        h.service.submitManagerReview(actor, 7, {}),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(h.reviewRepository.save).not.toHaveBeenCalled();
    } finally {
      await h.module.close();
    }
  });
  it('rejects review submissions for cancelled cycles', async () => {
    const h = await harness(PerformanceReviewStatusEnum.DRAFT, true);
    try {
      await expect(
        h.service.submitSelfReview(actor, 7, {}),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(h.reviewRepository.save).not.toHaveBeenCalled();
    } finally {
      await h.module.close();
    }
  });
});
