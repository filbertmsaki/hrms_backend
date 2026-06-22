import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HikvisionAttendanceLog } from '../../../hikvision/entities/hikvision-attendance-log.entity';
import { ShiftAssignment } from '../shift/shift-assignments/entities/shift-assignment.entity';
import { ShiftAssignmentStatusEnum } from '../shift/shift-assignments/enums/shift-assignment-status.enum';
import { ShiftSchedule } from '../shift/shift-schedules/entities/shift-schedule.entity';
import { EmployeeTimetable } from '../timetable/employee-timetables/entities/employee-timetable.entity';
import { EmployeeTimetableStatusEnum } from '../timetable/employee-timetables/enums/employee-timetable-status.enum';
import { Timetable } from '../timetable/timetables/entities/timetable.entity';
import { TimetableStatusEnum } from '../timetable/timetables/enums/timetable-status.enum';
import { AttendanceProcessingService } from './attendance-processing.service';
import { AttendanceRecalculationService } from './attendance-recalculation.service';
import { formatDateOnly } from '../../shared/hr.utils';
import { AttendancePolicy } from '../policies/entities/attendance-policy.entity';

@Injectable()
export class AttendanceProcessingCronService {
  private readonly logger = new Logger(AttendanceProcessingCronService.name);

  constructor(
    @InjectRepository(HikvisionAttendanceLog)
    private readonly rawLogRepository: Repository<HikvisionAttendanceLog>,
    @InjectRepository(EmployeeTimetable)
    private readonly employeeTimetableRepository: Repository<EmployeeTimetable>,
    @InjectRepository(ShiftAssignment)
    private readonly shiftAssignmentRepository: Repository<ShiftAssignment>,
    @InjectRepository(ShiftSchedule)
    private readonly shiftScheduleRepository: Repository<ShiftSchedule>,
    @InjectRepository(Timetable)
    private readonly timetableRepository: Repository<Timetable>,
    @InjectRepository(AttendancePolicy)
    private readonly attendancePolicyRepository: Repository<AttendancePolicy>,
    private readonly processingService: AttendanceProcessingService,
    private readonly recalculationService: AttendanceRecalculationService,
  ) {}

  @Cron(process.env.ATTENDANCE_INCREMENTAL_CRON || '*/5 * * * *')
  async runIncrementalProcessing() {
    if (!this.isEnabled()) return;

    const today = this.formatDate(new Date());
    try {
      const rawLogRows = await this.rawLogRepository
        .createQueryBuilder('log')
        .select('DISTINCT log.company_id', 'companyId')
        .where('DATE(log.event_time) = :today', { today })
        .getRawMany<{ companyId: string }>();

      const timetableRows = await this.employeeTimetableRepository
        .createQueryBuilder('assignment')
        .select('DISTINCT assignment.company_id', 'companyId')
        .where('assignment.status = :status', {
          status: EmployeeTimetableStatusEnum.ACTIVE,
        })
        .andWhere('assignment.effective_from <= :today', { today })
        .andWhere(
          '(assignment.effective_to IS NULL OR assignment.effective_to >= :today)',
          {
            today,
          },
        )
        .getRawMany<{ companyId: string }>();

      const shiftAssignmentRows = await this.shiftAssignmentRepository
        .createQueryBuilder('assignment')
        .select('DISTINCT assignment.company_id', 'companyId')
        .where('assignment.status = :status', {
          status: ShiftAssignmentStatusEnum.ACTIVE,
        })
        .andWhere('assignment.effective_from <= :today', { today })
        .andWhere(
          '(assignment.effective_to IS NULL OR assignment.effective_to >= :today)',
          {
            today,
          },
        )
        .getRawMany<{ companyId: string }>();

      const shiftScheduleRows = await this.shiftScheduleRepository
        .createQueryBuilder('schedule')
        .select('DISTINCT schedule.company_id', 'companyId')
        .where('schedule.effective_from <= :today', { today })
        .andWhere(
          '(schedule.effective_to IS NULL OR schedule.effective_to >= :today)',
          { today },
        )
        .getRawMany<{ companyId: string }>();

      const defaultTimetableRows = await this.timetableRepository
        .createQueryBuilder('timetable')
        .select('DISTINCT timetable.company_id', 'companyId')
        .where('timetable.is_default = :isDefault', { isDefault: true })
        .andWhere('timetable.status = :status', {
          status: TimetableStatusEnum.ACTIVE,
        })
        .getRawMany<{ companyId: string }>();

      const companyIds = new Set<number>();
      for (const row of [
        ...rawLogRows,
        ...timetableRows,
        ...shiftAssignmentRows,
        ...shiftScheduleRows,
        ...defaultTimetableRows,
      ]) {
        const companyId = Number(row.companyId);
        if (Number.isInteger(companyId) && companyId > 0) {
          companyIds.add(companyId);
        }
      }

      const dueCompanyIds =
        await this.filterCompaniesDueForCalculation(companyIds);

      for (const companyId of dueCompanyIds) {
        await this.processingService.processRange(companyId, {
          start_date: today,
          end_date: today,
          rebuild_summaries: true,
        });
      }
    } catch (error) {
      this.logger.warn(
        `Incremental attendance processing skipped: ${(error as Error).message}`,
      );
    }
  }

  @Cron(process.env.ATTENDANCE_RECALCULATION_CRON || '*/10 * * * *')
  async processPendingRecalculationJobs() {
    if (!this.isEnabled()) return;

    try {
      await this.recalculationService.processPendingJobs(20);
    } catch (error) {
      this.logger.warn(
        `Pending recalculation processing failed: ${(error as Error).message}`,
      );
    }
  }

  private isEnabled() {
    const value = String(
      process.env.ATTENDANCE_PROCESSING_ENABLED ?? 'true',
    ).toLowerCase();
    return value !== 'false' && value !== '0' && value !== 'no';
  }

  private formatDate(date: Date): string {
    return formatDateOnly(date);
  }

  private async filterCompaniesDueForCalculation(
    companyIds: Set<number>,
    now = new Date(),
  ): Promise<number[]> {
    if (!companyIds.size) return [];

    const policies = await this.attendancePolicyRepository.find({
      where: {
        is_active: true,
        auto_calculate_attendance: true,
      },
      select: [
        'id',
        'company_id',
        'calculation_time',
        'auto_calculate_attendance',
        'is_active',
      ],
    });

    const requestedCompanyIds = new Set(companyIds);
    const dueCompanyIds: number[] = [];

    for (const policy of policies) {
      if (!requestedCompanyIds.has(policy.company_id)) continue;

      if (this.isCalculationTimeDue(policy.calculation_time, now)) {
        dueCompanyIds.push(policy.company_id);
      }
    }

    return dueCompanyIds;
  }

  private isCalculationTimeDue(
    calculationTime: string | null | undefined,
    now: Date,
  ): boolean {
    if (!calculationTime) return true;

    const [hour, minute] = calculationTime.split(':').map(Number);

    if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
      return true;
    }

    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const calculationMinutes = hour * 60 + minute;

    const windowMinutes = Number(
      process.env.ATTENDANCE_CALCULATION_WINDOW_MINUTES ?? 10,
    );

    return (
      nowMinutes >= calculationMinutes &&
      nowMinutes <= calculationMinutes + windowMinutes
    );
  }
}
