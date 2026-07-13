import { DataSource, Repository } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { AttendanceDailySummary } from '../../modules/hr/attendance/processing/entities/attendance-daily-summary.entity';
import { Employee } from '../../modules/hr/employees/entities/employee.entity';
import { LeaveBalanceAdjustment } from '../../modules/hr/leave/entities/leave-balance-adjustment.entity';
import { LeaveBalance } from '../../modules/hr/leave/entities/leave-balance.entity';
import { LeaveBalanceTransaction } from '../../modules/hr/leave/entities/leave-balance-transaction.entity';
import { LeavePolicy } from '../../modules/hr/leave/entities/leave-policy.entity';
import { LeaveRequest } from '../../modules/hr/leave/entities/leave-request.entity';
import { LeaveType } from '../../modules/hr/leave/entities/leave-type.entity';
import { LeaveBalanceTransactionTypeEnum } from '../../modules/hr/leave/enums/leave-balance-transaction-type.enum';
import { LeaveAuditService } from '../../modules/hr/leave/services/leave-audit.service';
import { LeaveBalanceService } from '../../modules/hr/leave/services/leave-balance.service';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

const SEEDER_NAME = '036-leave-balances';

export default class LeaveBalancesSeeder implements Seeder {
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
      const balanceRepo = qr.manager.getRepository(LeaveBalance);
      const transactionRepo = qr.manager.getRepository(LeaveBalanceTransaction);

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

      const leaveBalanceService = new LeaveBalanceService(
        qr.manager.getRepository(LeaveBalance),
        qr.manager.getRepository(LeaveType),
        qr.manager.getRepository(LeavePolicy),
        qr.manager.getRepository(LeaveRequest),
        qr.manager.getRepository(Employee),
        qr.manager.getRepository(AttendanceDailySummary),
        qr.manager.getRepository(LeaveBalanceAdjustment),
        { log: () => undefined } as unknown as LeaveAuditService,
      );

      const fiscalYear = leaveBalanceService.normalizeFiscalYear(
        process.env.LEAVE_BALANCE_SEED_FISCAL_YEAR?.trim() ??
          String(new Date().getUTCFullYear()),
      );

      const generationResult =
        await leaveBalanceService.generateBalancesForCompany(
          company.id,
          fiscalYear,
          {},
          qr.manager,
        );

      const balances = await balanceRepo.find({
        where: {
          company_id: company.id,
          fiscal_year: fiscalYear,
        },
      });

      let seededTransactions = 0;

      for (const balance of balances) {
        const seededBalance = await this.ensureBalanceMetadata(
          balanceRepo,
          company.id,
          fiscalYear,
          balance,
        );

        const idempotencyKey = `seeded-balance:${seededBalance.id}:initial`;
        let transaction = await transactionRepo.findOne({
          where: {
            company_id: company.id,
            idempotency_key: idempotencyKey,
          },
        });

        if (!transaction) {
          const availableDays =
            leaveBalanceService.calculateAvailableDays(seededBalance);

          transaction = await transactionRepo.save(
            transactionRepo.create({
              company_id: company.id,
              employee_id: seededBalance.employee_id,
              leave_type_id: seededBalance.leave_type_id,
              leave_balance_id: seededBalance.id,
              transaction_type:
                LeaveBalanceTransactionTypeEnum.INITIAL_ALLOCATION,
              leave_year: fiscalYear,
              effective_date:
                seededBalance.generated_at?.toISOString().slice(0, 10) ??
                seededBalance.leave_year_start_date ??
                `${fiscalYear}-01-01`,
              previous_balance_days: '0.00',
              amount_days: leaveBalanceService.toDecimal(availableDays),
              new_balance_days: leaveBalanceService.toDecimal(availableDays),
              previous_pending_days: '0.00',
              pending_delta_days: seededBalance.pending_days ?? '0.00',
              new_pending_days: seededBalance.pending_days ?? '0.00',
              previous_used_days: '0.00',
              used_delta_days: seededBalance.used_days ?? '0.00',
              new_used_days: seededBalance.used_days ?? '0.00',
              reason: 'Seeded initial leave balance allocation',
              idempotency_key: idempotencyKey,
              metadata: {
                source: 'seeder',
                seeder: SEEDER_NAME,
                leave_balance_id: seededBalance.id,
              },
              created_at: seededBalance.generated_at ?? new Date(),
            }),
          );
          seededTransactions++;
        }

        if (!seededBalance.last_transaction_id) {
          seededBalance.last_transaction_id = transaction.id;
          seededBalance.version = seededBalance.version ?? 1;
          await balanceRepo.save(seededBalance);
        }
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][LeaveBalances] Ensured ${balances.length} balance(s) and ${seededTransactions} initial ledger transaction(s) for fiscal year ${fiscalYear}`,
      );
      console.log(
        `[Seeder][LeaveBalances] Generation summary: ${generationResult.processed_employees} employee(s), ${generationResult.generated_balances} balance(s)`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][LeaveBalances] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }

  private async ensureBalanceMetadata(
    balanceRepo: Repository<LeaveBalance>,
    companyId: number,
    fiscalYear: string,
    balance: LeaveBalance,
  ): Promise<LeaveBalance> {
    const nextStartDate = `${fiscalYear}-01-01`;
    const nextEndDate = `${fiscalYear}-12-31`;
    let changed = false;

    if (balance.company_id !== companyId) {
      balance.company_id = companyId;
      changed = true;
    }
    if (!balance.leave_year_start_date) {
      balance.leave_year_start_date = nextStartDate;
      changed = true;
    }
    if (!balance.leave_year_end_date) {
      balance.leave_year_end_date = nextEndDate;
      changed = true;
    }
    if (!balance.generated_at) {
      balance.generated_at = new Date();
      changed = true;
    }
    if (!balance.version) {
      balance.version = 1;
      changed = true;
    }

    return changed ? balanceRepo.save(balance) : balance;
  }
}
