import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { AttendanceDailySummary } from '../../attendance/processing/entities/attendance-daily-summary.entity';
import { DailyActivityEntry } from '../../work-activities/entities/daily-activity.entities';
import { HrAccessService } from '../../shared/hr-access.service';
import { KpiAchievement } from '../entities/kpi-achievement.entity';
import { PerformanceFeedback360Request } from '../entities/performance-feedback-360-request.entity';
import { PerformancePeriodAssignment } from '../entities/performance-period-assignment.entity';
import { PerformancePeriod } from '../entities/performance-period.entity';
import { PerformanceReview } from '../entities/performance-review.entity';
import { PerformanceScorecardConfig } from '../entities/performance-scorecard-config.entity';
import { PerformanceFeedback360StatusEnum } from '../enums/performance-feedback-360-status.enum';
import { PerformanceScorecardComponentTypeEnum } from '../enums/performance-scorecard-component-type.enum';
import { PerformanceAuditService } from './performance-audit.service';
import { PerformanceScorecardService } from './performance-scorecard.service';

const actor: AuthenticatedUser = {
  id: 5,
  email: 'hr@example.com',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 1,
  companyMembershipId: 15,
  employeeId: 11,
  roles: [],
  permissions: [],
};

function repository<T>(overrides: Partial<Repository<T>> = {}) {
  return {
    create: jest.fn((value: T) => value),
    save: jest.fn(async (value: T) => value),
    update: jest.fn().mockResolvedValue(undefined),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    createQueryBuilder: jest.fn(),
    ...overrides,
  } as unknown as Repository<T>;
}

function harness() {
  const hrAccess = {
    ensureActorCompanyId: jest.fn().mockReturnValue(1),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const scorecardRepository = repository<PerformanceScorecardConfig>();
  const periodRepository = repository<PerformancePeriod>({
    findOne: jest.fn().mockResolvedValue({
      id: 3,
      companyId: 1,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    } as PerformancePeriod),
  });
  const feedback360Repository = repository<PerformanceFeedback360Request>();
  const service = new PerformanceScorecardService(
    hrAccess as unknown as HrAccessService,
    audit as unknown as PerformanceAuditService,
    scorecardRepository,
    periodRepository,
    repository<DailyActivityEntry>(),
    repository<AttendanceDailySummary>(),
    feedback360Repository,
  );

  return { service, scorecardRepository, feedback360Repository };
}

const assignment = {
  id: 10,
  companyId: 1,
  employeeId: 11,
  performancePeriodId: 3,
} as PerformancePeriodAssignment;

const review = {
  id: 20,
  companyId: 1,
  employeeId: 11,
  competencyScore: '90.0000',
  managerReview: { manager_score: 80 },
  employeeSelfReview: null,
  hrReview: null,
} as PerformanceReview;

const achievements = [
  { id: 1, weightedScore: '40.0000' },
  { id: 2, weightedScore: '30.0000' },
] as KpiAchievement[];

describe('PerformanceScorecardService', () => {
  it('rejects scorecard configurations whose enabled weights do not total 100', async () => {
    const { service } = harness();

    await expect(
      service.create(actor, {
        code: 'BAD',
        name: 'Bad scorecard',
        components: [
          {
            code: 'KPI',
            label: 'KPI',
            type: PerformanceScorecardComponentTypeEnum.KPI,
            weight: 60,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('calculates transparent weighted final scores from the active scorecard', async () => {
    const { service, scorecardRepository } = harness();
    jest.spyOn(scorecardRepository, 'find').mockResolvedValue([
      {
        id: 7,
        companyId: 1,
        code: 'STANDARD',
        name: 'Standard scorecard',
        status: 'ACTIVE',
        isDefault: true,
        effectiveFrom: null,
        effectiveTo: null,
        components: [
          {
            code: 'KPI',
            label: 'KPI',
            type: PerformanceScorecardComponentTypeEnum.KPI,
            weight: 50,
            enabled: true,
            required: true,
          },
          {
            code: 'COMPETENCY',
            label: 'Competency',
            type: PerformanceScorecardComponentTypeEnum.COMPETENCY,
            weight: 20,
            enabled: true,
          },
          {
            code: 'MANAGER',
            label: 'Manager',
            type: PerformanceScorecardComponentTypeEnum.MANAGER_ASSESSMENT,
            weight: 30,
            enabled: true,
          },
        ],
      } as PerformanceScorecardConfig,
    ]);

    const result = await service.calculateReviewScore({
      companyId: 1,
      assignment,
      review,
      achievements,
      adjustmentScore: 0,
    });

    expect(result.finalScore).toBe('77.0000');
    expect(result.snapshot.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'KPI',
          rawScore: '70.0000',
          weightedScore: '35.0000',
        }),
        expect.objectContaining({
          code: 'COMPETENCY',
          rawScore: '90.0000',
          weightedScore: '18.0000',
        }),
        expect.objectContaining({
          code: 'MANAGER',
          rawScore: '80.0000',
          weightedScore: '24.0000',
        }),
      ]),
    );
  });

  it('preserves the legacy final-score behavior when no scorecard is active', async () => {
    const { service } = harness();

    const result = await service.calculateReviewScore({
      companyId: 1,
      assignment,
      review,
      achievements,
      adjustmentScore: 5,
    });

    expect(result.kpiScore).toBe('70.0000');
    expect(result.competencyScore).toBe('90.0000');
    expect(result.adjustmentScore).toBe('5.0000');
    expect(result.finalScore).toBe('165.0000');
    expect(result.snapshot.scorecard_code).toBe('LEGACY_FIXED_KPI');
  });

  it('uses the average of submitted 360 feedback for the peer feedback component', async () => {
    const { service, scorecardRepository, feedback360Repository } = harness();
    jest.spyOn(scorecardRepository, 'find').mockResolvedValue([
      {
        id: 8,
        companyId: 1,
        code: 'WITH_PEER',
        name: 'With peer feedback',
        status: 'ACTIVE',
        isDefault: true,
        effectiveFrom: null,
        effectiveTo: null,
        components: [
          {
            code: 'KPI',
            label: 'KPI',
            type: PerformanceScorecardComponentTypeEnum.KPI,
            weight: 70,
            enabled: true,
            required: true,
          },
          {
            code: 'PEER',
            label: 'Peer feedback',
            type: PerformanceScorecardComponentTypeEnum.PEER_FEEDBACK,
            weight: 30,
            enabled: true,
          },
        ],
      } as PerformanceScorecardConfig,
    ]);
    jest.spyOn(feedback360Repository, 'find').mockResolvedValue([
      {
        status: PerformanceFeedback360StatusEnum.SUBMITTED,
        overallScore: '80.00',
      },
      {
        status: PerformanceFeedback360StatusEnum.SUBMITTED,
        overallScore: '90.00',
      },
    ] as PerformanceFeedback360Request[]);

    const result = await service.calculateReviewScore({
      companyId: 1,
      assignment,
      review,
      achievements,
      adjustmentScore: 0,
    });

    expect(result.snapshot.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PEER',
          rawScore: '85.0000',
          weightedScore: '25.5000',
        }),
      ]),
    );
  });

  it('falls back to the manual HR-review value when no 360 feedback has been submitted', async () => {
    const { service, scorecardRepository, feedback360Repository } = harness();
    jest.spyOn(scorecardRepository, 'find').mockResolvedValue([
      {
        id: 9,
        companyId: 1,
        code: 'WITH_PEER_FALLBACK',
        name: 'With peer feedback fallback',
        status: 'ACTIVE',
        isDefault: true,
        effectiveFrom: null,
        effectiveTo: null,
        components: [
          {
            code: 'KPI',
            label: 'KPI',
            type: PerformanceScorecardComponentTypeEnum.KPI,
            weight: 70,
            enabled: true,
            required: true,
          },
          {
            code: 'PEER',
            label: 'Peer feedback',
            type: PerformanceScorecardComponentTypeEnum.PEER_FEEDBACK,
            weight: 30,
            enabled: true,
          },
        ],
      } as PerformanceScorecardConfig,
    ]);
    jest.spyOn(feedback360Repository, 'find').mockResolvedValue([]);

    const result = await service.calculateReviewScore({
      companyId: 1,
      assignment,
      review: { ...review, hrReview: { peer_score: 65 } } as PerformanceReview,
      achievements,
      adjustmentScore: 0,
    });

    expect(result.snapshot.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PEER',
          rawScore: '65.0000',
        }),
      ]),
    );
  });
});
