import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../shared/hr.utils';
import { Shift } from '../shifts/entities/shift.entity';
import { ShiftBreak } from './entities/shift-break.entity';
import { CreateShiftBreakDto } from './dtos/create-shift-break.dto';
import { UpdateShiftBreakDto } from './dtos/update-shift-break.dto';
import { ShiftBreakQueryDto } from './dtos/shift-break-query.dto';

@Injectable()
export class ShiftBreaksService {
  constructor(
    @InjectRepository(ShiftBreak)
    private readonly shiftBreakRepository: Repository<ShiftBreak>,
    @InjectRepository(Shift)
    private readonly shiftRepository: Repository<Shift>,
  ) {}

  private async ensureShift(companyId: number, shiftId: number): Promise<void> {
    const shift = await this.shiftRepository.findOne({ where: { id: shiftId, companyId }, select: ['id'] });
    if (!shift) throw new BadRequestException('shift_id does not belong to the active company');
  }

  private async findOrFail(companyId: number, id: number): Promise<ShiftBreak> {
    const item = await this.shiftBreakRepository
      .createQueryBuilder('break')
      .innerJoin(Shift, 'shift', 'shift.id = break.shift_id')
      .where('break.id = :id', { id })
      .andWhere('shift.company_id = :companyId', { companyId })
      .getOne();
    if (!item) throw new NotFoundException('Shift break not found');
    return item;
  }

  async create(companyId: number, dto: CreateShiftBreakDto) {
    await this.ensureShift(companyId, dto.shift_id);

    const duplicate = await this.shiftBreakRepository.findOne({ where: { shiftId: dto.shift_id, name: dto.name.trim() } });
    if (duplicate) throw new ConflictException('Break name already exists for this shift');

    return this.shiftBreakRepository.save(this.shiftBreakRepository.create({
      shiftId: dto.shift_id,
      name: dto.name.trim(),
      breakType: dto.break_type,
      startTime: dto.start_time,
      endTime: dto.end_time,
      durationMinutes: dto.duration_minutes,
      isPaid: dto.is_paid ?? false,
      isFlexible: dto.is_flexible ?? false,
    }));
  }

  async findAll(companyId: number, query: ShiftBreakQueryDto) {
    const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = SortDirection.DESC, shift_id } = query;
    const qb = this.shiftBreakRepository
      .createQueryBuilder('break')
      .innerJoin(Shift, 'shift', 'shift.id = break.shift_id')
      .where('shift.company_id = :companyId', { companyId });

    if (shift_id) qb.andWhere('break.shift_id = :shiftId', { shiftId: shift_id });

    const safeSortBy = ['created_at', 'name'].includes(sortBy) ? sortBy : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const [items, total] = await qb.orderBy(`break.${safeSortBy}`, direction).skip((page - 1) * limit).take(limit).getManyAndCount();

    return { data: items, meta: buildPaginationMeta(total, items.length, limit, page) };
  }

  async findOne(companyId: number, id: number) { return this.findOrFail(companyId, id); }

  async update(companyId: number, id: number, dto: UpdateShiftBreakDto) {
    const item = await this.findOrFail(companyId, id);
    const shiftId = dto.shift_id ?? item.shiftId;
    await this.ensureShift(companyId, shiftId);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      const duplicate = await this.shiftBreakRepository.findOne({ where: { shiftId, name } });
      if (duplicate && duplicate.id !== item.id) throw new ConflictException('Break name already exists for this shift');
      item.name = name;
    }

    item.shiftId = shiftId;
    if (dto.break_type !== undefined) item.breakType = dto.break_type;
    if (dto.start_time !== undefined) item.startTime = dto.start_time;
    if (dto.end_time !== undefined) item.endTime = dto.end_time;
    if (dto.duration_minutes !== undefined) item.durationMinutes = dto.duration_minutes;
    if (dto.is_paid !== undefined) item.isPaid = dto.is_paid;
    if (dto.is_flexible !== undefined) item.isFlexible = dto.is_flexible;

    return this.shiftBreakRepository.save(item);
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.shiftBreakRepository.remove(item);
    return { message: 'Shift break deleted successfully' };
  }
}
