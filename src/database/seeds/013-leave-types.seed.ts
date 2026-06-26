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
    description: 'Paid annual leave entitlement for all employees.',
    isPaid: true,
    requiresAttachment: false,
    isCarryForwardAllowed: true,
    maxCarryForwardDays: 10,
    maxDaysPerYear: 28,
    genderRestriction: LeaveGenderRestrictionEnum.ANY,
  },
  {
    code: 'SICK',
    name: 'Sick Leave',
    description: 'Paid sick leave for employees with a medical condition.',
    isPaid: true,
    requiresAttachment: true,
    isCarryForwardAllowed: false,
    maxCarryForwardDays: 0,
    maxDaysPerYear: 12,
    genderRestriction: LeaveGenderRestrictionEnum.ANY,
  },
  {
    code: 'MATERNITY',
    name: 'Maternity Leave',
    description: 'Paid maternity leave for female employees.',
    isPaid: true,
    requiresAttachment: true,
    isCarryForwardAllowed: false,
    maxCarryForwardDays: 0,
    maxDaysPerYear: 84,
    genderRestriction: LeaveGenderRestrictionEnum.FEMALE,
  },
  {
    code: 'UNPAID',
    name: 'Unpaid Leave',
    description: 'Unpaid leave at the discretion of management.',
    isPaid: false,
    requiresAttachment: false,
    isCarryForwardAllowed: false,
    maxCarryForwardDays: 0,
    maxDaysPerYear: 365,
    genderRestriction: LeaveGenderRestrictionEnum.ANY,
  },
  {
    code: 'COMPASSIONATE',
    name: 'Compassionate Leave',
    description: 'Paid leave for bereavement or family emergency.',
    isPaid: true,
    requiresAttachment: false,
    isCarryForwardAllowed: false,
    maxCarryForwardDays: 0,
    maxDaysPerYear: 7,
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

      for (const seed of LEAVE_TYPE_SEEDS) {
        let leaveType = await leaveTypeRepo.findOne({
          where: { company_id: company.id, code: seed.code },
        });

        if (!leaveType) {
          leaveType = leaveTypeRepo.create({
            company_id: company.id,
            code: seed.code,
          });
        }

        leaveType.name = seed.name;
        leaveType.description = seed.description;
        leaveType.is_paid = seed.isPaid;
        leaveType.requires_attachment = seed.requiresAttachment;
        leaveType.is_carry_forward_allowed = seed.isCarryForwardAllowed;
        leaveType.max_carry_forward_days = String(seed.maxCarryForwardDays);
        leaveType.max_days_per_year = String(seed.maxDaysPerYear);
        leaveType.gender_restriction = seed.genderRestriction;
        leaveType.status = LeaveRecordStatusEnum.ACTIVE;

        await leaveTypeRepo.save(leaveType);
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][LeaveTypes] Upserted ${LEAVE_TYPE_SEEDS.length} leave types for company "${company.name}"`,
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
