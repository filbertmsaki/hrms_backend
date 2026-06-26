import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { Shift } from '../../modules/hr/attendance/shift/shifts/entities/shift.entity';
import { ShiftBreak } from '../../modules/hr/attendance/shift/shift-breaks/entities/shift-break.entity';
import { ShiftTypeEnum } from '../../modules/hr/attendance/shift/shifts/enums/shift-type.enum';
import { ShiftStatusEnum } from '../../modules/hr/attendance/shift/shifts/enums/shift-status.enum';
import { ShiftBreakTypeEnum } from '../../modules/hr/attendance/shift/shift-breaks/enums/shift-break-type.enum';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

type BreakSeed = {
  name: string;
  breakType: ShiftBreakTypeEnum;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  isPaid: boolean;
};

type ShiftSeed = {
  code: string;
  name: string;
  description: string;
  shiftType: ShiftTypeEnum;
  startTime: string;
  endTime: string;
  expectedWorkMinutes: number;
  minimumWorkMinutes: number;
  halfDayMinutes: number;
  graceInMinutes: number;
  graceOutMinutes: number;
  lateAfterMinutes: number;
  halfDayAfterMinutes: number;
  absentAfterMinutes: number;
  earlyLeaveAfterMinutes: number;
  isNightShift: boolean;
  crossesMidnight: boolean;
  allowOvertime: boolean;
  maxOvertimeMinutes: number;
  overtimeStartAfterMinutes: number;
  breaks: BreakSeed[];
};

// Alliance Company schedule:
//   Mon–Fri : 08:15–17:15  (9h gross, 8h net after 1h lunch)
//   Saturday: 09:00–13:00  (4h, no break)
//   Sunday  : off
//
// Lateness rule: 30-min grace → late after 08:45 (Mon-Fri) / 09:30 (Sat)
// Early checkout: any checkout before shift end time (earlyLeaveAfterMinutes = 0)
// Overtime     : disabled for all Alliance shifts

const SHIFT_SEEDS: ShiftSeed[] = [
  // ─── Primary weekday shift ────────────────────────────────────────────────
  {
    code: 'SHIFT-DAY',
    name: 'Day Shift',
    description: 'Standard weekday office hours — Monday to Friday.',
    shiftType: ShiftTypeEnum.FIXED,
    startTime: '08:15:00',
    endTime: '17:15:00',
    // 9h gross − 1h lunch = 8h net = 480 min
    expectedWorkMinutes: 480,
    minimumWorkMinutes: 300,
    halfDayMinutes: 240,
    graceInMinutes: 30,
    graceOutMinutes: 0,
    // Late when check-in is > 30 min after 08:15 (i.e. after 08:45)
    lateAfterMinutes: 30,
    halfDayAfterMinutes: 240,
    absentAfterMinutes: 360,
    // 0 = flag early checkout immediately if check-out < 17:15
    earlyLeaveAfterMinutes: 0,
    isNightShift: false,
    crossesMidnight: false,
    allowOvertime: false,
    maxOvertimeMinutes: 0,
    overtimeStartAfterMinutes: 0,
    breaks: [
      {
        name: 'Lunch Break',
        breakType: ShiftBreakTypeEnum.LUNCH,
        startTime: '13:00:00',
        endTime: '14:00:00',
        durationMinutes: 60,
        isPaid: false,
      },
    ],
  },

  // ─── Saturday half-day shift ──────────────────────────────────────────────
  {
    code: 'SHIFT-SAT',
    name: 'Saturday Shift',
    description: 'Saturday morning session — 09:00 to 13:00, no break.',
    shiftType: ShiftTypeEnum.FIXED,
    startTime: '09:00:00',
    endTime: '13:00:00',
    // 4h gross, no break = 4h net = 240 min
    expectedWorkMinutes: 240,
    minimumWorkMinutes: 120,
    halfDayMinutes: 120,
    graceInMinutes: 30,
    graceOutMinutes: 0,
    // Late when check-in is > 30 min after 09:00 (i.e. after 09:30)
    lateAfterMinutes: 30,
    halfDayAfterMinutes: 120,
    absentAfterMinutes: 180,
    // 0 = flag early checkout immediately if check-out < 13:00
    earlyLeaveAfterMinutes: 0,
    isNightShift: false,
    crossesMidnight: false,
    allowOvertime: false,
    maxOvertimeMinutes: 0,
    overtimeStartAfterMinutes: 0,
    breaks: [],
  },

  // ─── Auxiliary shifts (non-default, kept for future use) ──────────────────
  {
    code: 'SHIFT-MRN',
    name: 'Morning Shift',
    description: 'Early morning shift — 07:00 to 15:00.',
    shiftType: ShiftTypeEnum.FIXED,
    startTime: '07:00:00',
    endTime: '15:00:00',
    expectedWorkMinutes: 420,
    minimumWorkMinutes: 300,
    halfDayMinutes: 210,
    graceInMinutes: 15,
    graceOutMinutes: 0,
    lateAfterMinutes: 15,
    halfDayAfterMinutes: 210,
    absentAfterMinutes: 360,
    earlyLeaveAfterMinutes: 0,
    isNightShift: false,
    crossesMidnight: false,
    allowOvertime: false,
    maxOvertimeMinutes: 0,
    overtimeStartAfterMinutes: 0,
    breaks: [
      {
        name: 'Lunch Break',
        breakType: ShiftBreakTypeEnum.LUNCH,
        startTime: '12:00:00',
        endTime: '13:00:00',
        durationMinutes: 60,
        isPaid: false,
      },
    ],
  },
  {
    code: 'SHIFT-AFT',
    name: 'Afternoon Shift',
    description: 'Afternoon shift — 15:00 to 23:00.',
    shiftType: ShiftTypeEnum.FIXED,
    startTime: '15:00:00',
    endTime: '23:00:00',
    expectedWorkMinutes: 450,
    minimumWorkMinutes: 300,
    halfDayMinutes: 225,
    graceInMinutes: 15,
    graceOutMinutes: 0,
    lateAfterMinutes: 15,
    halfDayAfterMinutes: 225,
    absentAfterMinutes: 360,
    earlyLeaveAfterMinutes: 0,
    isNightShift: false,
    crossesMidnight: false,
    allowOvertime: false,
    maxOvertimeMinutes: 0,
    overtimeStartAfterMinutes: 0,
    breaks: [
      {
        name: 'Dinner Break',
        breakType: ShiftBreakTypeEnum.DINNER,
        startTime: '19:00:00',
        endTime: '19:30:00',
        durationMinutes: 30,
        isPaid: false,
      },
    ],
  },
  {
    code: 'SHIFT-NIT',
    name: 'Night Shift',
    description: 'Night shift — 23:00 to 07:00.',
    shiftType: ShiftTypeEnum.FIXED,
    startTime: '23:00:00',
    endTime: '07:00:00',
    expectedWorkMinutes: 450,
    minimumWorkMinutes: 300,
    halfDayMinutes: 225,
    graceInMinutes: 15,
    graceOutMinutes: 0,
    lateAfterMinutes: 15,
    halfDayAfterMinutes: 225,
    absentAfterMinutes: 360,
    earlyLeaveAfterMinutes: 0,
    isNightShift: true,
    crossesMidnight: true,
    allowOvertime: false,
    maxOvertimeMinutes: 0,
    overtimeStartAfterMinutes: 0,
    breaks: [
      {
        name: 'Night Break',
        breakType: ShiftBreakTypeEnum.CUSTOM,
        startTime: '03:00:00',
        endTime: '03:30:00',
        durationMinutes: 30,
        isPaid: false,
      },
    ],
  },
];

export default class ShiftsSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void factoryManager;

    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const companyRepo = qr.manager.getRepository(Company);
      const shiftRepo = qr.manager.getRepository(Shift);
      const breakRepo = qr.manager.getRepository(ShiftBreak);

      const companyName =
        process.env.DEFAULT_COMPANY_NAME ?? ALLIANCE_COMPANY_NAME;
      const company = await companyRepo.findOne({
        where: { slug: ALLIANCE_COMPANY_SLUG },
      });
      if (!company) {
        throw new Error(
          `Company "${companyName}" not found. Run 004-company.seed.ts first.`,
        );
      }

      for (const seed of SHIFT_SEEDS) {
        let shift = await shiftRepo.findOne({
          where: { companyId: company.id, code: seed.code },
        });

        if (!shift) {
          shift = shiftRepo.create({ companyId: company.id, code: seed.code });
        }

        shift.name = seed.name;
        shift.description = seed.description;
        shift.shiftType = seed.shiftType;
        shift.startTime = seed.startTime;
        shift.endTime = seed.endTime;
        shift.expectedWorkMinutes = seed.expectedWorkMinutes;
        shift.minimumWorkMinutes = seed.minimumWorkMinutes;
        shift.halfDayMinutes = seed.halfDayMinutes;
        shift.graceInMinutes = seed.graceInMinutes;
        shift.graceOutMinutes = seed.graceOutMinutes;
        shift.lateAfterMinutes = seed.lateAfterMinutes;
        shift.halfDayAfterMinutes = seed.halfDayAfterMinutes;
        shift.absentAfterMinutes = seed.absentAfterMinutes;
        shift.earlyLeaveAfterMinutes = seed.earlyLeaveAfterMinutes;
        shift.isNightShift = seed.isNightShift;
        shift.crossesMidnight = seed.crossesMidnight;
        shift.allowOvertime = seed.allowOvertime;
        shift.maxOvertimeMinutes = seed.maxOvertimeMinutes;
        shift.overtimeStartAfterMinutes = seed.overtimeStartAfterMinutes;
        shift.overtimeRequiresApproval = false;
        shift.overtimeAutoCalculate = false;
        shift.status = ShiftStatusEnum.ACTIVE;

        await shiftRepo.save(shift);

        // Upsert breaks (keyed by shiftId + name)
        for (const breakSeed of seed.breaks) {
          let shiftBreak = await breakRepo.findOne({
            where: { shiftId: shift.id, name: breakSeed.name },
          });
          if (!shiftBreak) {
            shiftBreak = breakRepo.create({
              shiftId: shift.id,
              name: breakSeed.name,
            });
          }
          shiftBreak.breakType = breakSeed.breakType;
          shiftBreak.startTime = breakSeed.startTime;
          shiftBreak.endTime = breakSeed.endTime;
          shiftBreak.durationMinutes = breakSeed.durationMinutes;
          shiftBreak.isPaid = breakSeed.isPaid;

          await breakRepo.save(shiftBreak);
        }
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][Shifts] Upserted ${SHIFT_SEEDS.length} shifts for company "${company.name}"`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][Shifts] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
