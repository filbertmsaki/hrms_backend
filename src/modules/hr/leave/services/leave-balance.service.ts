import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { LeaveRecordStatusEnum } from '../enums/leave-record-status.enum';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { LeavePolicy } from '../entities/leave-policy.entity';
import { LeaveType } from '../entities/leave-type.entity';

@Injectable()
export class LeaveBalanceService {
  constructor(
    @InjectRepository(LeaveBalance)
    private readonly leaveBalanceRepository: Repository<LeaveBalance>,
    @InjectRepository(LeaveType)
    private readonly leaveTypeRepository: Repository<LeaveType>,
    @InjectRepository(LeavePolicy)
    private readonly leavePolicyRepository: Repository<LeavePolicy>,
  ) {}

  private getBalanceRepository(manager?: EntityManager): Repository<LeaveBalance> {
    return manager?.getRepository(LeaveBalance) ?? this.leaveBalanceRepository;
  }

  private getLeaveTypeRepository(manager?: EntityManager): Repository<LeaveType> {
    return manager?.getRepository(LeaveType) ?? this.leaveTypeRepository;
  }

  private getLeavePolicyRepository(manager?: EntityManager): Repository<LeavePolicy> {
    return manager?.getRepository(LeavePolicy) ?? this.leavePolicyRepository;
  }

  toNumber(value: string | number | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }

    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  toDecimal(value: number): string {
    return value.toFixed(2);
  }

  getFiscalYearFromDate(date: string | Date): string {
    const source = typeof date === 'string' ? new Date(date) : date;
    return String(source.getUTCFullYear());
  }

  private getPreviousFiscalYear(fiscalYear: string): string | null {
    const parsed = Number(fiscalYear);
    if (!Number.isInteger(parsed)) {
      return null;
    }

    return String(parsed - 1);
  }

  private calculatePolicyPriority(
    policy: LeavePolicy,
    employee: Pick<Employee, 'primary_department_id' | 'primary_position_id'>,
  ): number {
    const departmentMatch =
      policy.applicable_department_id !== null &&
      policy.applicable_department_id === employee.primary_department_id;
    const positionMatch =
      policy.applicable_position_id !== null &&
      policy.applicable_position_id === employee.primary_position_id;

    if (departmentMatch && positionMatch) {
      return 4;
    }
    if (positionMatch) {
      return 3;
    }
    if (departmentMatch) {
      return 2;
    }
    if (
      policy.applicable_department_id === null &&
      policy.applicable_position_id === null
    ) {
      return 1;
    }

    return 0;
  }

  private async resolvePolicyQuota(
    companyId: number,
    employee: Pick<Employee, 'primary_department_id' | 'primary_position_id'>,
    leaveTypeId: number,
    manager?: EntityManager,
  ): Promise<{ annualQuotaDays: number } | null> {
    const repository = this.getLeavePolicyRepository(manager);
    const policies = await repository.find({
      where: {
        company_id: companyId,
        status: LeaveRecordStatusEnum.ACTIVE,
      },
      relations: {
        leave_types: true,
      },
    });

    let chosen:
      | {
          priority: number;
          annualQuotaDays: number;
        }
      | null = null;

    for (const policy of policies) {
      const policyType = policy.leave_types.find(
        (item) => item.leave_type_id === leaveTypeId,
      );
      if (!policyType) {
        continue;
      }

      const priority = this.calculatePolicyPriority(policy, employee);
      if (!priority) {
        continue;
      }

      const annualQuotaDays = this.toNumber(policyType.annual_quota_days);
      if (!chosen || priority > chosen.priority) {
        chosen = {
          priority,
          annualQuotaDays,
        };
      }
    }

    return chosen ? { annualQuotaDays: chosen.annualQuotaDays } : null;
  }

  async ensureBalanceForEmployee(
    companyId: number,
    employee: Pick<
      Employee,
      'id' | 'primary_department_id' | 'primary_position_id'
    >,
    leaveTypeId: number,
    fiscalYear: string,
    manager?: EntityManager,
  ): Promise<LeaveBalance> {
    const leaveTypeRepository = this.getLeaveTypeRepository(manager);
    const balanceRepository = this.getBalanceRepository(manager);

    const leaveType = await leaveTypeRepository.findOne({
      where: {
        id: leaveTypeId,
        company_id: companyId,
      },
    });

    if (!leaveType) {
      throw new NotFoundException('Leave type not found');
    }

    let balance = await balanceRepository.findOne({
      where: {
        employee_id: employee.id,
        leave_type_id: leaveTypeId,
        fiscal_year: fiscalYear,
      },
    });

    if (balance) {
      return balance;
    }

    const policyQuota = await this.resolvePolicyQuota(
      companyId,
      employee,
      leaveTypeId,
      manager,
    );
    const defaultQuota = this.toNumber(leaveType.max_days_per_year);
    const allocatedDays = policyQuota?.annualQuotaDays ?? defaultQuota;

    let carriedForwardDays = 0;
    if (leaveType.is_carry_forward_allowed) {
      const previousFiscalYear = this.getPreviousFiscalYear(fiscalYear);
      if (previousFiscalYear) {
        const previousBalance = await balanceRepository.findOne({
          where: {
            employee_id: employee.id,
            leave_type_id: leaveTypeId,
            fiscal_year: previousFiscalYear,
          },
        });

        if (previousBalance) {
          const remaining =
            this.toNumber(previousBalance.allocated_days) +
            this.toNumber(previousBalance.carried_forward_days) -
            this.toNumber(previousBalance.used_days) -
            this.toNumber(previousBalance.expired_days);

          carriedForwardDays = Math.max(
            0,
            Math.min(remaining, this.toNumber(leaveType.max_carry_forward_days)),
          );
        }
      }
    }

    balance = await balanceRepository.save(
      balanceRepository.create({
        employee_id: employee.id,
        leave_type_id: leaveTypeId,
        fiscal_year: fiscalYear,
        allocated_days: this.toDecimal(allocatedDays),
        used_days: this.toDecimal(0),
        pending_days: this.toDecimal(0),
        carried_forward_days: this.toDecimal(carriedForwardDays),
        expired_days: this.toDecimal(0),
      }),
    );

    return balance;
  }

  calculateAvailableDays(balance: LeaveBalance): number {
    return (
      this.toNumber(balance.allocated_days) +
      this.toNumber(balance.carried_forward_days) -
      this.toNumber(balance.used_days) -
      this.toNumber(balance.pending_days) -
      this.toNumber(balance.expired_days)
    );
  }

  async reserveDays(
    balance: LeaveBalance,
    days: number,
    allowNegativeBalance: boolean,
    manager?: EntityManager,
  ): Promise<LeaveBalance> {
    if (days <= 0) {
      throw new BadRequestException('Leave days must be greater than zero');
    }

    const available = this.calculateAvailableDays(balance);
    if (!allowNegativeBalance && available < days) {
      throw new BadRequestException(
        `Insufficient leave balance. Available: ${available.toFixed(2)} day(s)`,
      );
    }

    balance.pending_days = this.toDecimal(
      this.toNumber(balance.pending_days) + days,
    );

    return this.getBalanceRepository(manager).save(balance);
  }

  async releaseReservedDays(
    balance: LeaveBalance,
    days: number,
    manager?: EntityManager,
  ): Promise<LeaveBalance> {
    const pending = this.toNumber(balance.pending_days);
    balance.pending_days = this.toDecimal(Math.max(0, pending - days));
    return this.getBalanceRepository(manager).save(balance);
  }

  async consumeReservedDays(
    balance: LeaveBalance,
    days: number,
    manager?: EntityManager,
  ): Promise<LeaveBalance> {
    const pending = this.toNumber(balance.pending_days);
    const used = this.toNumber(balance.used_days);

    balance.pending_days = this.toDecimal(Math.max(0, pending - days));
    balance.used_days = this.toDecimal(used + days);

    return this.getBalanceRepository(manager).save(balance);
  }

  async overwriteBalance(
    balance: LeaveBalance,
    values: {
      allocated_days: number;
      carried_forward_days: number;
      expired_days: number;
    },
    manager?: EntityManager,
  ): Promise<LeaveBalance> {
    balance.allocated_days = this.toDecimal(values.allocated_days);
    balance.carried_forward_days = this.toDecimal(values.carried_forward_days);
    balance.expired_days = this.toDecimal(values.expired_days);
    return this.getBalanceRepository(manager).save(balance);
  }
}
