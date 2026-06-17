import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../../shared/hr.utils';
import { Shift } from '../shifts/entities/shift.entity';
import { ShiftRotationGroup } from '../shift-rotation-groups/entities/shift-rotation-group.entity';
import { ShiftRotationRule } from './entities/shift-rotation-rule.entity';
import { CreateShiftRotationRuleDto } from './dtos/create-shift-rotation-rule.dto';
import { UpdateShiftRotationRuleDto } from './dtos/update-shift-rotation-rule.dto';
import { ShiftRotationRuleQueryDto } from './dtos/shift-rotation-rule-query.dto';

@Injectable()
export class ShiftRotationRulesService {
  constructor(
    @InjectRepository(ShiftRotationRule)
    private readonly rotationRuleRepository: Repository<ShiftRotationRule>,
    @InjectRepository(ShiftRotationGroup)
    private readonly rotationGroupRepository: Repository<ShiftRotationGroup>,
    @InjectRepository(Shift)
    private readonly shiftRepository: Repository<Shift>,
  ) {}

  private async ensureRotationGroup(
    companyId: number,
    rotationGroupId: number,
  ): Promise<void> {
    const group = await this.rotationGroupRepository.findOne({
      where: { id: rotationGroupId, companyId },
      select: ['id'],
    });
    if (!group)
      throw new BadRequestException(
        'rotation_group_id does not belong to the active company',
      );
  }

  private async ensureShift(
    companyId: number,
    shiftId?: number | null,
  ): Promise<void> {
    if (!shiftId) return;
    const shift = await this.shiftRepository.findOne({
      where: { id: shiftId, companyId },
      select: ['id'],
    });
    if (!shift)
      throw new BadRequestException(
        'shift_id does not belong to the active company',
      );
  }

  private async findOrFail(
    companyId: number,
    id: number,
  ): Promise<ShiftRotationRule> {
    const item = await this.rotationRuleRepository
      .createQueryBuilder('rule')
      .innerJoin(
        ShiftRotationGroup,
        'group',
        'group.id = rule.rotation_group_id',
      )
      .where('rule.id = :id', { id })
      .andWhere('group.company_id = :companyId', { companyId })
      .getOne();
    if (!item) throw new NotFoundException('Shift rotation rule not found');
    return item;
  }

  async create(companyId: number, dto: CreateShiftRotationRuleDto) {
    await this.ensureRotationGroup(companyId, dto.rotation_group_id);
    await this.ensureShift(companyId, dto.shift_id);

    if (!dto.shift_id && !dto.is_off_day) {
      throw new BadRequestException(
        'shift_id is required when is_off_day is false',
      );
    }

    const duplicate = await this.rotationRuleRepository.findOne({
      where: {
        rotationGroupId: dto.rotation_group_id,
        dayIndex: dto.day_index,
      },
    });
    if (duplicate)
      throw new ConflictException(
        'day_index already exists for this rotation group',
      );

    return this.rotationRuleRepository.save(
      this.rotationRuleRepository.create({
        rotationGroupId: dto.rotation_group_id,
        shiftId: dto.shift_id ?? null,
        dayIndex: dto.day_index,
        isOffDay: dto.is_off_day ?? false,
      }),
    );
  }

  async findAll(companyId: number, query: ShiftRotationRuleQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'day_index',
      sortOrder = SortDirection.ASC,
      rotation_group_id,
    } = query;

    const qb = this.rotationRuleRepository
      .createQueryBuilder('rule')
      .innerJoin(
        ShiftRotationGroup,
        'group',
        'group.id = rule.rotation_group_id',
      )
      .where('group.company_id = :companyId', { companyId });

    if (rotation_group_id)
      qb.andWhere('rule.rotation_group_id = :rotationGroupId', {
        rotationGroupId: rotation_group_id,
      });

    const sortFieldMap: Record<string, string> = {
      day_index: 'dayIndex',
      created_at: 'createdAt',
    };
    const safeSortBy = sortFieldMap[sortBy] ?? sortFieldMap.day_index;
    const direction = sortOrder === SortDirection.DESC ? 'DESC' : 'ASC';
    const [items, total] = await qb
      .orderBy(`rule.${safeSortBy}`, direction)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items,
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOne(companyId: number, id: number) {
    return this.findOrFail(companyId, id);
  }

  async update(companyId: number, id: number, dto: UpdateShiftRotationRuleDto) {
    const item = await this.findOrFail(companyId, id);

    const rotationGroupId = dto.rotation_group_id ?? item.rotationGroupId;
    const dayIndex = dto.day_index ?? item.dayIndex;
    const shiftId = dto.shift_id !== undefined ? dto.shift_id : item.shiftId;
    const isOffDay =
      dto.is_off_day !== undefined ? dto.is_off_day : item.isOffDay;

    await this.ensureRotationGroup(companyId, rotationGroupId);
    await this.ensureShift(companyId, shiftId);

    if (!shiftId && !isOffDay) {
      throw new BadRequestException(
        'shift_id is required when is_off_day is false',
      );
    }

    const duplicate = await this.rotationRuleRepository.findOne({
      where: { rotationGroupId, dayIndex },
    });
    if (duplicate && duplicate.id !== item.id)
      throw new ConflictException(
        'day_index already exists for this rotation group',
      );

    item.rotationGroupId = rotationGroupId;
    item.dayIndex = dayIndex;
    item.shiftId = shiftId;
    item.isOffDay = isOffDay;

    return this.rotationRuleRepository.save(item);
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.rotationRuleRepository.remove(item);
    return { message: 'Shift rotation rule deleted successfully' };
  }
}
