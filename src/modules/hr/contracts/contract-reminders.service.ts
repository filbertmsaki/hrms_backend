import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import {
  ContractExitService,
  EXITED_EMPLOYMENT_STATUSES,
  todayInTanzania,
} from './contract-exit.service';
import { ContractNotifierService } from './contract-notifier.service';
import { ContractSignatory } from './entities/contract-signatory.entity';
import {
  EmploymentContract,
  EmploymentContractStatus,
} from './entities/employment-contract.entity';

/** Alert windows before the end date; 0 = on the day it expires. */
export const EXPIRY_WINDOWS = [60, 30, 7, 0] as const;
/** Days without action before an unsigned contract is chased. */
export const UNSIGNED_REMINDER_DAYS = [2, 5] as const;

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

export function expiryWindow(remainingDays: number): number | null {
  if (remainingDays < 0 || remainingDays > 60) return null;
  if (remainingDays === 0) return 0;
  if (remainingDays <= 7) return 7;
  if (remainingDays <= 30) return 30;
  return 60;
}

@Injectable()
export class ContractRemindersService {
  private readonly logger = new Logger(ContractRemindersService.name);

  constructor(
    @InjectRepository(EmploymentContract)
    private readonly contracts: Repository<EmploymentContract>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(ContractSignatory)
    private readonly signatories: Repository<ContractSignatory>,
    private readonly notifier: ContractNotifierService,
    private readonly exits: ContractExitService,
  ) {}

  @Cron('0 0 8 * * *', { timeZone: 'Africa/Dar_es_Salaam' })
  async runDaily() {
    const today = todayInTanzania();
    for (const [name, job] of [
      ['scheduled exits', () => this.exits.closeScheduledEnds(today)],
      ['expiry alerts', () => this.notifyExpiring(today)],
      ['unsigned reminders', () => this.remindUnsigned(today)],
    ] as const) {
      try {
        await job();
      } catch (error) {
        this.logger.error(
          `Contract ${name} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /** HR (the issuer) and the line manager, at 60/30/7 days and on expiry. */
  async notifyExpiring(today = todayInTanzania()) {
    const through = new Date(`${today}T00:00:00Z`);
    through.setUTCDate(through.getUTCDate() + 60);
    const contracts = await this.contracts
      .createQueryBuilder('contract')
      .innerJoin(
        Employee,
        'employee',
        'employee.id = contract.employeeId AND employee.company_id = contract.companyId',
      )
      .where('contract.status = :status', {
        status: EmploymentContractStatus.SIGNED,
      })
      .andWhere('contract.endedAt IS NULL')
      .andWhere('contract.endDate BETWEEN :today AND :through', {
        today,
        through: through.toISOString().slice(0, 10),
      })
      // Never alert about people who have left or are leaving.
      .andWhere('employee.employment_status NOT IN (:...exited)', {
        exited: EXITED_EMPLOYMENT_STATUSES,
      })
      .andWhere('(employee.exit_date IS NULL OR employee.exit_date > :today)', {
        today,
      })
      .getMany();
    let sent = 0;
    for (const contract of contracts) {
      const window = expiryWindow(daysBetween(today, contract.endDate!));
      if (window === null) continue;
      const employee = await this.employees.findOneBy({
        id: contract.employeeId,
        company_id: contract.companyId,
      });
      if (!employee) continue;
      const manager = employee.reports_to
        ? await this.employees.findOneBy({
            id: employee.reports_to,
            company_id: contract.companyId,
          })
        : null;
      const recipients = new Set(
        [contract.issuedByCompanyUserId, manager?.company_user_id].filter(
          (id): id is number => typeof id === 'number' && id > 0,
        ),
      );
      const name = `${employee.first_name} ${employee.last_name}`.trim();
      for (const receiver of recipients) {
        const created = await this.notifier.notify({
          companyId: contract.companyId,
          receiverCompanyUserId: receiver,
          contractId: contract.id,
          title:
            window === 0
              ? 'Employment contract expires today'
              : `Employment contract expires in ${window} days or less`,
          message:
            window === 0
              ? `${name}'s contract ${contract.referenceNo} ends today (${contract.endDate}). Renew it or start offboarding.`
              : `${name}'s contract ${contract.referenceNo} ends on ${contract.endDate}. Plan a renewal or exit.`,
          actionUrl: `/dashboard/employees/contracts/${contract.id}`,
          dedupeKey: `contract:expiry:${contract.id}:${window}:${receiver}`,
          metadata: { window_days: window, employee_id: employee.id },
        });
        if (created) sent += 1;
      }
    }
    return sent;
  }

  /** Chase whoever must act next on a contract left unsigned. */
  async remindUnsigned(today = todayInTanzania()) {
    const pending = await this.contracts.find({
      where: {
        status: In([
          EmploymentContractStatus.PENDING_HR_SIGNATURE,
          EmploymentContractStatus.PENDING_EMPLOYEE_SIGNATURE,
          EmploymentContractStatus.PENDING_VERIFICATION,
        ]),
      },
    });
    let sent = 0;
    for (const contract of pending) {
      const waiting = daysBetween(
        contract.updatedAt.toISOString().slice(0, 10),
        today,
      );
      const step = [...UNSIGNED_REMINDER_DAYS]
        .reverse()
        .find((days) => waiting >= days);
      if (!step) continue;
      const employee = await this.employees.findOneBy({
        id: contract.employeeId,
        company_id: contract.companyId,
      });
      if (
        !employee ||
        EXITED_EMPLOYMENT_STATUSES.includes(employee.employment_status)
      )
        continue;
      let receiver: number | null = null;
      let title = '';
      let actionUrl = `/dashboard/employees/contracts/${contract.id}`;
      if (contract.status === EmploymentContractStatus.PENDING_HR_SIGNATURE) {
        const signatory = contract.assignedSignatoryId
          ? await this.signatories.findOneBy({
              id: contract.assignedSignatoryId,
            })
          : null;
        const signer = signatory
          ? await this.employees.findOneBy({ id: signatory.employeeId })
          : null;
        receiver = signer?.company_user_id ?? contract.issuedByCompanyUserId;
        title = 'Reminder: contract awaiting the company signature';
        actionUrl = `/dashboard/me/contracts/${contract.id}`;
      } else if (
        contract.status === EmploymentContractStatus.PENDING_EMPLOYEE_SIGNATURE
      ) {
        receiver = employee.company_user_id;
        title = 'Reminder: please sign your employment contract';
        actionUrl = `/dashboard/me/contracts/${contract.id}`;
      } else {
        receiver = contract.issuedByCompanyUserId;
        title = 'Reminder: signed contract upload awaiting verification';
      }
      if (!receiver) continue;
      const created = await this.notifier.notify({
        companyId: contract.companyId,
        receiverCompanyUserId: receiver,
        contractId: contract.id,
        title,
        message: `Employment contract ${contract.referenceNo} has been waiting ${waiting} days.`,
        actionUrl,
        dedupeKey: `contract:unsigned:${contract.id}:${contract.status}:${step}:${contract.updatedAt.getTime()}`,
      });
      if (created) sent += 1;
    }
    return sent;
  }
}
