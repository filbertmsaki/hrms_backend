import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { LeaveBalanceService } from './leave-balance.service';

@Injectable()
export class LeaveBalanceCronService implements OnModuleInit {
  private readonly logger = new Logger(LeaveBalanceCronService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly leaveBalanceService: LeaveBalanceService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const appEnv =
      this.configService.get<string>('APP_ENV') ??
      this.configService.get<string>('NODE_ENV');

    if (appEnv === 'test') {
      this.logger.log(
        'Skipping startup leave balance generation in test environment',
      );
      return;
    }

    await this.generateCurrentYearBalancesForAllCompanies('startup');
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async generateCurrentYearBalances(): Promise<void> {
    await this.generateCurrentYearBalancesForAllCompanies('daily-cron');
  }

  private async generateCurrentYearBalancesForAllCompanies(
    trigger: 'startup' | 'daily-cron',
  ): Promise<void> {
    const fiscalYear = this.leaveBalanceService.getFiscalYearFromDate(
      new Date(),
    );
    const companies = await this.companyRepository.find({
      select: ['id', 'name'],
    });

    for (const company of companies) {
      try {
        const result =
          await this.leaveBalanceService.generateBalancesForCompany(
            company.id,
            fiscalYear,
          );
        this.logger.log(
          `Generated ${result.generated_balances} leave balances for company ${company.id} (${company.name}) in fiscal year ${fiscalYear} via ${trigger}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed generating leave balances for company ${company.id} (${company.name}) via ${trigger}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }
}
