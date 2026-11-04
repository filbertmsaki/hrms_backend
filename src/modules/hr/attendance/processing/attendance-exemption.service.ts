import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { findPayrollLockedThroughDate } from './attendance-payroll-lock.util';
import { formatDateOnly } from '../../shared/hr.utils';
import { AttendanceRecalculationService } from './attendance-recalculation.service';
import {
  AttendanceRefreshExecutionModeEnum,
  AttendanceRefreshModeEnum,
} from './dtos/refresh-attendance-daily-summaries.dto';
import {
  QueryAttendanceExemptionCandidatesDto,
  UpdateAttendanceExemptionsDto,
} from './dtos/update-attendance-exemptions.dto';

const TRACKABLE_EMPLOYMENT_STATUSES = [
  EmploymentStatusEnum.ONBOARDING,
  EmploymentStatusEnum.ACTIVE,
  EmploymentStatusEnum.SUSPENDED,
];

type ExemptionRow = {
  employee_id: number;
  employee_no: string;
  employee_name: string;
  attendance_exempt_from: string | null;
  attendance_exempt_reason: string | null;
  absent_days: number;
};

@Injectable()
export class AttendanceExemptionService {
  private readonly logger = new Logger(AttendanceExemptionService.name);

  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private readonly recalculationService: AttendanceRecalculationService,
  ) {}

  async listExempt(companyId: number): Promise<ExemptionRow[]> {
    return this.baseQuery(companyId, 30)
      .andWhere('employee.attendance_exempt_from IS NOT NULL')
      .getRawMany<ExemptionRow>();
  }

  // Suggestions only: employees still tracked who have no device assignment
  // and have not punched (device or mobile) for the given number of days.
  async listCandidates(
    companyId: number,
    query: QueryAttendanceExemptionCandidatesDto,
  ): Promise<ExemptionRow[]> {
    const inactiveDays = query.inactive_days ?? 30;

    return this.baseQuery(companyId, inactiveDays)
      .andWhere('employee.attendance_exempt_from IS NULL')
      .andWhere('employee.employment_status IN (:...statuses)', {
        statuses: TRACKABLE_EMPLOYMENT_STATUSES,
      })
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM employee_device_assignments assignment
          WHERE assignment.employee_id = employee.id
            AND assignment.deleted_at IS NULL
        )`,
      )
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM attendance_processed_events event
          WHERE event.employee_id = employee.id
            AND event.attendance_date >= :since
        )`,
      )
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM attendance_mobile_punches punch
          WHERE punch.employee_id = employee.id
            AND punch.attendance_date >= :since
        )`,
      )
      .getRawMany<ExemptionRow>();
  }

  async updateExemptions(
    companyId: number,
    requestedByCompanyUserId: number | null,
    dto: UpdateAttendanceExemptionsDto,
  ) {
    const employeeIds = [...new Set(dto.employee_ids)];
    const employees = await this.employeeRepository.find({
      where: { id: In(employeeIds), company_id: companyId },
      select: { id: true, attendance_exempt_from: true },
    });
    if (employees.length !== employeeIds.length) {
      throw new BadRequestException(
        'One or more employees were not found in this company.',
      );
    }

    // Attendance inside a closed payroll period has already been paid on, so
    // an exemption may neither start nor be recalculated there. Each
    // employee is checked against their own payroll calendar.
    const today = formatDateOnly(new Date());
    const lockedThroughByEmployee = new Map<number, string | null>();
    for (const employee of employees) {
      const lockedThrough = await findPayrollLockedThroughDate(
        this.employeeRepository.manager,
        companyId,
        employee.id,
        today,
      );
      lockedThroughByEmployee.set(employee.id, lockedThrough);
      if (!lockedThrough) continue;

      for (const [label, value] of [
        ['Exempt from', dto.exempt_from],
        ['Recalculate from', dto.recalculate_from],
      ] as const) {
        if (value && value <= lockedThrough) {
          throw new BadRequestException(
            `${label} date ${value} falls in a closed payroll period for employee #${employee.id}. Choose a date after ${lockedThrough}.`,
          );
        }
      }
    }

    const reason = dto.exempt_from ? dto.reason?.trim() || null : null;

    await this.employeeRepository.update(
      { id: In(employeeIds), company_id: companyId },
      {
        attendance_exempt_from: dto.exempt_from,
        attendance_exempt_reason: reason,
      },
    );

    const jobs: Array<{ employee_id: number; job_id: number | null }> = [];
    for (const employee of employees) {
      // Clearing an old exemption only recalculates the open part of it.
      const lockedThrough = lockedThroughByEmployee.get(employee.id) ?? null;
      const startDate = this.laterDate(
        dto.recalculate_from ??
          dto.exempt_from ??
          employee.attendance_exempt_from,
        lockedThrough ? this.nextDate(lockedThrough) : null,
      );
      if (!startDate || startDate > today) {
        jobs.push({ employee_id: employee.id, job_id: null });
        continue;
      }

      try {
        const { job } = await this.recalculationService.refreshSummaries(
          companyId,
          requestedByCompanyUserId,
          {
            start_date: startDate,
            end_date: today,
            employee_id: employee.id,
            mode: AttendanceRefreshModeEnum.SUMMARIES_ONLY,
            execution_mode: AttendanceRefreshExecutionModeEnum.BACKGROUND,
          },
        );
        jobs.push({ employee_id: employee.id, job_id: job?.id ?? null });
      } catch (error) {
        this.logger.error(
          `Failed to queue attendance recalculation for employee ${employee.id}`,
          error instanceof Error ? error.stack : String(error),
        );
        jobs.push({ employee_id: employee.id, job_id: null });
      }
    }

    return {
      updated: employeeIds.length,
      exempt_from: dto.exempt_from,
      recalculation_jobs: jobs,
    };
  }

  private laterDate(value: string | null, floor: string | null) {
    if (!value || !floor) return value;
    return value > floor ? value : floor;
  }

  private nextDate(value: string): string {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }

  private baseQuery(companyId: number, inactiveDays: number) {
    const since = new Date();
    since.setDate(since.getDate() - inactiveDays);

    return this.employeeRepository
      .createQueryBuilder('employee')
      .select('employee.id', 'employee_id')
      .addSelect('employee.employee_no', 'employee_no')
      .addSelect(
        `TRIM(CONCAT_WS(' ', employee.first_name, employee.middle_name, employee.last_name))`,
        'employee_name',
      )
      .addSelect(
        `TO_CHAR(employee.attendance_exempt_from, 'YYYY-MM-DD')`,
        'attendance_exempt_from',
      )
      .addSelect(
        'employee.attendance_exempt_reason',
        'attendance_exempt_reason',
      )
      .addSelect(
        `(SELECT COUNT(*)::int FROM attendance_daily_summaries summary
          WHERE summary.employee_id = employee.id
            AND summary.attendance_status = 'ABSENT'
            AND summary.attendance_date >= :since)`,
        'absent_days',
      )
      .where('employee.company_id = :companyId', { companyId })
      .andWhere(
        '(employee.exit_date IS NULL OR employee.exit_date >= CURRENT_DATE)',
      )
      .setParameter('since', formatDateOnly(since))
      .orderBy('employee.employee_no', 'ASC');
  }
}
