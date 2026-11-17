import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { EmployeeCompensationVersion } from '../../employee-movements/entities/employee-compensation-version.entity';
import { EmployeePayrollProfile } from '../../payroll/entities/employee-payroll-profile.entity';
import { LeavePolicyType } from '../entities/leave-policy-type.entity';

export type LeaveEncashmentCalculation = {
  salary_basis: 'basic' | 'gross';
  salary_amount: number;
  currency: string;
  rate_divisor: number;
  daily_rate: number;
  days: number;
  amount: number;
  compensation_version_id: number;
  as_of: string;
};

const round = (value: number, places: number) =>
  Math.round(value * 10 ** places) / 10 ** places;

/**
 * Encashment amount from the applicable policy: the employee's salary on the
 * configured basis (basic, or gross = basic + recurring component amounts)
 * divided by the policy's rate divisor, times the encashed days. Nothing is
 * guessed: a missing divisor, salary or currency is an error to fix.
 */
@Injectable()
export class LeaveEncashmentCalculatorService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async calculate(
    params: {
      companyId: number;
      employeeId: number;
      policyType: Pick<
        LeavePolicyType,
        'encashment_rate_divisor' | 'encashment_salary_basis'
      >;
      days: number;
      asOf: string;
    },
    manager?: EntityManager,
  ): Promise<LeaveEncashmentCalculation> {
    const em = manager ?? this.dataSource.manager;
    const divisor = Number(params.policyType.encashment_rate_divisor);
    if (!Number.isFinite(divisor) || divisor <= 0) {
      throw new BadRequestException(
        'Configure the encashment rate divisor on the leave policy before encashing.',
      );
    }
    if (!Number.isFinite(params.days) || params.days <= 0) {
      throw new BadRequestException('Encashed days must be greater than zero.');
    }
    const compensation = await em
      .getRepository(EmployeeCompensationVersion)
      .createQueryBuilder('version')
      .where('version.companyId = :companyId', { companyId: params.companyId })
      .andWhere('version.employeeId = :employeeId', {
        employeeId: params.employeeId,
      })
      .andWhere("version.status IN ('ACTIVE','SUPERSEDED')")
      .andWhere('version.effectiveFrom <= :asOf', { asOf: params.asOf })
      .andWhere(
        '(version.effectiveTo IS NULL OR version.effectiveTo >= :asOf)',
        {
          asOf: params.asOf,
        },
      )
      .orderBy('version.effectiveFrom', 'DESC')
      .addOrderBy('version.id', 'DESC')
      .getOne();
    if (!compensation) {
      throw new BadRequestException(
        `No effective compensation version on ${params.asOf}; the encashment amount cannot be calculated.`,
      );
    }
    const profile = await em.getRepository(EmployeePayrollProfile).findOne({
      where: { companyId: params.companyId, employeeId: params.employeeId },
    });
    if (profile?.currency && profile.currency !== compensation.currency) {
      throw new BadRequestException(
        'Compensation and payroll profile currencies differ; fix them before encashing.',
      );
    }
    const basis = params.policyType.encashment_salary_basis ?? 'basic';
    let salary = Number(compensation.baseSalary);
    if (basis === 'gross') {
      for (const override of Object.values(
        compensation.componentOverrides ?? {},
      )) {
        if (!override?.excluded && override?.amount) {
          salary += Number(override.amount);
        }
      }
    }
    const dailyRate = salary / divisor;
    return {
      salary_basis: basis,
      salary_amount: round(salary, 2),
      currency: compensation.currency,
      rate_divisor: divisor,
      daily_rate: round(dailyRate, 4),
      days: params.days,
      amount: round(dailyRate * params.days, 2),
      compensation_version_id: compensation.id,
      as_of: params.asOf,
    };
  }
}
