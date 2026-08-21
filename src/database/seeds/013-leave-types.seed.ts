import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { LeaveType } from '../../modules/hr/leave/entities/leave-type.entity';
import { LeaveGenderRestrictionEnum } from '../../modules/hr/leave/enums/leave-gender-restriction.enum';
import { LeaveRecordStatusEnum } from '../../modules/hr/leave/enums/leave-record-status.enum';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

type LeaveTypeSeed = {
  code: string;
  name: string;
  description: string;
  isPaid: boolean;
  requiresAttachment: boolean;
  isCarryForwardAllowed: boolean;
  maxCarryForwardDays: number;
  maxDaysPerYear: number;
  genderRestriction: LeaveGenderRestrictionEnum;
};

const LEAVE_TYPE_SEEDS: LeaveTypeSeed[] = [
  {
    code: 'ANNUAL',
    name: 'Annual Leave',
    description:
      'Minimum 28 consecutive days per 12-month cycle. Counted as consecutive calendar days, and public holidays falling inside the leave period are included. Pro-rata annual leave pay is calculated at 1 day of basic wage for every 13 days worked or entitled to work.',
    isPaid: true,
    requiresAttachment: false,
    isCarryForwardAllowed: true,
    maxCarryForwardDays: 0,
    maxDaysPerYear: 28,
    genderRestriction: LeaveGenderRestrictionEnum.ANY,
  },
  {
    code: 'PAID_OCCASIONAL',
    name: 'Paid Occasional / Casual Leave',
    description:
      'No fixed statutory number of days. If granted at the employee request, it may be deducted from annual leave entitlement. Example: 2 paid occasional days may reduce annual leave balance from 28 to 26.',
    isPaid: true,
    requiresAttachment: false,
    isCarryForwardAllowed: false,
    maxCarryForwardDays: 0,
    maxDaysPerYear: 0,
    genderRestriction: LeaveGenderRestrictionEnum.ANY,
  },
  {
    code: 'SICK',
    name: 'Sick Leave',
    description:
      '126 days per 36-month cycle. The first 63 days are paid at full basic wage and the second 63 days at half basic wage. A valid medical certificate may be required before payment.',
    isPaid: true,
    requiresAttachment: true,
    isCarryForwardAllowed: false,
    maxCarryForwardDays: 0,
    maxDaysPerYear: 126,
    genderRestriction: LeaveGenderRestrictionEnum.ANY,
  },
  {
    code: 'MATERNITY',
    name: 'Maternity Leave',
    description:
      '84 paid days for a single birth. The employee should give at least 3 months notice supported by a medical certificate. Leave may start from 4 weeks before expected birth, or earlier if medically certified.',
    isPaid: true,
    requiresAttachment: true,
    isCarryForwardAllowed: false,
    maxCarryForwardDays: 0,
    maxDaysPerYear: 84,
    genderRestriction: LeaveGenderRestrictionEnum.FEMALE,
  },
  {
    code: 'MATERNITY_MULTIPLE',
    name: 'Maternity Leave - Multiple Birth',
    description:
      '100 paid days where the employee gives birth to more than one child at the same time, for example twins.',
    isPaid: true,
    requiresAttachment: true,
    isCarryForwardAllowed: false,
    maxCarryForwardDays: 0,
    maxDaysPerYear: 100,
    genderRestriction: LeaveGenderRestrictionEnum.FEMALE,
  },
  {
    code: 'MATERNITY_CHILD_LOSS',
    name: 'Maternity Leave - Child Dies Within One Year',
    description:
      'Additional 84 paid days if the child dies within one year of birth. The additional leave applies within the leave cycle.',
    isPaid: true,
    requiresAttachment: true,
    isCarryForwardAllowed: false,
    maxCarryForwardDays: 0,
    maxDaysPerYear: 84,
    genderRestriction: LeaveGenderRestrictionEnum.FEMALE,
  },
  {
    code: 'MATERNITY_PREMATURE',
    name: 'Maternity Leave - Premature Child',
    description:
      'Under the 2025 amendments, an employee who gives birth to a premature child is entitled to paid maternity leave from the date of birth up to completion of 40 weeks of pregnancy, in addition to the ordinary maternity leave period.',
    isPaid: true,
    requiresAttachment: true,
    isCarryForwardAllowed: false,
    maxCarryForwardDays: 0,
    maxDaysPerYear: 0,
    genderRestriction: LeaveGenderRestrictionEnum.FEMALE,
  },
  {
    code: 'PATERNITY',
    name: 'Paternity Leave',
    description:
      '3 paid days per 36-month cycle. Must be taken within 7 days of the child birth, and the employee must be the father of the child. The 3 days are the total entitlement within the cycle regardless of how many children are born.',
    isPaid: true,
    requiresAttachment: true,
    isCarryForwardAllowed: false,
    maxCarryForwardDays: 0,
    maxDaysPerYear: 3,
    genderRestriction: LeaveGenderRestrictionEnum.MALE,
  },
  {
    code: 'PATERNITY_PREMATURE',
    name: 'Paternity Leave - Premature Child',
    description:
      '7 paid days in case of premature birth under the 2025 amendments. The leave must be taken within 7 days of the premature birth.',
    isPaid: true,
    requiresAttachment: true,
    isCarryForwardAllowed: false,
    maxCarryForwardDays: 0,
    maxDaysPerYear: 7,
    genderRestriction: LeaveGenderRestrictionEnum.MALE,
  },
  {
    code: 'UNPAID',
    name: 'Unpaid Leave',
    description:
      'Employer may grant unpaid leave upon written application for a period not exceeding 30 days. It may be extended further by agreement between employer and employee.',
    isPaid: false,
    requiresAttachment: false,
    isCarryForwardAllowed: false,
    maxCarryForwardDays: 0,
    maxDaysPerYear: 30,
    genderRestriction: LeaveGenderRestrictionEnum.ANY,
  },
  {
    code: 'COMPASSIONATE',
    name: 'Compassionate Leave',
    description:
      '4 paid days per 36-month cycle for sickness or death of the employee child, or death of spouse, parent, grandparent, grandchild, or sibling. The employer may require reasonable proof.',
    isPaid: true,
    requiresAttachment: true,
    isCarryForwardAllowed: false,
    maxCarryForwardDays: 0,
    maxDaysPerYear: 4,
    genderRestriction: LeaveGenderRestrictionEnum.ANY,
  },
  {
    code: 'TRADE_UNION',
    name: 'Trade Union Leave',
    description:
      'Reasonable paid leave for trade union representatives or office bearers to perform union-related duties or relevant training. No fixed statutory number of days and it may be regulated by agreement.',
    isPaid: true,
    requiresAttachment: true,
    isCarryForwardAllowed: false,
    maxCarryForwardDays: 0,
    maxDaysPerYear: 0,
    genderRestriction: LeaveGenderRestrictionEnum.ANY,
  },
];

export default class LeaveTypesSeeder implements Seeder {
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
      const leaveTypeRepo = qr.manager.getRepository(LeaveType);

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

      let createdCount = 0;
      for (const seed of LEAVE_TYPE_SEEDS) {
        const leaveType = await leaveTypeRepo.findOne({
          where: { company_id: company.id, code: seed.code },
        });

        if (!leaveType) {
          await leaveTypeRepo.save(
            leaveTypeRepo.create({
              company_id: company.id,
              code: seed.code,
              name: seed.name,
              description: seed.description,
              is_paid: seed.isPaid,
              requires_attachment: seed.requiresAttachment,
              is_carry_forward_allowed: seed.isCarryForwardAllowed,
              max_carry_forward_days: String(seed.maxCarryForwardDays),
              max_days_per_year: String(seed.maxDaysPerYear),
              gender_restriction: seed.genderRestriction,
              status: LeaveRecordStatusEnum.ACTIVE,
            }),
          );
          createdCount += 1;
        }
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][LeaveTypes] Created ${createdCount} new leave types (${LEAVE_TYPE_SEEDS.length - createdCount} already existed, left unchanged) for company "${company.name}"`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][LeaveTypes] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
