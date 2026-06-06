import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../../shared/hr.utils';
import { Timetable } from '../timetables/entities/timetable.entity';
import { TimetableAttendanceRule } from './entities/timetable-attendance-rule.entity';
import { CreateTimetableAttendanceRuleDto } from './dtos/create-timetable-attendance-rule.dto';
import { UpdateTimetableAttendanceRuleDto } from './dtos/update-timetable-attendance-rule.dto';
import { TimetableAttendanceRuleQueryDto } from './dtos/timetable-attendance-rule-query.dto';
import { TimetableGeneratedScheduleInvalidationService } from '../timetable-generated-schedules/timetable-generated-schedule-invalidation.service';

@Injectable()
export class TimetableAttendanceRulesService {
  constructor(
    @InjectRepository(TimetableAttendanceRule)
    private readonly attendanceRuleRepository: Repository<TimetableAttendanceRule>,
    @InjectRepository(Timetable)
    private readonly timetableRepository: Repository<Timetable>,
    private readonly generatedScheduleInvalidationService: TimetableGeneratedScheduleInvalidationService,
  ) {}

  private async ensureTimetable(companyId: number, timetableId: number): Promise<void> {
    const item = await this.timetableRepository.findOne({ where: { id: timetableId, companyId }, select: ['id'] });
    if (!item) throw new BadRequestException('timetable_id does not belong to the active company');
  }

  private async findOrFail(companyId: number, id: number): Promise<TimetableAttendanceRule> {
    const item = await this.attendanceRuleRepository
      .createQueryBuilder('rule')
      .innerJoin(Timetable, 'timetable', 'timetable.id = rule.timetable_id')
      .where('rule.id = :id', { id })
      .andWhere('timetable.company_id = :companyId', { companyId })
      .getOne();

    if (!item) throw new NotFoundException('Timetable attendance rule not found');
    return item;
  }

  async create(companyId: number, dto: CreateTimetableAttendanceRuleDto) {
    await this.ensureTimetable(companyId, dto.timetable_id);

    const duplicate = await this.attendanceRuleRepository.findOne({ where: { timetableId: dto.timetable_id } });
    if (duplicate) throw new ConflictException('Attendance rule already exists for this timetable');

    const created = await this.attendanceRuleRepository.save(this.attendanceRuleRepository.create({
      timetableId: dto.timetable_id,
      lateAfterMinutes: dto.late_after_minutes,
      halfDayAfterMinutes: dto.half_day_after_minutes,
      absentAfterMinutes: dto.absent_after_minutes,
      allowEarlyCheckin: dto.allow_early_checkin ?? true,
      allowLateCheckout: dto.allow_late_checkout ?? true,
      autoAbsentIfNoCheckin: dto.auto_absent_if_no_checkin ?? true,
      maxOvertimeMinutes: dto.max_overtime_minutes,
    }));

    await this.generatedScheduleInvalidationService.invalidate({
      companyId,
      timetableId: created.timetableId,
    });

    return created;
  }

  async findAll(companyId: number, query: TimetableAttendanceRuleQueryDto) {
    const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = SortDirection.DESC, timetable_id } = query;

    const qb = this.attendanceRuleRepository
      .createQueryBuilder('rule')
      .innerJoin(Timetable, 'timetable', 'timetable.id = rule.timetable_id')
      .where('timetable.company_id = :companyId', { companyId });

    if (timetable_id) qb.andWhere('rule.timetable_id = :timetableId', { timetableId: timetable_id });

    const safeSortBy = ['created_at'].includes(sortBy) ? sortBy : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const [items, total] = await qb.orderBy(`rule.${safeSortBy}`, direction).skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data: items, meta: buildPaginationMeta(total, items.length, limit, page) };
  }

  async findOne(companyId: number, id: number) { return this.findOrFail(companyId, id); }

  async update(companyId: number, id: number, dto: UpdateTimetableAttendanceRuleDto) {
    const item = await this.findOrFail(companyId, id);
    const previousTimetableId = item.timetableId;

    const timetableId = dto.timetable_id ?? item.timetableId;
    await this.ensureTimetable(companyId, timetableId);

    const duplicate = await this.attendanceRuleRepository.findOne({ where: { timetableId } });
    if (duplicate && duplicate.id !== item.id) throw new ConflictException('Attendance rule already exists for this timetable');

    item.timetableId = timetableId;
    if (dto.late_after_minutes !== undefined) item.lateAfterMinutes = dto.late_after_minutes;
    if (dto.half_day_after_minutes !== undefined) item.halfDayAfterMinutes = dto.half_day_after_minutes;
    if (dto.absent_after_minutes !== undefined) item.absentAfterMinutes = dto.absent_after_minutes;
    if (dto.allow_early_checkin !== undefined) item.allowEarlyCheckin = dto.allow_early_checkin;
    if (dto.allow_late_checkout !== undefined) item.allowLateCheckout = dto.allow_late_checkout;
    if (dto.auto_absent_if_no_checkin !== undefined) item.autoAbsentIfNoCheckin = dto.auto_absent_if_no_checkin;
    if (dto.max_overtime_minutes !== undefined) item.maxOvertimeMinutes = dto.max_overtime_minutes;

    const saved = await this.attendanceRuleRepository.save(item);
    if (previousTimetableId !== saved.timetableId) {
      await this.generatedScheduleInvalidationService.invalidate({
        companyId,
        timetableId: previousTimetableId,
      });
    }
    await this.generatedScheduleInvalidationService.invalidate({
      companyId,
      timetableId: saved.timetableId,
    });
    return saved;
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.attendanceRuleRepository.remove(item);
    await this.generatedScheduleInvalidationService.invalidate({
      companyId,
      timetableId: item.timetableId,
    });
    return { message: 'Timetable attendance rule deleted successfully' };
  }
}
