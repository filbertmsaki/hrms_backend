import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { Shift } from '../../modules/hr/attendance/shift/shifts/entities/shift.entity';
import { Timetable } from '../../modules/hr/attendance/timetable/timetables/entities/timetable.entity';
import { TimetableDay } from '../../modules/hr/attendance/timetable/timetable-days/entities/timetable-day.entity';
import { TimetableTypeEnum } from '../../modules/hr/attendance/timetable/timetables/enums/timetable-type.enum';
import { TimetableStatusEnum } from '../../modules/hr/attendance/timetable/timetables/enums/timetable-status.enum';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

// Alliance Company timetable:
//   Mon–Fri  (1–5): 08:15–17:15, lunch 13:00–14:00, shift = SHIFT-DAY
//   Saturday   (6): 09:00–13:00, no break,           shift = SHIFT-SAT
//   Sunday     (0): off day
//
// Overtime is DISABLED for Alliance Company (maxOvertimeMinutes = 0).
// Lateness grace period: 30 minutes (lateAfterMinutes = 30 on timetable level).

// dayOfWeek: 0=Sunday, 1=Monday … 6=Saturday
type TimetableDaySeed = {
  dayOfWeek: number;
  isWorkingDay: boolean;
  shiftCode: string | null;
  expectedCheckIn: string | null;
  expectedCheckOut: string | null;
  minimumWorkMinutes: number;
  breakRequired: boolean;
  breakMinutes: number;
  overtimeAllowed: boolean;
};

const DEFAULT_TIMETABLE_NAME = 'Standard Office Timetable';
const DEFAULT_TIMETABLE_CODE = 'STD-OFFICE';

const TIMETABLE_DAY_SEEDS: TimetableDaySeed[] = [
  {
    dayOfWeek: 0, // Sunday — off
    isWorkingDay: false,
    shiftCode: null,
    expectedCheckIn: null,
    expectedCheckOut: null,
    minimumWorkMinutes: 0,
    breakRequired: false,
    breakMinutes: 0,
    overtimeAllowed: false,
  },
  {
    dayOfWeek: 1, // Monday
    isWorkingDay: true,
    shiftCode: 'SHIFT-DAY',
    expectedCheckIn: '08:15:00',
    expectedCheckOut: '17:15:00',
    minimumWorkMinutes: 300,
    breakRequired: true,
    breakMinutes: 60,
    overtimeAllowed: false,
  },
  {
    dayOfWeek: 2, // Tuesday
    isWorkingDay: true,
    shiftCode: 'SHIFT-DAY',
    expectedCheckIn: '08:15:00',
    expectedCheckOut: '17:15:00',
    minimumWorkMinutes: 300,
    breakRequired: true,
    breakMinutes: 60,
    overtimeAllowed: false,
  },
  {
    dayOfWeek: 3, // Wednesday
    isWorkingDay: true,
    shiftCode: 'SHIFT-DAY',
    expectedCheckIn: '08:15:00',
    expectedCheckOut: '17:15:00',
    minimumWorkMinutes: 300,
    breakRequired: true,
    breakMinutes: 60,
    overtimeAllowed: false,
  },
  {
    dayOfWeek: 4, // Thursday
    isWorkingDay: true,
    shiftCode: 'SHIFT-DAY',
    expectedCheckIn: '08:15:00',
    expectedCheckOut: '17:15:00',
    minimumWorkMinutes: 300,
    breakRequired: true,
    breakMinutes: 60,
    overtimeAllowed: false,
  },
  {
    dayOfWeek: 5, // Friday
    isWorkingDay: true,
    shiftCode: 'SHIFT-DAY',
    expectedCheckIn: '08:15:00',
    expectedCheckOut: '17:15:00',
    minimumWorkMinutes: 300,
    breakRequired: true,
    breakMinutes: 60,
    overtimeAllowed: false,
  },
  {
    dayOfWeek: 6, // Saturday — half day
    isWorkingDay: true,
    shiftCode: 'SHIFT-SAT',
    expectedCheckIn: '09:00:00',
    expectedCheckOut: '13:00:00',
    minimumWorkMinutes: 120,
    breakRequired: false,
    breakMinutes: 0,
    overtimeAllowed: false,
  },
];

export default class TimetablesSeeder implements Seeder {
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
      const timetableRepo = qr.manager.getRepository(Timetable);
      const timetableDayRepo = qr.manager.getRepository(TimetableDay);

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

      // Build shift lookup for this company
      const shifts = await shiftRepo.find({ where: { companyId: company.id } });
      const shiftMap = new Map(shifts.map((s) => [s.code, s]));

      // Create timetable only if it does not already exist
      let timetable = await timetableRepo.findOne({
        where: { companyId: company.id, code: DEFAULT_TIMETABLE_CODE },
      });
      const timetableAlreadyExisted = !!timetable;
      if (!timetable) {
        timetable = timetableRepo.create({
          companyId: company.id,
          code: DEFAULT_TIMETABLE_CODE,
          name: DEFAULT_TIMETABLE_NAME,
          description:
            'Standard Alliance Company schedule: Mon–Fri 08:15–17:15, Saturday 09:00–13:00, Sunday off.',
          timetableType: TimetableTypeEnum.FIXED,
          timezone: 'Africa/Dar_es_Salaam',
          isDefault: true,
          // Timetable-level late threshold (used by timetable-only resolution path)
          lateAfterMinutes: 30,
          halfDayAfterMinutes: 240,
          absentAfterMinutes: 360,
          allowEarlyCheckin: true,
          allowLateCheckout: false,
          autoAbsentIfNoCheckin: true,
          // Overtime disabled for Alliance Company
          maxOvertimeMinutes: 0,
          status: TimetableStatusEnum.ACTIVE,
        });
        await timetableRepo.save(timetable);
      }

      // Create timetable days only if missing
      let createdDayCount = 0;
      for (const daySeed of TIMETABLE_DAY_SEEDS) {
        const shift = daySeed.shiftCode
          ? (shiftMap.get(daySeed.shiftCode) ?? null)
          : null;

        const day = await timetableDayRepo.findOne({
          where: { timetableId: timetable.id, dayOfWeek: daySeed.dayOfWeek },
        });
        if (!day) {
          await timetableDayRepo.save(
            timetableDayRepo.create({
              timetableId: timetable.id,
              dayOfWeek: daySeed.dayOfWeek,
              isWorkingDay: daySeed.isWorkingDay,
              defaultShiftId: shift?.id ?? null,
              expectedCheckInTime: daySeed.expectedCheckIn,
              expectedCheckOutTime: daySeed.expectedCheckOut,
              minimumWorkMinutes: daySeed.minimumWorkMinutes,
              breakRequired: daySeed.breakRequired,
              breakMinutes: daySeed.breakMinutes,
              overtimeAllowed: daySeed.overtimeAllowed,
              allowFlexibleTime: false,
              flexibleStartFrom: null,
              flexibleStartTo: null,
            }),
          );
          createdDayCount += 1;
        }
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][Timetables] ${timetableAlreadyExisted ? `Timetable "${DEFAULT_TIMETABLE_NAME}" already existed, left unchanged` : `Created timetable "${DEFAULT_TIMETABLE_NAME}"`}; created ${createdDayCount} new day entries (${TIMETABLE_DAY_SEEDS.length - createdDayCount} already existed, left unchanged) for company "${company.name}"`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][Timetables] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
