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

// day_of_week: 0=Sunday, 1=Monday ... 6=Saturday
type TimetableDaySeed = {
  dayOfWeek: number;
  isWorkingDay: boolean;
  breakMinutes: number;
};

const DEFAULT_TIMETABLE_NAME = 'Standard Office Timetable';
const DEFAULT_TIMETABLE_CODE = 'STD-OFFICE';
const DEFAULT_SHIFT_CODE = 'SHIFT-DAY';

const TIMETABLE_DAY_SEEDS: TimetableDaySeed[] = [
  { dayOfWeek: 0, isWorkingDay: false, breakMinutes: 0 },  // Sunday
  { dayOfWeek: 1, isWorkingDay: true, breakMinutes: 60 },   // Monday
  { dayOfWeek: 2, isWorkingDay: true, breakMinutes: 60 },   // Tuesday
  { dayOfWeek: 3, isWorkingDay: true, breakMinutes: 60 },   // Wednesday
  { dayOfWeek: 4, isWorkingDay: true, breakMinutes: 60 },   // Thursday
  { dayOfWeek: 5, isWorkingDay: true, breakMinutes: 60 },   // Friday
  { dayOfWeek: 6, isWorkingDay: false, breakMinutes: 0 },   // Saturday
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

      const dayShift = await shiftRepo.findOne({
        where: { companyId: company.id, code: DEFAULT_SHIFT_CODE },
      });

      // Upsert timetable
      let timetable = await timetableRepo.findOne({
        where: { companyId: company.id, code: DEFAULT_TIMETABLE_CODE },
      });
      if (!timetable) {
        timetable = timetableRepo.create({
          companyId: company.id,
          name: DEFAULT_TIMETABLE_NAME,
          code: DEFAULT_TIMETABLE_CODE,
        });
      }
      timetable.name = DEFAULT_TIMETABLE_NAME;
      timetable.timetableType = TimetableTypeEnum.FIXED;
      timetable.timezone = 'Africa/Dar_es_Salaam';
      timetable.isDefault = true;
      timetable.lateAfterMinutes = 15;
      timetable.halfDayAfterMinutes = 240;
      timetable.absentAfterMinutes = 360;
      timetable.allowEarlyCheckin = true;
      timetable.allowLateCheckout = true;
      timetable.autoAbsentIfNoCheckin = true;
      timetable.maxOvertimeMinutes = 0;
      timetable.status = TimetableStatusEnum.ACTIVE;

      await timetableRepo.save(timetable);

      // Upsert timetable days
      for (const daySeed of TIMETABLE_DAY_SEEDS) {
        let day = await timetableDayRepo.findOne({
          where: { timetableId: timetable.id, dayOfWeek: daySeed.dayOfWeek },
        });
        if (!day) {
          day = timetableDayRepo.create({
            timetableId: timetable.id,
            dayOfWeek: daySeed.dayOfWeek,
          });
        }
        day.isWorkingDay = daySeed.isWorkingDay;
        day.defaultShiftId = daySeed.isWorkingDay ? (dayShift?.id ?? null) : null;
        day.minimumWorkMinutes = daySeed.isWorkingDay ? 300 : 0;
        day.breakRequired = daySeed.breakMinutes > 0;
        day.breakMinutes = daySeed.breakMinutes;
        day.expectedCheckInTime = daySeed.isWorkingDay ? '08:00:00' : null;
        day.expectedCheckOutTime = daySeed.isWorkingDay ? '17:00:00' : null;

        await timetableDayRepo.save(day);
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][Timetables] Upserted "${DEFAULT_TIMETABLE_NAME}" with ${TIMETABLE_DAY_SEEDS.length} day entries`,
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
