import { DataSource, Repository } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { CompanyUser } from '../../modules/companies/entities/company-user.entity';
import { Holiday } from '../../modules/hr/leave/entities/holiday.entity';
import { LeaveApprovalWorkflowStep } from '../../modules/hr/leave/entities/leave-approval-workflow-step.entity';
import { LeaveApprovalWorkflow } from '../../modules/hr/leave/entities/leave-approval-workflow.entity';
import { LeavePolicyType } from '../../modules/hr/leave/entities/leave-policy-type.entity';
import { LeavePolicy } from '../../modules/hr/leave/entities/leave-policy.entity';
import { LeaveType } from '../../modules/hr/leave/entities/leave-type.entity';
import { LeaveApprovalActionTypeEnum } from '../../modules/hr/leave/enums/leave-approval-action-type.enum';
import { LeaveAccrualMethodEnum } from '../../modules/hr/leave/enums/leave-accrual-method.enum';
import { LeaveApproverTypeEnum } from '../../modules/hr/leave/enums/leave-approver-type.enum';
import { LeaveGenderRestrictionEnum } from '../../modules/hr/leave/enums/leave-gender-restriction.enum';
import { LeaveRecordStatusEnum } from '../../modules/hr/leave/enums/leave-record-status.enum';
import { ALLIANCE_COMPANY_NAME } from './company-structure.constants';

type LeaveTypeSeed = {
  name: string;
  code: string;
  max_days_per_year: number;
  is_paid: boolean;
  requires_attachment: boolean;
  is_carry_forward_allowed: boolean;
  max_carry_forward_days: number;
  gender_restriction: LeaveGenderRestrictionEnum;
};

const leaveTypeSeeds: LeaveTypeSeed[] = [
  {
    name: 'Annual Leave',
    code: 'ANNUAL',
    max_days_per_year: 28,
    is_paid: true,
    requires_attachment: false,
    is_carry_forward_allowed: true,
    max_carry_forward_days: 10,
    gender_restriction: LeaveGenderRestrictionEnum.ANY,
  },
  {
    name: 'Sick Leave',
    code: 'SICK',
    max_days_per_year: 12,
    is_paid: true,
    requires_attachment: true,
    is_carry_forward_allowed: false,
    max_carry_forward_days: 0,
    gender_restriction: LeaveGenderRestrictionEnum.ANY,
  },
  {
    name: 'Maternity Leave',
    code: 'MATERNITY',
    max_days_per_year: 84,
    is_paid: true,
    requires_attachment: true,
    is_carry_forward_allowed: false,
    max_carry_forward_days: 0,
    gender_restriction: LeaveGenderRestrictionEnum.FEMALE,
  },
  {
    name: 'Unpaid Leave',
    code: 'UNPAID',
    max_days_per_year: 365,
    is_paid: false,
    requires_attachment: false,
    is_carry_forward_allowed: false,
    max_carry_forward_days: 0,
    gender_restriction: LeaveGenderRestrictionEnum.ANY,
  },
  {
    name: 'Compassionate Leave',
    code: 'COMPASSIONATE',
    max_days_per_year: 7,
    is_paid: true,
    requires_attachment: false,
    is_carry_forward_allowed: false,
    max_carry_forward_days: 0,
    gender_restriction: LeaveGenderRestrictionEnum.ANY,
  },
];

export default class LeaveManagementSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void factoryManager;

    const manager = dataSource.manager;
    const companyRepo = manager.getRepository(Company);
    const leaveTypeRepo = manager.getRepository(LeaveType);
    const leavePolicyRepo = manager.getRepository(LeavePolicy);
    const leavePolicyTypeRepo = manager.getRepository(LeavePolicyType);
    const workflowRepo = manager.getRepository(LeaveApprovalWorkflow);
    const workflowStepRepo = manager.getRepository(LeaveApprovalWorkflowStep);
    const holidayRepo = manager.getRepository(Holiday);
    const companyUserRepo = manager.getRepository(CompanyUser);

    const companyName = process.env.DEFAULT_COMPANY_NAME ?? ALLIANCE_COMPANY_NAME;
    const company = await companyRepo.findOne({ where: { name: companyName } });

    if (!company) {
      console.warn(
        `Skip LeaveManagementSeeder: company "${companyName}" was not found`,
      );
      return;
    }

    const leaveTypesByCode = await this.ensureLeaveTypes(leaveTypeRepo, company.id);
    const policy = await this.ensurePolicy(
      leavePolicyRepo,
      leavePolicyTypeRepo,
      company.id,
      leaveTypesByCode,
    );
    await this.ensureDefaultWorkflow(
      workflowRepo,
      workflowStepRepo,
      companyUserRepo,
      company.id,
      leaveTypesByCode,
    );
    await this.ensureHolidays(holidayRepo, company.id);

    console.log(
      `Leave module seed completed for company "${company.name}" with policy "${policy.name}"`,
    );
  }

  private async ensureLeaveTypes(
    repository: Repository<LeaveType>,
    companyId: number,
  ): Promise<Map<string, LeaveType>> {
    const byCode = new Map<string, LeaveType>();

    for (const seed of leaveTypeSeeds) {
      const code = seed.code.trim().toUpperCase();
      let leaveType = await repository.findOne({
        where: {
          company_id: companyId,
          code,
        },
      });

      if (!leaveType) {
        leaveType = repository.create({
          company_id: companyId,
          name: seed.name,
          code,
        });
      }

      leaveType.description = seed.name;
      leaveType.is_paid = seed.is_paid;
      leaveType.requires_attachment = seed.requires_attachment;
      leaveType.is_carry_forward_allowed = seed.is_carry_forward_allowed;
      leaveType.max_carry_forward_days = seed.max_carry_forward_days.toFixed(2);
      leaveType.max_days_per_year = seed.max_days_per_year.toFixed(2);
      leaveType.gender_restriction = seed.gender_restriction;
      leaveType.status = LeaveRecordStatusEnum.ACTIVE;

      leaveType = await repository.save(leaveType);
      byCode.set(code, leaveType);
    }

    return byCode;
  }

  private async ensurePolicy(
    policyRepo: Repository<LeavePolicy>,
    policyTypeRepo: Repository<LeavePolicyType>,
    companyId: number,
    leaveTypesByCode: Map<string, LeaveType>,
  ): Promise<LeavePolicy> {
    let policy = await policyRepo.findOne({
      where: { company_id: companyId, name: 'General Leave Policy' },
      relations: { leave_types: true },
    });

    if (!policy) {
      policy = policyRepo.create({
        company_id: companyId,
        name: 'General Leave Policy',
      });
    }

    policy.description = 'Default leave policy for all employees';
    policy.accrual_method = LeaveAccrualMethodEnum.YEARLY;
    policy.accrual_rate = null;
    policy.max_consecutive_days = 30;
    policy.min_service_months = 0;
    policy.allow_negative_balance = false;
    policy.status = LeaveRecordStatusEnum.ACTIVE;
    policy = await policyRepo.save(policy);

    await policyTypeRepo.delete({ policy_id: policy.id });

    const annual = leaveTypesByCode.get('ANNUAL');
    const sick = leaveTypesByCode.get('SICK');
    const maternity = leaveTypesByCode.get('MATERNITY');
    const unpaid = leaveTypesByCode.get('UNPAID');
    const compassionate = leaveTypesByCode.get('COMPASSIONATE');
    const required = [annual, sick, maternity, unpaid, compassionate];
    if (required.some((item) => !item)) {
      throw new Error('Missing leave type while seeding default leave policy');
    }

    const policyTypes: Array<{
      leave_type_id: number;
      annual_quota_days: number;
      max_per_request_days: number;
      requires_approval: boolean;
    }> = [
      {
        leave_type_id: annual!.id,
        annual_quota_days: 28,
        max_per_request_days: 28,
        requires_approval: true,
      },
      {
        leave_type_id: sick!.id,
        annual_quota_days: 12,
        max_per_request_days: 10,
        requires_approval: true,
      },
      {
        leave_type_id: maternity!.id,
        annual_quota_days: 84,
        max_per_request_days: 84,
        requires_approval: true,
      },
      {
        leave_type_id: unpaid!.id,
        annual_quota_days: 365,
        max_per_request_days: 90,
        requires_approval: true,
      },
      {
        leave_type_id: compassionate!.id,
        annual_quota_days: 7,
        max_per_request_days: 7,
        requires_approval: true,
      },
    ];

    await policyTypeRepo.save(
      policyTypes.map((entry) =>
        policyTypeRepo.create({
          policy_id: policy.id,
          leave_type_id: entry.leave_type_id,
          annual_quota_days: entry.annual_quota_days.toFixed(2),
          max_per_request_days: entry.max_per_request_days.toFixed(2),
          requires_approval: entry.requires_approval,
        }),
      ),
    );

    return policy;
  }

  private async ensureDefaultWorkflow(
    workflowRepo: Repository<LeaveApprovalWorkflow>,
    workflowStepRepo: Repository<LeaveApprovalWorkflowStep>,
    companyUserRepo: Repository<CompanyUser>,
    companyId: number,
    leaveTypesByCode: Map<string, LeaveType>,
  ): Promise<void> {
    const defaultApprover = await companyUserRepo.findOne({
      where: { company_id: companyId, status: 'active' },
      order: { id: 'ASC' },
    });

    if (!defaultApprover) {
      console.warn(
        `Skip leave workflow seed for company ${companyId}: no active company user found`,
      );
      return;
    }

    await workflowRepo.update({ company_id: companyId, is_default: true }, { is_default: false });

    let workflow = await workflowRepo.findOne({
      where: {
        company_id: companyId,
        name: 'Default Leave Approval Workflow',
      },
    });

    if (!workflow) {
      workflow = workflowRepo.create({
        company_id: companyId,
        name: 'Default Leave Approval Workflow',
      });
    }

    workflow.leave_type_id = leaveTypesByCode.get('ANNUAL')?.id ?? null;
    workflow.is_default = true;
    workflow.status = LeaveRecordStatusEnum.ACTIVE;
    workflow = await workflowRepo.save(workflow);

    await workflowStepRepo.delete({ workflow_id: workflow.id });
    await workflowStepRepo.save([
      workflowStepRepo.create({
        workflow_id: workflow.id,
        approval_level: 1,
        approver_type: LeaveApproverTypeEnum.COMPANY_USER,
        company_user_id: defaultApprover.id,
        action_type: LeaveApprovalActionTypeEnum.RECOMMEND,
        is_required: true,
      }),
      workflowStepRepo.create({
        workflow_id: workflow.id,
        approval_level: 2,
        approver_type: LeaveApproverTypeEnum.COMPANY_USER,
        company_user_id: defaultApprover.id,
        action_type: LeaveApprovalActionTypeEnum.VERIFY,
        is_required: true,
      }),
      workflowStepRepo.create({
        workflow_id: workflow.id,
        approval_level: 3,
        approver_type: LeaveApproverTypeEnum.COMPANY_USER,
        company_user_id: defaultApprover.id,
        action_type: LeaveApprovalActionTypeEnum.APPROVE,
        is_required: true,
      }),
    ]);
  }

  private async ensureHolidays(
    repository: Repository<Holiday>,
    companyId: number,
  ): Promise<void> {
    const seeds = [
      {
        name: 'New Year',
        holiday_date: `${new Date().getUTCFullYear()}-01-01`,
        is_recurring: true,
      },
      {
        name: 'Labour Day',
        holiday_date: `${new Date().getUTCFullYear()}-05-01`,
        is_recurring: true,
      },
      {
        name: 'Union Day',
        holiday_date: `${new Date().getUTCFullYear()}-04-26`,
        is_recurring: true,
      },
    ];

    for (const seed of seeds) {
      const existing = await repository.findOne({
        where: {
          company_id: companyId,
          name: seed.name,
          holiday_date: seed.holiday_date,
        },
      });

      if (existing) {
        continue;
      }

      await repository.save(
        repository.create({
          company_id: companyId,
          name: seed.name,
          holiday_date: seed.holiday_date,
          is_recurring: seed.is_recurring,
        }),
      );
    }
  }
}
