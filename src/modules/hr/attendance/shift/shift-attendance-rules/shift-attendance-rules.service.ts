import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../../shared/hr.utils';
import { Shift } from '../shifts/entities/shift.entity';
import { ShiftAttendanceRule } from './entities/shift-attendance-rule.entity';
import { CreateShiftAttendanceRuleDto } from './dtos/create-shift-attendance-rule.dto';
import { UpdateShiftAttendanceRuleDto } from './dtos/update-shift-attendance-rule.dto';
import { ShiftAttendanceRuleQueryDto } from './dtos/shift-attendance-rule-query.dto';

@Injectable()
export class ShiftAttendanceRulesService {
  constructor(
    @InjectRepository(ShiftAttendanceRule)
    private readonly attendanceRuleRepository: Repository<ShiftAttendanceRule>,
    @InjectRepository(Shift)
    private readonly shiftRepository: Repository<Shift>,
  ) {}

  private async ensureShift(companyId: number, shiftId: number): Promise<void> {
    const shift = await this.shiftRepository.findOne({ where: { id: shiftId, companyId }, select: ['id'] });
    if (!shift) throw new BadRequestException('shift_id does not belong to the active company');
  }

  private async findOrFail(companyId: number, id: number): Promise<ShiftAttendanceRule> {
    const item = await this.attendanceRuleRepository
      .createQueryBuilder('rule')
      .innerJoin(Shift, 'shift', 'shift.id = rule.shift_id')
      .where('rule.id = :id', { id })
      .andWhere('shift.company_id = :companyId', { companyId })
      .getOne();
    if (!item) throw new NotFoundException('Shift attendance rule not found');
    return item;
  }

  async create(companyId: number, dto: CreateShiftAttendanceRuleDto) {
    await this.ensureShift(companyId, dto.shift_id);

    const duplicate = await this.attendanceRuleRepository.findOne({ where: { shiftId: dto.shift_id } });
    if (duplicate) throw new ConflictException('Attendance rule already exists for this shift');

    return this.attendanceRuleRepository.save(this.attendanceRuleRepository.create({
      shiftId: dto.shift_id,
      lateAfterMinutes: dto.late_after_minutes,
      absentAfterMinutes: dto.absent_after_minutes,
      halfDayAfterMinutes: dto.half_day_after_minutes,
      allowMultipleCheckin: dto.allow_multiple_checkin ?? false,
      autoMarkAbsent: dto.auto_mark_absent ?? true,
      allowMobileAttendance: dto.allow_mobile_attendance ?? true,
      allowRemoteAttendance: dto.allow_remote_attendance ?? false,
      requireGeofence: dto.require_geofence ?? false,
      requireBiometric: dto.require_biometric ?? false,
    }));
  }

  async findAll(companyId: number, query: ShiftAttendanceRuleQueryDto) {
    const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = SortDirection.DESC, shift_id } = query;
    const qb = this.attendanceRuleRepository
      .createQueryBuilder('rule')
      .innerJoin(Shift, 'shift', 'shift.id = rule.shift_id')
      .where('shift.company_id = :companyId', { companyId });

    if (shift_id) qb.andWhere('rule.shift_id = :shiftId', { shiftId: shift_id });

    const safeSortBy = ['created_at'].includes(sortBy) ? sortBy : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const [items, total] = await qb.orderBy(`rule.${safeSortBy}`, direction).skip((page - 1) * limit).take(limit).getManyAndCount();

    return { data: items, meta: buildPaginationMeta(total, items.length, limit, page) };
  }

  async findOne(companyId: number, id: number) { return this.findOrFail(companyId, id); }

  async update(companyId: number, id: number, dto: UpdateShiftAttendanceRuleDto) {
    const item = await this.findOrFail(companyId, id);
    const shiftId = dto.shift_id ?? item.shiftId;
    await this.ensureShift(companyId, shiftId);

    const duplicate = await this.attendanceRuleRepository.findOne({ where: { shiftId } });
    if (duplicate && duplicate.id !== item.id) throw new ConflictException('Attendance rule already exists for this shift');

    item.shiftId = shiftId;
    if (dto.late_after_minutes !== undefined) item.lateAfterMinutes = dto.late_after_minutes;
    if (dto.absent_after_minutes !== undefined) item.absentAfterMinutes = dto.absent_after_minutes;
    if (dto.half_day_after_minutes !== undefined) item.halfDayAfterMinutes = dto.half_day_after_minutes;
    if (dto.allow_multiple_checkin !== undefined) item.allowMultipleCheckin = dto.allow_multiple_checkin;
    if (dto.auto_mark_absent !== undefined) item.autoMarkAbsent = dto.auto_mark_absent;
    if (dto.allow_mobile_attendance !== undefined) item.allowMobileAttendance = dto.allow_mobile_attendance;
    if (dto.allow_remote_attendance !== undefined) item.allowRemoteAttendance = dto.allow_remote_attendance;
    if (dto.require_geofence !== undefined) item.requireGeofence = dto.require_geofence;
    if (dto.require_biometric !== undefined) item.requireBiometric = dto.require_biometric;

    return this.attendanceRuleRepository.save(item);
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.attendanceRuleRepository.remove(item);
    return { message: 'Shift attendance rule deleted successfully' };
  }
}
