import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { getRequestAuditContext } from '../../../common/request-context/request-context';
import { Employee } from '../employees/entities/employee.entity';
import { PayrollPeriod } from '../payroll/entities/payroll-configuration.entities';
import {
  EmployeePayrollResult,
  PayrollAuditLog,
  PayrollRun,
} from '../payroll/entities/payroll-run.entities';
import {
  EmploymentContract,
  EmploymentContractStatus,
} from './entities/employment-contract.entity';

export type PayrollContractWarning = {
  employee_id: number;
  employee_name: string;
  employee_no: string | null;
  code: 'NO_SIGNED_CONTRACT' | 'CONTRACT_EXPIRED' | 'CONTRACT_EXPIRING';
  message: string;
  contract_id: number | null;
  end_date: string | null;
};

const ACK_ACTION = 'payroll.run.contract_warnings_acknowledged';
const EXPIRING_DAYS = 30;

/**
 * Contract checks for a payroll run. They never block pay; they must be
 * acknowledged by HR (for the exact set of warnings) before the run locks.
 */
@Injectable()
export class ContractPayrollWarningsService {
  constructor(private readonly dataSource: DataSource) {}

  async warnings(companyId: number, runId: number) {
    const run = await this.dataSource
      .getRepository(PayrollRun)
      .findOneBy({ id: runId, companyId });
    if (!run) throw new NotFoundException('Payroll run not found');
    const period = await this.dataSource
      .getRepository(PayrollPeriod)
      .findOneByOrFail({ id: run.payrollPeriodId, companyId });
    const results = await this.dataSource
      .getRepository(EmployeePayrollResult)
      .find({ where: { companyId, payrollRunId: runId } });
    const employeeIds = [...new Set(results.map((row) => row.employeeId))];
    const warnings: PayrollContractWarning[] = [];
    if (employeeIds.length) {
      const [employees, contracts] = await Promise.all([
        this.dataSource
          .getRepository(Employee)
          .createQueryBuilder('e')
          .where('e.company_id = :companyId AND e.id IN (:...ids)', {
            companyId,
            ids: employeeIds,
          })
          .getMany(),
        this.dataSource
          .getRepository(EmploymentContract)
          .createQueryBuilder('c')
          .where('c.companyId = :companyId AND c.employeeId IN (:...ids)', {
            companyId,
            ids: employeeIds,
          })
          .andWhere('c.status = :signed', {
            signed: EmploymentContractStatus.SIGNED,
          })
          .orderBy('c.version', 'DESC')
          .getMany(),
      ]);
      const horizon = new Date(`${period.endDate}T00:00:00Z`);
      horizon.setUTCDate(horizon.getUTCDate() + EXPIRING_DAYS);
      const expiringBy = horizon.toISOString().slice(0, 10);
      for (const employee of employees.sort((a, b) => a.id - b.id)) {
        const contract = contracts.find(
          (row) => row.employeeId === employee.id,
        );
        const base = {
          employee_id: employee.id,
          employee_name: `${employee.first_name} ${employee.last_name}`.trim(),
          employee_no: employee.employee_no ?? null,
          contract_id: contract?.id ?? null,
          end_date: contract?.endDate ?? null,
        };
        if (!contract)
          warnings.push({
            ...base,
            code: 'NO_SIGNED_CONTRACT',
            message: 'No signed employment contract',
          });
        else if (contract.endDate && contract.endDate < period.endDate)
          warnings.push({
            ...base,
            code: 'CONTRACT_EXPIRED',
            message: `Contract ${contract.referenceNo} ended on ${contract.endDate}, before this period ends`,
          });
        else if (contract.endDate && contract.endDate <= expiringBy)
          warnings.push({
            ...base,
            code: 'CONTRACT_EXPIRING',
            message: `Contract ${contract.referenceNo} ends on ${contract.endDate}`,
          });
      }
    }
    const hash = createHash('sha256')
      .update(
        JSON.stringify(
          warnings.map((w) => [
            w.employee_id,
            w.code,
            w.contract_id,
            w.end_date,
          ]),
        ),
      )
      .digest('hex');
    const acknowledgement = warnings.length
      ? await this.dataSource.getRepository(PayrollAuditLog).findOne({
          where: {
            companyId,
            action: ACK_ACTION,
            entityType: 'PAYROLL_RUN',
            entityId: String(runId),
          },
          order: { id: 'DESC' },
        })
      : null;
    const acknowledged =
      !warnings.length ||
      (acknowledgement?.summary as Record<string, unknown> | null)
        ?.warnings_hash === hash;
    return {
      payroll_run_id: runId,
      period_end_date: period.endDate,
      warnings,
      warnings_hash: hash,
      acknowledged,
      acknowledged_at: acknowledged
        ? (acknowledgement?.createdAt ?? null)
        : null,
      acknowledged_by_company_user_id: acknowledged
        ? (acknowledgement?.actorCompanyUserId ?? null)
        : null,
    };
  }

  async acknowledge(
    actor: AuthenticatedUser,
    companyId: number,
    runId: number,
    warningsHash: string,
    note?: string,
  ) {
    const current = await this.warnings(companyId, runId);
    if (current.warnings_hash !== warningsHash)
      throw new ConflictException(
        'The contract warnings changed. Review the current list and acknowledge again.',
      );
    if (!current.warnings.length) return current;
    const repository = this.dataSource.getRepository(PayrollAuditLog);
    await repository.save(
      repository.create({
        companyId,
        actorCompanyUserId: actor.companyMembershipId ?? null,
        action: ACK_ACTION,
        entityType: 'PAYROLL_RUN',
        entityId: String(runId),
        summary: {
          warnings_hash: warningsHash,
          count: current.warnings.length,
          note: note?.trim() || null,
        },
        beforeValues: null,
        afterValues: {
          warnings: current.warnings.map((w) => ({
            employee_id: w.employee_id,
            code: w.code,
            contract_id: w.contract_id,
          })),
        },
        ipAddress: getRequestAuditContext().ipAddress?.slice(0, 64) ?? null,
      }),
    );
    return this.warnings(companyId, runId);
  }

  /** Called by payroll before locking a run. */
  async assertAcknowledged(companyId: number, runId: number) {
    const current = await this.warnings(companyId, runId);
    if (!current.acknowledged)
      throw new ConflictException({
        message: `${current.warnings.length} employee contract warning(s) must be acknowledged by HR before this payroll run can be locked.`,
        code: 'CONTRACT_WARNINGS_UNACKNOWLEDGED',
        warnings_hash: current.warnings_hash,
      });
  }
}
