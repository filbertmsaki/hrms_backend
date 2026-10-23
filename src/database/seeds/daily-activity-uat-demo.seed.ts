import { DataSource } from 'typeorm';
import { createHash } from 'crypto';
import { Employee } from '../../modules/hr/employees/entities/employee.entity';
import {
  ActivityCategory,
  ActivityPolicy,
} from '../../modules/hr/work-activities/entities/activity-config.entities';
import {
  DailyActivityEntry,
  DailyActivityReport,
} from '../../modules/hr/work-activities/entities/daily-activity.entities';
import {
  FieldVisit,
  FieldVisitLocationEvent,
} from '../../modules/hr/work-activities/entities/field-visit.entities';
import { WorkActivityAuditLog } from '../../modules/hr/work-activities/entities/analytics.entities';
import { LocationPrivacyNotice } from '../../modules/hr/location-privacy/entities/location-privacy.entities';
import {
  DailyActivityOriginEnum,
  DailyActivityEntryReviewStatusEnum,
  DailyActivityPriorityEnum,
  DailyActivityReportStatusEnum,
  DailyActivitySourceEnum,
  DailyActivityStatusEnum,
  FieldVisitStatusEnum,
  FieldVisitTypeEnum,
} from '../../modules/hr/work-activities/enums/work-activity.enums';

export type DailyActivityDemoSeedOptions = {
  companyId: number;
  employeeId: number;
  activityDate?: string;
};

const DEMO_KEY = 'HRMS_DAILY_ACTIVITY_UAT_DEMO_V1';
const CATEGORY_CODE = 'HRMS_UAT_DAILY_ACTIVITY';
const LOCATION_VISIT_PREFIX = 'FV-UAT-PRIVACY-';

function dateOffset(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Creates synthetic, clearly marked HRMS daily activity data for isolated UAT. */
export async function seedDailyActivityUatDemo(
  dataSource: DataSource,
  options: DailyActivityDemoSeedOptions,
) {
  const employeeRepository = dataSource.getRepository(Employee);
  const employee = await employeeRepository.findOne({
    where: { id: options.employeeId, company_id: options.companyId },
  });
  if (!employee) {
    throw new Error(
      `Employee ${options.employeeId} was not found in company ${options.companyId}.`,
    );
  }
  if (!employee.company_user_id) {
    throw new Error('The demo employee must have an active HRMS account.');
  }
  if (String(employee.employment_status).toUpperCase() !== 'ACTIVE') {
    throw new Error('The demo employee must have ACTIVE employment status.');
  }
  if (!employee.reports_to) {
    throw new Error('The demo employee must have an assigned manager.');
  }
  const manager = await employeeRepository.findOne({
    where: { id: employee.reports_to, company_id: options.companyId },
  });
  if (!manager?.company_user_id) {
    throw new Error('The assigned manager must have an active HRMS account.');
  }
  if (String(manager.employment_status).toUpperCase() !== 'ACTIVE') {
    throw new Error('The assigned manager must have ACTIVE employment status.');
  }
  if (!employee.primary_department_id) {
    throw new Error(
      'The demo employee must have a department to scope the sample policy.',
    );
  }

  const activityDate =
    options.activityDate ?? new Date().toISOString().slice(0, 10);
  const parsedDate = new Date(`${activityDate}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(activityDate) ||
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== activityDate
  ) {
    throw new Error('activityDate must use YYYY-MM-DD format.');
  }

  return dataSource.transaction(async (managerEntityManager) => {
    let locationPrivacyNoticeId: number | null = null;
    const privacyNotices = managerEntityManager.getRepository(
      LocationPrivacyNotice,
    );
    let privacyNotice = await privacyNotices.findOne({
      where: { companyId: options.companyId, status: 'ACTIVE' },
    });
    if (!privacyNotice) {
      const latestPrivacyNotice = await privacyNotices.findOne({
        where: { companyId: options.companyId },
        order: { version: 'DESC' },
      });
      privacyNotice = await privacyNotices.save(
        privacyNotices.create({
          companyId: options.companyId,
          version: (latestPrivacyNotice?.version ?? 0) + 1,
          title: 'UAT demo: location privacy notice',
          body: 'DEMO ONLY — NOT A COMPANY POLICY OR LEGAL APPROVAL. For this isolated UAT exercise, HRMS captures location only when an employee checks in or out for attendance or an approved field visit. Authorized HR and managers may view event locations for attendance validation. GPS data is retained according to the demo UAT configuration. This sample must be replaced after the company approves its real purpose, audience, access, retention, and map provider rules.',
          status: 'ACTIVE',
          requireAcknowledgement: true,
          approvalStatus: 'DEMO_APPROVED',
          isDemo: true,
          approvalReference: 'UAT-DEMO-ONLY',
          approvedByCompanyUserId: null,
          approvedAt: new Date(),
        }),
      );
    }
    locationPrivacyNoticeId = privacyNotice.id;
    const categories = managerEntityManager.getRepository(ActivityCategory);
    const policies = managerEntityManager.getRepository(ActivityPolicy);
    const reports = managerEntityManager.getRepository(DailyActivityReport);
    const entries = managerEntityManager.getRepository(DailyActivityEntry);
    const auditLogs = managerEntityManager.getRepository(WorkActivityAuditLog);
    const visits = managerEntityManager.getRepository(FieldVisit);
    const locationEvents = managerEntityManager.getRepository(
      FieldVisitLocationEvent,
    );

    let category = await categories.findOne({
      where: { companyId: options.companyId, code: CATEGORY_CODE },
    });
    if (!category) {
      category = await categories.save(
        categories.create({
          companyId: options.companyId,
          code: CATEGORY_CODE,
          name: 'UAT demo: completed client follow-up',
          description:
            'Synthetic internal HRMS acceptance record. No customer data.',
          departmentId: employee.primary_department_id,
          positionId: employee.primary_position_id,
          gradeId: employee.grade_id,
          requiresTime: true,
          requiresOutcome: true,
          requiresEvidence: false,
          requiresLocation: false,
          isFieldActivity: false,
          defaultKpiCode: null,
          displayOrder: 9990,
          status: 'ACTIVE',
        }),
      );
    }

    let policy = (
      await policies.find({
        where: { companyId: options.companyId, status: 'ACTIVE' },
      })
    ).find(
      (candidate) =>
        candidate.branchId === employee.primary_branch_id &&
        candidate.departmentId === employee.primary_department_id &&
        candidate.positionId === employee.primary_position_id &&
        candidate.gradeId === employee.grade_id &&
        candidate.employmentType === String(employee.employment_type) &&
        candidate.priority === 9990,
    );
    if (!policy) {
      policy = await policies.save(
        policies.create({
          companyId: options.companyId,
          branchId: employee.primary_branch_id,
          departmentId: employee.primary_department_id,
          positionId: employee.primary_position_id,
          gradeId: employee.grade_id,
          employmentType: String(employee.employment_type),
          dailySubmissionRequired: true,
          submissionCutoffTime: '20:00',
          submissionTimezone: 'Africa/Dar_es_Salaam',
          managerReviewRequired: true,
          managerReviewDueHours: 1,
          departmentHeadEscalationEnabled: false,
          departmentHeadEscalationHours: 2,
          minimumActivityCount: 1,
          minimumCompletedActivityCount: 1,
          fieldVisitPlanRequired: false,
          allowUnplannedVisits: true,
          requireVisitSelfie: false,
          requireDeviceBinding: true,
          maximumBackdateDays: 3,
          priority: 9990,
          effectiveFrom: dateOffset(activityDate, -2),
          effectiveTo: null,
          status: 'ACTIVE',
        }),
      );
    }

    const existingReport = await reports.findOne({
      where: {
        companyId: options.companyId,
        employeeId: employee.id,
        activityDate,
      },
    });
    if (existingReport) {
      if (existingReport.metadata?.demoKey !== DEMO_KEY) {
        throw new Error(
          `A non-demo report already exists for employee ${employee.id} on ${activityDate}; choose another demo date.`,
        );
      }
      const existingEntry = await entries.findOne({
        where: {
          companyId: options.companyId,
          dailyActivityReportId: existingReport.id,
          taskReference: DEMO_KEY,
        },
      });
      const existingVisit = await managerEntityManager
        .getRepository(FieldVisit)
        .findOne({
          where: {
            companyId: options.companyId,
            visitNo: `${LOCATION_VISIT_PREFIX}${options.companyId}-${employee.id}`,
          },
        });
      const existingLocationEvent = existingVisit
        ? await managerEntityManager
            .getRepository(FieldVisitLocationEvent)
            .findOne({
              where: {
                companyId: options.companyId,
                fieldVisitId: existingVisit.id,
                eventType: 'CHECK_IN',
              },
            })
        : null;
      return {
        companyId: options.companyId,
        employeeId: employee.id,
        managerEmployeeId: manager.id,
        activityDate,
        reportId: existingReport.id,
        reportStatus: existingReport.status,
        locationPrivacyNoticeId,
        locationPrivacyNoticeIsDemo: privacyNotice.isDemo,
        entryId: existingEntry?.id ?? null,
        categoryId: category.id,
        policyId: policy.id,
        fieldVisitId: existingVisit?.id ?? null,
        locationEventId: existingLocationEvent?.id ?? null,
        demoKey: DEMO_KEY,
        alreadySeeded: true,
      };
    }

    const employeeSnapshot = {
      employee_id: employee.id,
      employee_no: employee.employee_no,
      full_name: [employee.first_name, employee.middle_name, employee.last_name]
        .filter(Boolean)
        .join(' '),
      department_id: employee.primary_department_id,
      position_id: employee.primary_position_id,
      branch_id: employee.primary_branch_id,
    };
    const policySnapshot = {
      minimum_activity_count: 1,
      minimum_completed_activity_count: 1,
      manager_review_required: true,
      manager_review_due_hours: 1,
      department_head_escalation_enabled: false,
      department_head_escalation_hours: 2,
      submission_cutoff_time: '20:00',
      submission_timezone: 'Africa/Dar_es_Salaam',
      daily_submission_required: true,
      field_visit_plan_required: false,
      allow_unplanned_visits: true,
      require_visit_selfie: false,
      require_device_binding: true,
      maximum_backdate_days: 3,
      demo_data: true,
    };
    const report = await reports.save(
      reports.create({
        companyId: options.companyId,
        employeeId: employee.id,
        activityDate,
        status: DailyActivityReportStatusEnum.DRAFT,
        managerEmployeeId: manager.id,
        managerCompanyUserId: manager.company_user_id,
        employeeSnapshot,
        policySnapshot,
        attendanceSnapshot: null,
        overallRemarks: 'Synthetic HRMS UAT demo record.',
        employeeSummary: null,
        managerComments: null,
        managerRating: null,
        submittedAt: null,
        reviewedAt: null,
        reviewedByCompanyUserId: null,
        submissionIsLate: false,
        submissionDelayMinutes: 0,
        clientRequestId: null,
        source: DailyActivitySourceEnum.WEB,
        metadata: { demoKey: DEMO_KEY, demoData: true },
      }),
    );
    const entry = await entries.save(
      entries.create({
        companyId: options.companyId,
        dailyActivityReportId: report.id,
        activityCategoryId: category.id,
        kpiDefinitionId: null,
        employeeKpiId: null,
        projectReference: null,
        taskReference: DEMO_KEY,
        fieldPartyId: null,
        externalReferenceType: null,
        externalReferenceId: null,
        title: 'UAT demo: completed client follow-up',
        description:
          'Synthetic internal follow-up activity created to exercise employee submission and manager review.',
        expectedResult: 'Demonstrate a completed activity and review outcome.',
        dueDate: new Date(`${activityDate}T12:00:00.000Z`),
        completionDate: new Date(`${activityDate}T11:00:00.000Z`),
        plannedStartTime: new Date(`${activityDate}T09:00:00.000Z`),
        plannedEndTime: new Date(`${activityDate}T10:00:00.000Z`),
        actualStartTime: new Date(`${activityDate}T09:00:00.000Z`),
        actualEndTime: new Date(`${activityDate}T10:00:00.000Z`),
        status: DailyActivityStatusEnum.COMPLETED,
        origin: DailyActivityOriginEnum.SELF_CREATED,
        reviewStatus: DailyActivityEntryReviewStatusEnum.NOT_REQUIRED,
        reviewedAt: null,
        reviewedByCompanyUserId: null,
        outcome: 'Synthetic demo outcome recorded for UAT.',
        remarks: 'No real customer or employee performance data.',
        priority: DailyActivityPriorityEnum.MEDIUM,
        assignedByCompanyUserId: null,
        assignedByEmployeeId: null,
        assignedBySnapshot: null,
        checklist: [],
        deferReason: null,
        followUpDate: null,
        completionPercentage: '100',
        managerComment: null,
        managerValidated: false,
        linkedFieldVisitId: null,
        clientRequestId: null,
      }),
    );
    await auditLogs.save(
      auditLogs.create({
        companyId: options.companyId,
        action: 'UAT_DAILY_ACTIVITY_DEMO_SEEDED',
        actorCompanyUserId: null,
        employeeId: employee.id,
        entityType: 'DAILY_ACTIVITY_REPORT',
        entityId: String(report.id),
        beforeValues: null,
        afterValues: {
          demo_key: DEMO_KEY,
          report_id: report.id,
          entry_id: entry.id,
          status: report.status,
        },
        requestId: `uat-daily-activity-demo-${report.id}`,
        ipAddress: null,
        userAgent: null,
        reason: 'Synthetic UAT fixture inserted by the guarded demo seeder.',
      }),
    );

    const visitNo = `${LOCATION_VISIT_PREFIX}${options.companyId}-${employee.id}`;
    let visit = await visits.findOne({
      where: { companyId: options.companyId, visitNo },
    });
    if (
      visit &&
      visit.purpose !== 'Synthetic HRMS location privacy UAT fixture.'
    ) {
      throw new Error(
        `Visit number ${visitNo} is already used by a non-demo record; do not overwrite it.`,
      );
    }
    if (!visit) {
      visit = await visits.save(
        visits.create({
          companyId: options.companyId,
          employeeId: employee.id,
          visitPlanId: null,
          visitPlanItemId: null,
          businessTripId: null,
          fieldPartyId: null,
          visitNo,
          visitDate: activityDate,
          visitType: FieldVisitTypeEnum.OTHER,
          status: FieldVisitStatusEnum.MANAGER_REVIEW_PENDING,
          isUnplanned: true,
          unplannedReason: DEMO_KEY,
          purpose: 'Synthetic HRMS location privacy UAT fixture.',
          discussionNotes: null,
          outcome: 'Synthetic; no physical employee location was captured.',
          followUpRequired: false,
          nextFollowUpDate: null,
          checkInAt: new Date(`${activityDate}T09:00:00.000Z`),
          checkOutAt: null,
          durationMinutes: null,
          managerEmployeeId: manager.id,
          managerCompanyUserId: manager.company_user_id,
          managerReviewStatus: 'REQUIRED',
          managerComments: null,
          managerReviewedAt: null,
          linkedDailyActivityEntryId: entry.id,
          employeeSnapshot,
          partySnapshot: null,
          policySnapshot: {
            demoData: true,
            syntheticCoordinates: true,
            purpose: 'Test permission-gated location display and access audit.',
          },
          clientRequestId: null,
        }),
      );
    }
    let locationEvent = await locationEvents.findOne({
      where: {
        companyId: options.companyId,
        fieldVisitId: visit.id,
        eventType: 'CHECK_IN',
      },
    });
    if (!locationEvent) {
      const clientRequestId = `00000000-0000-4000-8000-${String(employee.id).padStart(12, '0')}`;
      const syntheticPayload = {
        demoKey: DEMO_KEY,
        syntheticCoordinates: { latitude: '0.0000000', longitude: '0.0000000' },
      };
      locationEvent = await locationEvents.save(
        locationEvents.create({
          companyId: options.companyId,
          fieldVisitId: visit.id,
          employeeId: employee.id,
          eventType: 'CHECK_IN',
          latitude: '0.0000000',
          longitude: '0.0000000',
          accuracyMeters: '99999.00',
          capturedAt: new Date(`${activityDate}T09:00:00.000Z`),
          receivedAt: new Date(),
          timezoneOffsetMinutes: 0,
          deviceIdentifier: `UAT-DEMO-${employee.id}`,
          deviceInfo: { demoKey: DEMO_KEY, synthetic: true },
          address: null,
          addressStatus: 'NOT_REQUESTED',
          distanceFromPlannedLocationMeters: null,
          locationValidationStatus: 'CAPTURED',
          locationValidationResult: {
            status: 'CAPTURED',
            synthetic: true,
            note: 'Coordinates are deliberately set to 0,0 and are not employee location data.',
          },
          isOfflineCapture: false,
          clientRequestId,
          selfieDocumentId: null,
          attendanceMobilePunchId: null,
          rawPayloadHash: createHash('sha256')
            .update(JSON.stringify(syntheticPayload))
            .digest('hex'),
          legalHold: false,
        }),
      );
    }

    return {
      companyId: options.companyId,
      employeeId: employee.id,
      managerEmployeeId: manager.id,
      activityDate,
      reportId: report.id,
      reportStatus: report.status,
      locationPrivacyNoticeId,
      locationPrivacyNoticeIsDemo: privacyNotice.isDemo,
      entryId: entry.id,
      categoryId: category.id,
      policyId: policy.id,
      fieldVisitId: visit.id,
      locationEventId: locationEvent.id,
      demoKey: DEMO_KEY,
      alreadySeeded: false,
    };
  });
}
