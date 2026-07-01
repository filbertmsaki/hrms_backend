import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { HolidayGroup } from '../../modules/hr/attendance/holidays/entities/holiday-group.entity';
import { AttendanceHoliday } from '../../modules/hr/attendance/holidays/entities/holiday.entity';
import { AttendanceHolidayTypeEnum } from '../../modules/hr/attendance/holidays/enums/attendance-holiday-type.enum';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

const HOLIDAY_GROUP_NAME = 'Tanzania National Holidays 2026';
const HOLIDAY_GROUP_DESCRIPTION =
  'Official public and religious holidays observed in Tanzania for the 2026 calendar year.';

type HolidaySeed = {
  name: string;
  date: string;
  type: AttendanceHolidayTypeEnum;
  isPaid: boolean;
  affectsOvertime: boolean;
  countsAsWorkingDay: boolean;
  isRecurring: boolean;
};

// Tanzania public holiday calendar for 2026.
// Islamic holiday dates (Maulid, Eid al-Fitr, Eid al-Adha) follow the lunar
// calendar and are confirmed locally by moon sighting each year — the dates
// below are best-estimate projections and should be verified/adjusted once
// the government gazettes the official dates closer to the time.
const HOLIDAY_SEEDS: HolidaySeed[] = [
  {
    name: "New Year's Day",
    date: '2026-01-01',
    type: AttendanceHolidayTypeEnum.PUBLIC,
    isPaid: true,
    affectsOvertime: false,
    countsAsWorkingDay: false,
    isRecurring: true,
  },
  {
    name: 'Zanzibar Revolution Day',
    date: '2026-01-12',
    type: AttendanceHolidayTypeEnum.PUBLIC,
    isPaid: true,
    affectsOvertime: false,
    countsAsWorkingDay: false,
    isRecurring: true,
  },
  {
    name: 'Karume Day',
    date: '2026-04-07',
    type: AttendanceHolidayTypeEnum.PUBLIC,
    isPaid: true,
    affectsOvertime: false,
    countsAsWorkingDay: false,
    isRecurring: true,
  },
  {
    name: 'Good Friday',
    date: '2026-04-03',
    type: AttendanceHolidayTypeEnum.RELIGIOUS,
    isPaid: true,
    affectsOvertime: false,
    countsAsWorkingDay: false,
    isRecurring: false,
  },
  {
    name: 'Easter Monday',
    date: '2026-04-06',
    type: AttendanceHolidayTypeEnum.RELIGIOUS,
    isPaid: true,
    affectsOvertime: false,
    countsAsWorkingDay: false,
    isRecurring: false,
  },
  {
    name: 'Union Day',
    date: '2026-04-26',
    type: AttendanceHolidayTypeEnum.PUBLIC,
    isPaid: true,
    affectsOvertime: false,
    countsAsWorkingDay: false,
    isRecurring: true,
  },
  {
    name: 'International Workers Day (Labour Day)',
    date: '2026-05-01',
    type: AttendanceHolidayTypeEnum.PUBLIC,
    isPaid: true,
    affectsOvertime: false,
    countsAsWorkingDay: false,
    isRecurring: true,
  },
  {
    name: 'Eid al-Fitr (estimated)',
    date: '2026-03-20',
    type: AttendanceHolidayTypeEnum.RELIGIOUS,
    isPaid: true,
    affectsOvertime: false,
    countsAsWorkingDay: false,
    isRecurring: false,
  },
  {
    name: 'Eid al-Adha (estimated)',
    date: '2026-05-27',
    type: AttendanceHolidayTypeEnum.RELIGIOUS,
    isPaid: true,
    affectsOvertime: false,
    countsAsWorkingDay: false,
    isRecurring: false,
  },
  {
    name: 'Saba Saba (Industry Day)',
    date: '2026-07-07',
    type: AttendanceHolidayTypeEnum.PUBLIC,
    isPaid: true,
    affectsOvertime: false,
    countsAsWorkingDay: false,
    isRecurring: true,
  },
  {
    name: 'Nane Nane (Farmers Day)',
    date: '2026-08-08',
    type: AttendanceHolidayTypeEnum.PUBLIC,
    isPaid: true,
    affectsOvertime: false,
    countsAsWorkingDay: false,
    isRecurring: true,
  },
  {
    name: 'Maulid Day (estimated)',
    date: '2026-08-26',
    type: AttendanceHolidayTypeEnum.RELIGIOUS,
    isPaid: true,
    affectsOvertime: false,
    countsAsWorkingDay: false,
    isRecurring: false,
  },
  {
    name: 'Independence Day',
    date: '2026-12-09',
    type: AttendanceHolidayTypeEnum.PUBLIC,
    isPaid: true,
    affectsOvertime: false,
    countsAsWorkingDay: false,
    isRecurring: true,
  },
  {
    name: 'Christmas Day',
    date: '2026-12-25',
    type: AttendanceHolidayTypeEnum.RELIGIOUS,
    isPaid: true,
    affectsOvertime: false,
    countsAsWorkingDay: false,
    isRecurring: true,
  },
  {
    name: 'Boxing Day',
    date: '2026-12-26',
    type: AttendanceHolidayTypeEnum.PUBLIC,
    isPaid: true,
    affectsOvertime: false,
    countsAsWorkingDay: false,
    isRecurring: true,
  },
];

export default class HolidaysSeeder implements Seeder {
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
      const holidayGroupRepo = qr.manager.getRepository(HolidayGroup);
      const holidayRepo = qr.manager.getRepository(AttendanceHoliday);

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

      let holidayGroup = await holidayGroupRepo.findOne({
        where: { companyId: company.id, name: HOLIDAY_GROUP_NAME },
      });

      if (!holidayGroup) {
        holidayGroup = holidayGroupRepo.create({
          companyId: company.id,
          name: HOLIDAY_GROUP_NAME,
          description: HOLIDAY_GROUP_DESCRIPTION,
        });
      } else {
        holidayGroup.description = HOLIDAY_GROUP_DESCRIPTION;
      }
      holidayGroup = await holidayGroupRepo.save(holidayGroup);

      for (const seed of HOLIDAY_SEEDS) {
        let holiday = await holidayRepo.findOne({
          where: {
            holidayGroupId: holidayGroup.id,
            name: seed.name,
            date: seed.date,
          },
        });

        if (!holiday) {
          holiday = holidayRepo.create({
            companyId: company.id,
            holidayGroupId: holidayGroup.id,
            name: seed.name,
            date: seed.date,
          });
        }

        holiday.isRecurring = seed.isRecurring;
        holiday.type = seed.type;
        holiday.isPaid = seed.isPaid;
        holiday.affectsOvertime = seed.affectsOvertime;
        holiday.countsAsWorkingDay = seed.countsAsWorkingDay;
        holiday.branchId = null;

        await holidayRepo.save(holiday);
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][Holidays] Upserted holiday group "${holidayGroup.name}" with ${HOLIDAY_SEEDS.length} holidays for company "${company.name}"`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][Holidays] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
