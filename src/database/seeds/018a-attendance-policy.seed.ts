import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { AttendancePolicy } from '../../modules/hr/attendance/policies/entities/attendance-policy.entity';
import { AttendanceHolidayPolicyModeEnum } from '../../modules/hr/attendance/policies/enums/attendance-holiday-policy-mode.enum';
import { AttendanceRoundingModeEnum } from '../../modules/hr/attendance/policies/enums/attendance-rounding-mode.enum';
import { ALLIANCE_COMPANY_SLUG } from './company-structure.constants';

// Alliance Insurance — Standard Attendance Policy
//
// Aligned with the shifts in 016-shifts.seed.ts:
//   Mon–Fri 08:15–17:15 (1h unpaid lunch), Sat 09:00–13:00, Sunday off.
//
// 1. Punctuality: 30-min grace. Check-in after 08:45 (Sat 09:30) is LATE.
//    Arriving 4h+ late counts as a HALF DAY; 6h+ late (or no check-in) is ABSENT.
// 2. Weekend: Sunday is the only rest day. Saturday is a scheduled working day.
// 3. Public holidays: paid days off (Employment and Labour Relations Act).
// 4. Overtime: not auto-paid. It must be requested and approved by the line
//    manager in advance; weekday 1.5x, weekend/holiday 2.0x; max 2h/day,
//    40h/month.
// 5. Punch methods: mobile app (geo-fenced to office, selfie on check-in) and
//    web. One registered device per employee, no device sharing. Offline
//    punches allowed and must sync within 24h.
// 6. Missing punches / regularization: up to 3 requests per month, within
//    7 days of the date, reason required. A missing check-out is ignored if
//    worked hours are otherwise valid.
// 7. Attendance is processed automatically every night at 23:59.

const POLICY_NAME = 'Alliance Standard Attendance Policy';

const POLICY_VALUES: Partial<AttendancePolicy> = {
  name: POLICY_NAME,
  is_active: true,

  // Punctuality
  grace_period_minutes: 30,
  late_after_minutes: 30,
  half_day_after_minutes: 240,
  absent_after_minutes: 360,
  allow_early_checkin: true,
  allow_late_checkout: true,
  auto_absent_if_no_checkin: true,
  rounding_mode: AttendanceRoundingModeEnum.NEAREST,

  // Overtime (pre-approved only)
  overtime_auto_calculate: false,
  overtime_requires_approval: true,
  requires_manager_approval_for_overtime: true,
  overtime_start_after_minutes: 30,
  max_overtime_minutes_per_day: 120,
  max_overtime_minutes_per_month: 2400,
  overtime_rate_multiplier: '1.50',
  weekend_overtime_multiplier: '2.00',
  holiday_overtime_multiplier: '2.00',

  // Weekends & holidays
  weekend_days: 'SUN',
  auto_mark_weekend_as_off: true,
  treat_weekend_as_absent_if_scheduled: false,
  holiday_policy_mode: AttendanceHolidayPolicyModeEnum.PAID,

  // Punch methods & device controls
  authentication_modes: 'MOBILE_APP,WEB',
  require_geo_fencing: true,
  allow_location_exception_override: true,
  require_selfie_for_check_in: true,
  require_selfie_for_check_out: false,
  allow_multi_device_login: false,
  prevent_mobile_device_sharing: true,
  allow_offline_punches: true,
  offline_max_age_hours: 24,

  // Missing punches & regularization
  max_missing_punch_allowed: 3,
  ignore_missing_checkout_if_hours_valid: true,
  regularization_backdate_days: 7,
  regularization_monthly_request_limit: 3,
  regularization_reason_required: true,
  regularization_evidence_required: false,
  regularization_eligible_statuses: [
    'ABSENT',
    'LATE',
    'EARLY_DEPARTURE',
    'LATE_AND_EARLY_DEPARTURE',
    'HALF_DAY',
    'NO_SUMMARY',
  ],

  // Processing
  auto_calculate_attendance: true,
  calculation_time: '23:59:00',
  consider_shift_roster: true,
};

export default class AttendancePolicySeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void factoryManager;

    await dataSource.transaction(async (manager) => {
      const company = await manager
        .getRepository(Company)
        .findOne({ where: { slug: ALLIANCE_COMPANY_SLUG } });
      if (!company) {
        throw new Error(
          `Company "${ALLIANCE_COMPANY_SLUG}" not found. Run 004-company.seed.ts first.`,
        );
      }

      const repo = manager.getRepository(AttendancePolicy);
      const existing = await repo.findOne({
        where: { company_id: company.id, name: POLICY_NAME },
      });
      if (existing) {
        console.log(
          `[Seeder][AttendancePolicy] "${POLICY_NAME}" already exists for "${company.name}", left unchanged`,
        );
        return;
      }

      // Only one active policy per company; don't override one HR already activated.
      const hasActive = await repo.exist({
        where: { company_id: company.id, is_active: true },
      });

      await repo.save(
        repo.create({
          ...POLICY_VALUES,
          company_id: company.id,
          is_active: !hasActive,
        }),
      );
      console.log(
        `[Seeder][AttendancePolicy] Created "${POLICY_NAME}" for "${company.name}" (active: ${!hasActive})`,
      );
    });
  }
}
