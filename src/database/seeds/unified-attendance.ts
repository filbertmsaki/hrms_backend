import { EntityManager } from 'typeorm';
import { Shift } from '../../modules/hr/attendance/shift/shifts/entities/shift.entity';
import { ShiftBreak } from '../../modules/hr/attendance/shift/shift-breaks/entities/shift-break.entity';
import { ShiftStatusEnum } from '../../modules/hr/attendance/shift/shifts/enums/shift-status.enum';
import { Timetable } from '../../modules/hr/attendance/timetable/timetables/entities/timetable.entity';
import { TimetableDay } from '../../modules/hr/attendance/timetable/timetable-days/entities/timetable-day.entity';
import { TimetableStatusEnum } from '../../modules/hr/attendance/timetable/timetables/enums/timetable-status.enum';
import { TimetableTypeEnum } from '../../modules/hr/attendance/timetable/timetables/enums/timetable-type.enum';
import { AttendancePolicy } from '../../modules/hr/attendance/policies/entities/attendance-policy.entity';
import { SHIFT_SEEDS } from './016-shifts.seed';
import {
  DEFAULT_TIMETABLE_CODE,
  DEFAULT_TIMETABLE_NAME,
  TIMETABLE_DAY_SEEDS,
} from './017-timetables.seed';
import { POLICY_NAME, POLICY_VALUES } from './018a-attendance-policy.seed';

/** Explicitly requested proposals only; the legacy schedule is not an approved policy. */
export async function seedAttendanceDraft(
  manager: EntityManager,
  companyId: number,
): Promise<void> {
  const shifts = manager.getRepository(Shift);
  const breaks = manager.getRepository(ShiftBreak);
  const shiftIds = new Map<string, number>();
  for (const seed of SHIFT_SEEDS) {
    let shift = await shifts.findOne({ where: { companyId, code: seed.code } });
    if (!shift) {
      const { breaks: shiftBreaks, ...attributes } = seed;
      shift = await shifts.save(
        shifts.create({
          ...attributes,
          companyId,
          overtimeRequiresApproval: true,
          overtimeAutoCalculate: false,
          status: ShiftStatusEnum.INACTIVE,
        }),
      );
      for (const item of shiftBreaks)
        await breaks.save(breaks.create({ ...item, shiftId: shift.id }));
    }
    shiftIds.set(seed.code, shift.id);
  }
  const timetables = manager.getRepository(Timetable);
  const existing = await timetables.findOne({
    where: { companyId, code: DEFAULT_TIMETABLE_CODE },
  });
  if (!existing) {
    const timetable = await timetables.save(
      timetables.create({
        companyId,
        code: DEFAULT_TIMETABLE_CODE,
        name: DEFAULT_TIMETABLE_NAME,
        description:
          'Proposed company schedule; HR approval required before activation.',
        timetableType: TimetableTypeEnum.FIXED,
        timezone: 'Africa/Dar_es_Salaam',
        isDefault: false,
        lateAfterMinutes: 30,
        halfDayAfterMinutes: 240,
        absentAfterMinutes: 360,
        allowEarlyCheckin: true,
        allowLateCheckout: false,
        autoAbsentIfNoCheckin: true,
        maxOvertimeMinutes: 0,
        status: TimetableStatusEnum.INACTIVE,
      }),
    );
    const days = manager.getRepository(TimetableDay);
    for (const seed of TIMETABLE_DAY_SEEDS) {
      if (seed.shiftCode && !shiftIds.has(seed.shiftCode))
        throw new Error(`Missing shift ${seed.shiftCode}.`);
      await days.save(
        days.create({
          timetableId: timetable.id,
          dayOfWeek: seed.dayOfWeek,
          isWorkingDay: seed.isWorkingDay,
          defaultShiftId: seed.shiftCode ? shiftIds.get(seed.shiftCode)! : null,
          expectedCheckInTime: seed.expectedCheckIn,
          expectedCheckOutTime: seed.expectedCheckOut,
          minimumWorkMinutes: seed.minimumWorkMinutes,
          breakRequired: seed.breakRequired,
          breakMinutes: seed.breakMinutes,
          overtimeAllowed: seed.overtimeAllowed,
          allowFlexibleTime: false,
          flexibleStartFrom: null,
          flexibleStartTo: null,
        }),
      );
    }
  }
  const policies = manager.getRepository(AttendancePolicy);
  await policies
    .createQueryBuilder()
    .insert()
    .into(AttendancePolicy)
    .values({
      ...POLICY_VALUES,
      name: POLICY_NAME,
      company_id: companyId,
      is_active: false,
    })
    .orIgnore()
    .execute();
}
