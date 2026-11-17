import { DataSource } from 'typeorm';
import { Company } from '../../modules/companies/entities/company.entity';
import { EmployeeNumberSequence } from '../../modules/hr/employees/entities/employee-number-sequence.entity';
import { ActivityCategory } from '../../modules/hr/work-activities/entities/activity-config.entities';
import { STANDARD_ACTIVITY_CATEGORIES } from '../../modules/hr/work-activities/constants/activity-category-catalog';
import { Permission } from '../../modules/permissions/entities/permission.entity';
import { ReportDefinition } from '../../modules/scheduled-reporting/entities/report-definition.entity';
import { REGISTERED_REPORT_DEFINITIONS } from '../../modules/scheduled-reporting/services/report-registry.service';
import { PERMISSION_SEEDS } from './001-permissions.seed';
import { resolveUnifiedSeedModules, UnifiedSeedOptions } from './unified-seed';
import { LeaveType } from '../../modules/hr/leave/entities/leave-type.entity';
import { LeaveRecordStatusEnum } from '../../modules/hr/leave/enums/leave-record-status.enum';
import {
  PayrollCalendar,
  PayrollComponent,
  SalaryStructure,
} from '../../modules/hr/payroll/entities/payroll-configuration.entities';
import { SalaryStructureStatusEnum } from '../../modules/hr/payroll/payroll.enums';
import { LeavePolicy } from '../../modules/hr/leave/entities/leave-policy.entity';
import { LeaveApprovalWorkflow } from '../../modules/hr/leave/entities/leave-approval-workflow.entity';
import { isPolicyEffectiveOn } from '../../modules/hr/leave/utils/leave-policy-version.util';
import { Timetable } from '../../modules/hr/attendance/timetable/timetables/entities/timetable.entity';
import { TimetableStatusEnum } from '../../modules/hr/attendance/timetable/timetables/enums/timetable-status.enum';
import { OnboardingWorkflow } from '../../modules/hr/onboarding/entities/onboarding-workflow.entity';
import { OnboardingRecordStatusEnum } from '../../modules/hr/onboarding/enums/onboarding-record-status.enum';
import { OffboardingWorkflow } from '../../modules/hr/offboarding/entities/offboarding-workflow.entity';
import { OffboardingRecordStatusEnum } from '../../modules/hr/offboarding/enums/offboarding-record-status.enum';
import { NotificationChannelGlobalSetting } from '../../modules/notifications/entities/notification-channel-global-setting.entity';
import { CHANNEL_SETTING_DEFAULTS } from '../../modules/notifications/notification-channel-management.service';
import { AttendancePolicy } from '../../modules/hr/attendance/policies/entities/attendance-policy.entity';
import { ProbationPolicy } from '../../modules/hr/probation/entities/probation-policy.entity';

/** Read-only presence checks, not a certification of policy or access correctness. */
export async function validateUnifiedSeed(
  source: DataSource,
  options: UnifiedSeedOptions,
): Promise<string[]> {
  const modules = resolveUnifiedSeedModules({
    ...options,
    proposedAttendance: true,
    probationEffectiveFrom: options.probationEffectiveFrom ?? '2000-01-01',
    employeeNumber: options.employeeNumber ?? {
      prefix: '',
      padding: 3,
      nextNumber: 1,
    },
  });
  const issues: string[] = [];
  if (
    options.companyId !== undefined &&
    !(await source.getRepository(Company).existsBy({ id: options.companyId }))
  )
    throw new Error(`Company ${options.companyId} does not exist.`);
  if (modules.includes('authorization')) {
    const found = new Set(
      (await source.getRepository(Permission).find({ select: ['name'] })).map(
        (x) => x.name,
      ),
    );
    const missing = [...new Set(PERMISSION_SEEDS.map((x) => x.name))].filter(
      (name) => !found.has(name),
    );
    if (missing.length)
      issues.push(`Missing permission definitions: ${missing.join(', ')}`);
    issues.push(
      'REVIEW: role assignments and permission scopes require independent validation.',
    );
  }
  if (
    modules.includes('employees') &&
    !(await source
      .getRepository(EmployeeNumberSequence)
      .existsBy({ company_id: options.companyId! }))
  )
    issues.push('Missing employee numbering configuration.');
  if (modules.includes('reports')) {
    const found = new Set(
      (
        await source
          .getRepository(ReportDefinition)
          .find({ select: ['reportCode'] })
      ).map((x) => x.reportCode),
    );
    const missing = REGISTERED_REPORT_DEFINITIONS.map(
      (x) => x.reportCode,
    ).filter((code) => !found.has(code));
    if (missing.length)
      issues.push(`Missing report definitions: ${missing.join(', ')}`);
  }
  if (modules.includes('activities')) {
    const found = new Set(
      (
        await source
          .getRepository(ActivityCategory)
          .find({ where: { companyId: options.companyId! }, select: ['code'] })
      ).map((x) => x.code.toUpperCase()),
    );
    const missing = STANDARD_ACTIVITY_CATEGORIES.map(([code]) => code).filter(
      (code) => !found.has(code),
    );
    if (missing.length)
      issues.push(`Missing activity categories: ${missing.join(', ')}`);
  }
  if (
    modules.includes('leave') &&
    !(await source.getRepository(LeaveType).existsBy({
      company_id: options.companyId!,
      status: LeaveRecordStatusEnum.ACTIVE,
    }))
  )
    issues.push(
      'REVIEW: no active leave types; review policies, statutory rules and approval before use.',
    );
  if (modules.includes('leave')) {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Dar_es_Salaam',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const policies = await source
      .getRepository(LeavePolicy)
      .find({
        where: {
          company_id: options.companyId!,
          status: LeaveRecordStatusEnum.ACTIVE,
          lifecycle_status: 'active',
        },
      });
    if (!policies.some((policy) => isPolicyEffectiveOn(policy, today)))
      issues.push('REVIEW: no active leave policy effective today.');
    if (
      !(await source
        .getRepository(LeaveApprovalWorkflow)
        .existsBy({
          company_id: options.companyId!,
          status: LeaveRecordStatusEnum.ACTIVE,
          is_default: true,
        }))
    )
      issues.push('REVIEW: no active default leave approval workflow.');
  }
  if (
    modules.includes('attendance') &&
    !(await source
      .getRepository(AttendancePolicy)
      .existsBy({ company_id: options.companyId!, is_active: true }))
  )
    issues.push(
      'REVIEW: no active attendance policy; draft schedule requires HR approval.',
    );
  if (
    modules.includes('attendance') &&
    !(await source
      .getRepository(Timetable)
      .existsBy({
        companyId: options.companyId!,
        isDefault: true,
        status: TimetableStatusEnum.ACTIVE,
      }))
  )
    issues.push('REVIEW: no active default attendance timetable.');
  if (
    modules.includes('probation') &&
    !(await source
      .getRepository(ProbationPolicy)
      .existsBy({ companyId: options.companyId!, status: 'ACTIVE' }))
  )
    issues.push('REVIEW: no active probation policy.');
  if (
    modules.includes('payroll') &&
    !(await source
      .getRepository(PayrollComponent)
      .existsBy({ companyId: options.companyId!, status: 'ACTIVE' }))
  )
    issues.push(
      'REVIEW: no active payroll components; finance must review components and statutory rules.',
    );
  if (modules.includes('payroll')) {
    if (
      !(await source
        .getRepository(PayrollCalendar)
        .existsBy({
          companyId: options.companyId!,
          isDefault: true,
          status: 'ACTIVE',
        }))
    )
      issues.push('REVIEW: no active default payroll calendar.');
    if (
      !(await source
        .getRepository(SalaryStructure)
        .existsBy({
          companyId: options.companyId!,
          status: SalaryStructureStatusEnum.ACTIVE,
        }))
    )
      issues.push('REVIEW: no active salary structure.');
    issues.push(
      'REVIEW: verify effective statutory rules and accounting mappings with Finance.',
    );
  }
  if (
    modules.includes('onboarding') &&
    !(await source.getRepository(OnboardingWorkflow).existsBy({
      company_id: options.companyId!,
      status: OnboardingRecordStatusEnum.ACTIVE,
    }))
  )
    issues.push('REVIEW: no active onboarding workflow.');
  if (
    modules.includes('offboarding') &&
    !(await source.getRepository(OffboardingWorkflow).existsBy({
      company_id: options.companyId!,
      status: OffboardingRecordStatusEnum.ACTIVE,
    }))
  )
    issues.push('REVIEW: no active offboarding workflow.');
  if (modules.includes('notifications')) {
    const channels = new Set(
      (
        await source
          .getRepository(NotificationChannelGlobalSetting)
          .find({ select: ['channel'] })
      ).map((row) => row.channel),
    );
    const missing = CHANNEL_SETTING_DEFAULTS.filter(
      (row) => !channels.has(row.channel),
    ).map((row) => row.channel);
    if (missing.length)
      issues.push(
        `Missing notification channel settings: ${missing.join(', ')}`,
      );
  }
  issues.push(
    'REVIEW: policy approval, attendance, finance and remaining module coverage require independent validation.',
  );
  return issues;
}
