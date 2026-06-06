import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TimetableGeneratedSchedule } from './entities/timetable-generated-schedule.entity';

type GeneratedScheduleInvalidationInput = {
  companyId: number;
  timetableId?: number;
  employeeId?: number;
  fromDate?: string | null;
  toDate?: string | null;
};

@Injectable()
export class TimetableGeneratedScheduleInvalidationService {
  constructor(
    @InjectRepository(TimetableGeneratedSchedule)
    private readonly generatedScheduleRepository: Repository<TimetableGeneratedSchedule>,
  ) {}

  async invalidate(input: GeneratedScheduleInvalidationInput): Promise<number> {
    const qb = this.generatedScheduleRepository
      .createQueryBuilder()
      .delete()
      .from(TimetableGeneratedSchedule)
      .where('company_id = :companyId', { companyId: input.companyId });

    if (input.timetableId) {
      qb.andWhere('timetable_id = :timetableId', { timetableId: input.timetableId });
    }

    if (input.employeeId) {
      qb.andWhere('employee_id = :employeeId', { employeeId: input.employeeId });
    }

    if (input.fromDate) {
      qb.andWhere('schedule_date >= :fromDate', { fromDate: input.fromDate });
    }

    if (input.toDate) {
      qb.andWhere('schedule_date <= :toDate', { toDate: input.toDate });
    }

    const result = await qb.execute();
    return result.affected ?? 0;
  }
}
