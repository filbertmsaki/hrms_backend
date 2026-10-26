import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DailyActivityEntry,
  DailyActivityReport,
} from '../entities/daily-activity.entities';
import {
  FieldFollowUp,
  FieldOpportunity,
  FieldVisit,
  FieldVisitCommercialPolicy,
} from '../entities/field-visit.entities';
import {
  DailyActivityReportStatusEnum,
  DailyActivityStatusEnum,
  FieldFollowUpStatusEnum,
  FieldOpportunityTypeEnum,
  FieldVisitStatusEnum,
  FieldVisitTypeEnum,
} from '../enums/work-activity.enums';

type SupportedMetricCode =
  | 'ACTIVITY_SUBMISSION_DISCIPLINE'
  | 'ACTIVITY_COMPLETION_RATE'
  | 'ACTIVITY_PLAN_VS_COMPLETION'
  | 'ACTIVITY_MANAGER_APPROVAL_RATE'
  | 'ACTIVITY_ON_TIME_SUBMISSION_RATE'
  | 'FIELD_VISITS_PLANNED'
  | 'FIELD_VISITS_COMPLETED'
  | 'FIELD_VISIT_COMPLETION_RATE'
  | 'CUSTOMER_VISITS_COMPLETED'
  | 'BROKER_VISITS_COMPLETED'
  | 'UNPLANNED_VISIT_RATE'
  | 'VISIT_MANAGER_APPROVAL_RATE'
  | 'LEADS_GENERATED'
  | 'QUOTATIONS_REPORTED'
  | 'BUSINESS_REPORTED_CLOSED'
  | 'POTENTIAL_VALUE_REPORTED'
  | 'ACTUAL_VALUE_VALIDATED'
  | 'RENEWAL_FOLLOWUPS_COMPLETED'
  | 'COLLECTION_FOLLOWUPS_COMPLETED'
  | 'FOLLOWUP_COMPLETION_RATE';

@Injectable()
export class WorkActivityKpiProviderService {
  constructor(
    @InjectRepository(DailyActivityReport)
    private readonly reportRepository: Repository<DailyActivityReport>,
    @InjectRepository(DailyActivityEntry)
    private readonly entryRepository: Repository<DailyActivityEntry>,
    @InjectRepository(FieldVisit)
    private readonly visitRepository: Repository<FieldVisit>,
    @InjectRepository(FieldOpportunity)
    private readonly opportunityRepository: Repository<FieldOpportunity>,
    @InjectRepository(FieldFollowUp)
    private readonly followUpRepository: Repository<FieldFollowUp>,
    @InjectRepository(FieldVisitCommercialPolicy)
    private readonly commercialPolicyRepository: Repository<FieldVisitCommercialPolicy>,
  ) {}

  private async getDefaultCurrency(companyId: number) {
    const policy = await this.commercialPolicyRepository.findOne({
      where: { companyId },
      select: ['defaultCurrency'],
    });
    return policy?.defaultCurrency?.toUpperCase() ?? 'TZS';
  }

  async getMetric(
    companyId: number,
    employeeId: number,
    dateFrom: string,
    dateTo: string,
    metricCode: SupportedMetricCode,
  ): Promise<number> {
    switch (metricCode) {
      case 'ACTIVITY_SUBMISSION_DISCIPLINE': {
        return this.reportRepository
          .createQueryBuilder('report')
          .where('report.companyId = :companyId', { companyId })
          .andWhere('report.employeeId = :employeeId', { employeeId })
          .andWhere('report.activityDate >= :dateFrom', { dateFrom })
          .andWhere('report.activityDate <= :dateTo', { dateTo })
          .andWhere('report.status = :status', {
            status: DailyActivityReportStatusEnum.APPROVED,
          })
          .getCount();
      }
      case 'ACTIVITY_COMPLETION_RATE':
      case 'ACTIVITY_PLAN_VS_COMPLETION': {
        const entries = await this.entryRepository
          .createQueryBuilder('entry')
          .innerJoin(
            DailyActivityReport,
            'report',
            'report.id = entry.dailyActivityReportId',
          )
          .where('entry.companyId = :companyId', { companyId })
          .andWhere('report.companyId = :companyId', { companyId })
          .andWhere('report.employeeId = :employeeId', { employeeId })
          .andWhere('report.activityDate >= :dateFrom', { dateFrom })
          .andWhere('report.activityDate <= :dateTo', { dateTo })
          .andWhere('report.status = :status', {
            status: DailyActivityReportStatusEnum.APPROVED,
          })
          .getMany();

        if (!entries.length) {
          return 0;
        }
        const completed = entries.filter(
          (entry) => entry.status === DailyActivityStatusEnum.COMPLETED,
        ).length;
        return Number(((completed / entries.length) * 100).toFixed(4));
      }
      case 'ACTIVITY_MANAGER_APPROVAL_RATE': {
        const submitted = await this.reportRepository
          .createQueryBuilder('report')
          .where('report.companyId = :companyId', { companyId })
          .andWhere('report.employeeId = :employeeId', { employeeId })
          .andWhere('report.activityDate >= :dateFrom', { dateFrom })
          .andWhere('report.activityDate <= :dateTo', { dateTo })
          .andWhere('report.submittedAt IS NOT NULL')
          .getCount();
        if (submitted === 0) return 0;
        const approvedWithinRange = await this.reportRepository
          .createQueryBuilder('report')
          .where('report.companyId = :companyId', { companyId })
          .andWhere('report.employeeId = :employeeId', { employeeId })
          .andWhere('report.activityDate >= :dateFrom', { dateFrom })
          .andWhere('report.activityDate <= :dateTo', { dateTo })
          .andWhere('report.status = :status', {
            status: DailyActivityReportStatusEnum.APPROVED,
          })
          .getCount();
        return Number(((approvedWithinRange / submitted) * 100).toFixed(4));
      }
      case 'ACTIVITY_ON_TIME_SUBMISSION_RATE': {
        const approvedReports = await this.reportRepository
          .createQueryBuilder('report')
          .where('report.companyId = :companyId', { companyId })
          .andWhere('report.employeeId = :employeeId', { employeeId })
          .andWhere('report.activityDate >= :dateFrom', { dateFrom })
          .andWhere('report.activityDate <= :dateTo', { dateTo })
          .andWhere('report.status = :status', {
            status: DailyActivityReportStatusEnum.APPROVED,
          })
          .getMany();
        if (!approvedReports.length) return 0;
        const onTime = approvedReports.filter(
          (report) => !report.submissionIsLate,
        ).length;
        return Number(((onTime / approvedReports.length) * 100).toFixed(4));
      }
      case 'FIELD_VISITS_PLANNED': {
        return this.visitRepository
          .createQueryBuilder('visit')
          .where('visit.companyId = :companyId', { companyId })
          .andWhere('visit.employeeId = :employeeId', { employeeId })
          .andWhere('visit.visitDate >= :dateFrom', { dateFrom })
          .andWhere('visit.visitDate <= :dateTo', { dateTo })
          .andWhere('visit.isUnplanned = false')
          .andWhere('visit.status != :cancelledStatus', {
            cancelledStatus: FieldVisitStatusEnum.CANCELLED,
          })
          .getCount();
      }
      case 'FIELD_VISITS_COMPLETED': {
        return this.visitRepository
          .createQueryBuilder('visit')
          .where('visit.companyId = :companyId', { companyId })
          .andWhere('visit.employeeId = :employeeId', { employeeId })
          .andWhere('visit.visitDate >= :dateFrom', { dateFrom })
          .andWhere('visit.visitDate <= :dateTo', { dateTo })
          .andWhere('visit.status = :status', {
            status: FieldVisitStatusEnum.REVIEWED,
          })
          .andWhere('visit.managerReviewStatus = :reviewStatus', {
            reviewStatus: 'APPROVED',
          })
          .andWhere('visit.isUnplanned = false')
          .getCount();
      }
      case 'FIELD_VISIT_COMPLETION_RATE':
      case 'VISIT_MANAGER_APPROVAL_RATE': {
        const planned = await this.getMetric(
          companyId,
          employeeId,
          dateFrom,
          dateTo,
          'FIELD_VISITS_PLANNED',
        );
        if (planned === 0) return 0;
        const completed = await this.getMetric(
          companyId,
          employeeId,
          dateFrom,
          dateTo,
          'FIELD_VISITS_COMPLETED',
        );
        return Number(((completed / planned) * 100).toFixed(4));
      }
      case 'CUSTOMER_VISITS_COMPLETED':
      case 'BROKER_VISITS_COMPLETED': {
        const visitType =
          metricCode === 'CUSTOMER_VISITS_COMPLETED'
            ? FieldVisitTypeEnum.CUSTOMER_VISIT
            : FieldVisitTypeEnum.BROKER_VISIT;
        return this.visitRepository
          .createQueryBuilder('visit')
          .where('visit.companyId = :companyId', { companyId })
          .andWhere('visit.employeeId = :employeeId', { employeeId })
          .andWhere('visit.visitDate >= :dateFrom', { dateFrom })
          .andWhere('visit.visitDate <= :dateTo', { dateTo })
          .andWhere('visit.visitType = :visitType', { visitType })
          .andWhere('visit.status = :status', {
            status: FieldVisitStatusEnum.REVIEWED,
          })
          .andWhere('visit.managerReviewStatus = :reviewStatus', {
            reviewStatus: 'APPROVED',
          })
          .getCount();
      }
      case 'UNPLANNED_VISIT_RATE': {
        const planned = await this.getMetric(
          companyId,
          employeeId,
          dateFrom,
          dateTo,
          'FIELD_VISITS_PLANNED',
        );
        if (planned === 0) return 0;
        const unplanned = await this.visitRepository
          .createQueryBuilder('visit')
          .where('visit.companyId = :companyId', { companyId })
          .andWhere('visit.employeeId = :employeeId', { employeeId })
          .andWhere('visit.visitDate >= :dateFrom', { dateFrom })
          .andWhere('visit.visitDate <= :dateTo', { dateTo })
          .andWhere('visit.isUnplanned = true')
          .andWhere('visit.status = :status', {
            status: FieldVisitStatusEnum.REVIEWED,
          })
          .andWhere('visit.managerReviewStatus = :reviewStatus', {
            reviewStatus: 'APPROVED',
          })
          .getCount();
        return Number(((unplanned / planned) * 100).toFixed(4));
      }
      case 'LEADS_GENERATED':
      case 'QUOTATIONS_REPORTED':
      case 'BUSINESS_REPORTED_CLOSED': {
        const opportunityType =
          metricCode === 'LEADS_GENERATED'
            ? FieldOpportunityTypeEnum.LEAD
            : metricCode === 'QUOTATIONS_REPORTED'
              ? FieldOpportunityTypeEnum.QUOTATION
              : undefined;
        const query = this.opportunityRepository
          .createQueryBuilder('opportunity')
          .innerJoin(FieldVisit, 'visit', 'visit.id = opportunity.fieldVisitId')
          .where('opportunity.companyId = :companyId', { companyId })
          .andWhere('visit.companyId = :companyId', { companyId })
          .andWhere('opportunity.employeeId = :employeeId', { employeeId })
          .andWhere('visit.visitDate >= :dateFrom', { dateFrom })
          .andWhere('visit.visitDate <= :dateTo', { dateTo })
          .andWhere('visit.status = :status', {
            status: FieldVisitStatusEnum.REVIEWED,
          })
          .andWhere('visit.managerReviewStatus = :reviewStatus', {
            reviewStatus: 'APPROVED',
          });
        if (opportunityType) {
          query.andWhere('opportunity.opportunityType = :opportunityType', {
            opportunityType,
          });
        } else {
          query.andWhere('opportunity.status = :wonStatus', {
            wonStatus: 'WON',
          });
        }
        return query.getCount();
      }
      case 'POTENTIAL_VALUE_REPORTED': {
        const defaultCurrency = await this.getDefaultCurrency(companyId);
        const row = await this.opportunityRepository
          .createQueryBuilder('opportunity')
          .innerJoin(FieldVisit, 'visit', 'visit.id = opportunity.fieldVisitId')
          .select('COALESCE(SUM(opportunity.potentialValue), 0)', 'total')
          .where('opportunity.companyId = :companyId', { companyId })
          .andWhere('visit.companyId = :companyId', { companyId })
          .andWhere('opportunity.employeeId = :employeeId', { employeeId })
          .andWhere('visit.visitDate >= :dateFrom', { dateFrom })
          .andWhere('visit.visitDate <= :dateTo', { dateTo })
          .andWhere('visit.status = :status', {
            status: FieldVisitStatusEnum.REVIEWED,
          })
          .andWhere('visit.managerReviewStatus = :reviewStatus', {
            reviewStatus: 'APPROVED',
          })
          .andWhere(
            "UPPER(COALESCE(NULLIF(opportunity.currency, ''), :defaultCurrency)) = :defaultCurrency",
            { defaultCurrency },
          )
          .getRawOne<{ total: string }>();
        return Number(row?.total ?? 0);
      }
      case 'ACTUAL_VALUE_VALIDATED': {
        const defaultCurrency = await this.getDefaultCurrency(companyId);
        const row = await this.opportunityRepository
          .createQueryBuilder('opportunity')
          .innerJoin(FieldVisit, 'visit', 'visit.id = opportunity.fieldVisitId')
          .select('COALESCE(SUM(opportunity.actualValue), 0)', 'total')
          .where('opportunity.companyId = :companyId', { companyId })
          .andWhere('visit.companyId = :companyId', { companyId })
          .andWhere('opportunity.employeeId = :employeeId', { employeeId })
          .andWhere('visit.visitDate >= :dateFrom', { dateFrom })
          .andWhere('visit.visitDate <= :dateTo', { dateTo })
          .andWhere('visit.status = :status', {
            status: FieldVisitStatusEnum.REVIEWED,
          })
          .andWhere('visit.managerReviewStatus = :reviewStatus', {
            reviewStatus: 'APPROVED',
          })
          .andWhere('opportunity.validatedByManager = true')
          .andWhere(
            "UPPER(COALESCE(NULLIF(opportunity.currency, ''), :defaultCurrency)) = :defaultCurrency",
            { defaultCurrency },
          )
          .getRawOne<{ total: string }>();
        return Number(row?.total ?? 0);
      }
      case 'RENEWAL_FOLLOWUPS_COMPLETED':
      case 'COLLECTION_FOLLOWUPS_COMPLETED': {
        const visitType =
          metricCode === 'RENEWAL_FOLLOWUPS_COMPLETED'
            ? FieldVisitTypeEnum.RENEWAL_FOLLOW_UP
            : FieldVisitTypeEnum.COLLECTION_FOLLOW_UP;
        return this.followUpRepository
          .createQueryBuilder('followUp')
          .innerJoin(FieldVisit, 'visit', 'visit.id = followUp.fieldVisitId')
          .where('followUp.companyId = :companyId', { companyId })
          .andWhere('visit.companyId = :companyId', { companyId })
          .andWhere('followUp.assignedToEmployeeId = :employeeId', {
            employeeId,
          })
          .andWhere('visit.visitDate >= :dateFrom', { dateFrom })
          .andWhere('visit.visitDate <= :dateTo', { dateTo })
          .andWhere('visit.visitType = :visitType', { visitType })
          .andWhere('followUp.status = :status', {
            status: FieldFollowUpStatusEnum.COMPLETED,
          })
          .getCount();
      }
      case 'FOLLOWUP_COMPLETION_RATE': {
        const total = await this.followUpRepository
          .createQueryBuilder('followUp')
          .where('followUp.companyId = :companyId', { companyId })
          .andWhere('followUp.assignedToEmployeeId = :employeeId', {
            employeeId,
          })
          .andWhere('followUp.dueDate >= :dateFrom', { dateFrom })
          .andWhere('followUp.dueDate <= :dateTo', { dateTo })
          .getCount();
        if (total === 0) return 0;
        const completed = await this.followUpRepository
          .createQueryBuilder('followUp')
          .where('followUp.companyId = :companyId', { companyId })
          .andWhere('followUp.assignedToEmployeeId = :employeeId', {
            employeeId,
          })
          .andWhere('followUp.dueDate >= :dateFrom', { dateFrom })
          .andWhere('followUp.dueDate <= :dateTo', { dateTo })
          .andWhere('followUp.status = :status', {
            status: FieldFollowUpStatusEnum.COMPLETED,
          })
          .getCount();
        return Number(((completed / total) * 100).toFixed(4));
      }
      default:
        return 0;
    }
  }
}
