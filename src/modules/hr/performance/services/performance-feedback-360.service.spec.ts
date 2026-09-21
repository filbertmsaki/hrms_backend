import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../../shared/hr-access.service';
import { PerformanceFeedback360Request } from '../entities/performance-feedback-360-request.entity';
import { PerformanceReview } from '../entities/performance-review.entity';
import { PerformanceFeedback360RelationshipEnum } from '../enums/performance-feedback-360-relationship.enum';
import { PerformanceFeedback360StatusEnum } from '../enums/performance-feedback-360-status.enum';
import { PerformanceAuditService } from './performance-audit.service';
import { PerformanceFeedback360Service } from './performance-feedback-360.service';

const hrActor: AuthenticatedUser = {
  id: 1,
  email: 'hr@example.com',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 1,
  companyMembershipId: 15,
  roles: [],
  permissions: [],
};

const raterActor: AuthenticatedUser = {
  id: 2,
  email: 'rater@example.com',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 1,
  companyMembershipId: 16,
  employeeId: 22,
  roles: [],
  permissions: [],
};

function repository<T>(overrides: Partial<Repository<T>> = {}) {
  return {
    create: jest.fn((value: T) => value),
    save: jest.fn(async (value: T) => value),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as Repository<T>;
}

function harness() {
  const hrAccess = { ensureActorCompanyId: jest.fn().mockReturnValue(1) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const reviewRepository = repository<PerformanceReview>({
    findOne: jest.fn().mockResolvedValue({
      id: 20,
      companyId: 1,
      employeeId: 11,
    } as PerformanceReview),
  });
  const feedbackRepository = repository<PerformanceFeedback360Request>();
  const service = new PerformanceFeedback360Service(
    hrAccess as unknown as HrAccessService,
    audit as unknown as PerformanceAuditService,
    reviewRepository,
    feedbackRepository,
  );

  return { service, reviewRepository, feedbackRepository, audit };
}

describe('PerformanceFeedback360Service', () => {
  describe('invite', () => {
    it('rejects inviting the reviewed employee as their own rater', async () => {
      const { service } = harness();

      await expect(
        service.invite(hrActor, 20, {
          invitations: [
            {
              rater_employee_id: 11,
              relationship_type: PerformanceFeedback360RelationshipEnum.PEER,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate raters within the same invite payload', async () => {
      const { service } = harness();

      await expect(
        service.invite(hrActor, 20, {
          invitations: [
            {
              rater_employee_id: 30,
              relationship_type: PerformanceFeedback360RelationshipEnum.PEER,
            },
            {
              rater_employee_id: 30,
              relationship_type:
                PerformanceFeedback360RelationshipEnum.STAKEHOLDER,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when the performance review does not exist', async () => {
      const { service, reviewRepository } = harness();
      jest.spyOn(reviewRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.invite(hrActor, 999, {
          invitations: [
            {
              rater_employee_id: 30,
              relationship_type: PerformanceFeedback360RelationshipEnum.PEER,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('skips raters that already have a request for the review', async () => {
      const { service, feedbackRepository } = harness();
      jest
        .spyOn(feedbackRepository, 'find')
        .mockResolvedValue([
          { raterEmployeeId: 30 } as PerformanceFeedback360Request,
        ]);
      const saveSpy = jest.spyOn(feedbackRepository, 'save');

      await service.invite(hrActor, 20, {
        invitations: [
          {
            rater_employee_id: 30,
            relationship_type: PerformanceFeedback360RelationshipEnum.PEER,
          },
          {
            rater_employee_id: 31,
            relationship_type:
              PerformanceFeedback360RelationshipEnum.SUBORDINATE,
          },
        ],
      });

      expect(saveSpy).toHaveBeenCalledWith([
        expect.objectContaining({ raterEmployeeId: 31 }),
      ]);
    });
  });

  describe('submit / decline', () => {
    it('rejects submitting on behalf of another employee', async () => {
      const { service, feedbackRepository } = harness();
      jest.spyOn(feedbackRepository, 'findOne').mockResolvedValue({
        id: 5,
        raterEmployeeId: 999,
        status: PerformanceFeedback360StatusEnum.PENDING,
      } as PerformanceFeedback360Request);

      await expect(
        service.submit(raterActor, 5, {
          ratings: { communication: 4 },
          overall_score: 80,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects resubmitting an already-resolved request', async () => {
      const { service, feedbackRepository } = harness();
      jest.spyOn(feedbackRepository, 'findOne').mockResolvedValue({
        id: 5,
        raterEmployeeId: 22,
        status: PerformanceFeedback360StatusEnum.SUBMITTED,
      } as PerformanceFeedback360Request);

      await expect(
        service.submit(raterActor, 5, {
          ratings: { communication: 4 },
          overall_score: 80,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('records the submission with a normalized overall score', async () => {
      const { service, feedbackRepository } = harness();
      jest.spyOn(feedbackRepository, 'findOne').mockResolvedValue({
        id: 5,
        subjectEmployeeId: 11,
        performanceReviewId: 20,
        raterEmployeeId: 22,
        relationshipType: PerformanceFeedback360RelationshipEnum.PEER,
        status: PerformanceFeedback360StatusEnum.PENDING,
      } as PerformanceFeedback360Request);

      const saved = await service.submit(raterActor, 5, {
        ratings: { communication: 4, teamwork: 5 },
        overall_score: 83.456,
        strengths: '  Great collaborator  ',
      });

      expect(saved.status).toBe(PerformanceFeedback360StatusEnum.SUBMITTED);
      expect(saved.overallScore).toBe('83.46');
      expect(saved.strengths).toBe('Great collaborator');
      expect(saved.submittedAt).toBeInstanceOf(Date);
    });

    it('declines a pending request with a reason', async () => {
      const { service, feedbackRepository } = harness();
      jest.spyOn(feedbackRepository, 'findOne').mockResolvedValue({
        id: 5,
        subjectEmployeeId: 11,
        performanceReviewId: 20,
        raterEmployeeId: 22,
        status: PerformanceFeedback360StatusEnum.PENDING,
      } as PerformanceFeedback360Request);

      const saved = await service.decline(raterActor, 5, {
        reason: 'No direct working relationship',
      });

      expect(saved.status).toBe(PerformanceFeedback360StatusEnum.DECLINED);
      expect(saved.declineReason).toBe('No direct working relationship');
    });
  });

  describe('getSummaryForReview', () => {
    it('aggregates average scores per relationship type from submitted responses only', async () => {
      const { service, feedbackRepository } = harness();
      jest.spyOn(feedbackRepository, 'find').mockResolvedValue([
        {
          relationshipType: PerformanceFeedback360RelationshipEnum.PEER,
          status: PerformanceFeedback360StatusEnum.SUBMITTED,
          overallScore: '80.00',
        },
        {
          relationshipType: PerformanceFeedback360RelationshipEnum.PEER,
          status: PerformanceFeedback360StatusEnum.SUBMITTED,
          overallScore: '90.00',
        },
        {
          relationshipType: PerformanceFeedback360RelationshipEnum.SUBORDINATE,
          status: PerformanceFeedback360StatusEnum.PENDING,
          overallScore: null,
        },
      ] as PerformanceFeedback360Request[]);

      const summary = await service.getSummaryForReview(hrActor, 20);

      expect(summary.total_invited).toBe(3);
      expect(summary.total_submitted).toBe(2);
      expect(summary.total_pending).toBe(1);
      expect(summary.overall_average_score).toBe('85.00');
      expect(summary.by_relationship.PEER).toEqual({
        count: 2,
        average_score: '85.00',
      });
      expect(summary.by_relationship.SUBORDINATE).toEqual({
        count: 0,
        average_score: null,
      });
    });
  });
});
