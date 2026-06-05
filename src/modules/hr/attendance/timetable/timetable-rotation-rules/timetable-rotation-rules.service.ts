import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../../shared/hr.utils';
import { Shift } from '../../shift/shifts/entities/shift.entity';
import { Timetable } from '../timetables/entities/timetable.entity';
import { TimetableRotation } from '../timetable-rotations/entities/timetable-rotation.entity';
import { TimetableRotationRule } from './entities/timetable-rotation-rule.entity';
import { CreateTimetableRotationRuleDto } from './dtos/create-timetable-rotation-rule.dto';
import { UpdateTimetableRotationRuleDto } from './dtos/update-timetable-rotation-rule.dto';
import { TimetableRotationRuleQueryDto } from './dtos/timetable-rotation-rule-query.dto';

@Injectable()
export class TimetableRotationRulesService {
  constructor(
    @InjectRepository(TimetableRotationRule)
    private readonly rotationRuleRepository: Repository<TimetableRotationRule>,
    @InjectRepository(TimetableRotation)
    private readonly rotationRepository: Repository<TimetableRotation>,
    @InjectRepository(Shift)
    private readonly shiftRepository: Repository<Shift>,
  ) {}

  private async ensureRotation(companyId: number, rotationId: number): Promise<void> {
    const item = await this.rotationRepository.findOne({ where: { id: rotationId, companyId }, select: ['id'] });
    if (!item) throw new BadRequestException('rotation_id does not belong to the active company');
  }

  private async ensureShift(companyId: number, shiftId?: number | null): Promise<void> {
    if (!shiftId) return;

    const shift = await this.shiftRepository.findOne({
      where: { id: shiftId, companyId },
      select: ['id'],
    });
    if (!shift) throw new BadRequestException('shift_id does not belong to the active company');
  }

  private async findOrFail(companyId: number, id: number): Promise<TimetableRotationRule> {
    const item = await this.rotationRuleRepository
      .createQueryBuilder('rule')
      .innerJoin(TimetableRotation, 'rotation', 'rotation.id = rule.rotation_id')
      .where('rule.id = :id', { id })
      .andWhere('rotation.company_id = :companyId', { companyId })
      .getOne();

    if (!item) throw new NotFoundException('Timetable rotation rule not found');
    return item;
  }

  async create(companyId: number, dto: CreateTimetableRotationRuleDto) {
    await this.ensureRotation(companyId, dto.rotation_id);
    await this.ensureShift(companyId, dto.shift_id);

    if (!dto.shift_id && !dto.is_off_day) {
      throw new BadRequestException('shift_id is required when is_off_day is false');
    }

    const duplicate = await this.rotationRuleRepository.findOne({ where: { rotationId: dto.rotation_id, dayIndex: dto.day_index } });
    if (duplicate) throw new ConflictException('day_index already exists in this rotation');

    return this.rotationRuleRepository.save(this.rotationRuleRepository.create({
      rotationId: dto.rotation_id,
      dayIndex: dto.day_index,
      shiftId: dto.shift_id ?? null,
      isOffDay: dto.is_off_day ?? false,
    }));
  }

  async findAll(companyId: number, query: TimetableRotationRuleQueryDto) {
    const { page = 1, limit = 20, sortBy = 'day_index', sortOrder = SortDirection.ASC, rotation_id } = query;

    const qb = this.rotationRuleRepository
      .createQueryBuilder('rule')
      .innerJoin(TimetableRotation, 'rotation', 'rotation.id = rule.rotation_id')
      .where('rotation.company_id = :companyId', { companyId });

    if (rotation_id) qb.andWhere('rule.rotation_id = :rotationId', { rotationId: rotation_id });

    const safeSortBy = ['day_index', 'created_at'].includes(sortBy) ? sortBy : 'day_index';
    const direction = sortOrder === SortDirection.DESC ? 'DESC' : 'ASC';

    const [items, total] = await qb.orderBy(`rule.${safeSortBy}`, direction).skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data: items, meta: buildPaginationMeta(total, items.length, limit, page) };
  }

  async findOne(companyId: number, id: number) { return this.findOrFail(companyId, id); }

  async update(companyId: number, id: number, dto: UpdateTimetableRotationRuleDto) {
    const item = await this.findOrFail(companyId, id);

    const rotationId = dto.rotation_id ?? item.rotationId;
    const dayIndex = dto.day_index ?? item.dayIndex;
    const shiftId = dto.shift_id !== undefined ? dto.shift_id : item.shiftId;
    const isOffDay = dto.is_off_day !== undefined ? dto.is_off_day : item.isOffDay;
    await this.ensureRotation(companyId, rotationId);
    await this.ensureShift(companyId, shiftId);

    if (!shiftId && !isOffDay) {
      throw new BadRequestException('shift_id is required when is_off_day is false');
    }

    const duplicate = await this.rotationRuleRepository.findOne({ where: { rotationId, dayIndex } });
    if (duplicate && duplicate.id !== item.id) throw new ConflictException('day_index already exists in this rotation');

    item.rotationId = rotationId;
    item.dayIndex = dayIndex;
    item.shiftId = shiftId;
    item.isOffDay = isOffDay;

    return this.rotationRuleRepository.save(item);
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.rotationRuleRepository.remove(item);
    return { message: 'Timetable rotation rule deleted successfully' };
  }
}
