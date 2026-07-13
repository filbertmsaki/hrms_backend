import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../../shared/hr.utils';
import { Timetable } from '../timetables/entities/timetable.entity';
import { TimetableRotation } from './entities/timetable-rotation.entity';
import { CreateTimetableRotationDto } from './dtos/create-timetable-rotation.dto';
import { UpdateTimetableRotationDto } from './dtos/update-timetable-rotation.dto';
import { TimetableRotationQueryDto } from './dtos/timetable-rotation-query.dto';
import { TimetableRotationStatusEnum } from './enums/timetable-rotation-status.enum';
import {
  ensureCompanyOwnedEntity,
  ensureUniqueEntity,
  normalizeNullableText,
  normalizeTrimmedText,
} from '../../shared/attendance-domain.utils';

@Injectable()
export class TimetableRotationsService {
  constructor(
    @InjectRepository(TimetableRotation)
    private readonly rotationRepository: Repository<TimetableRotation>,
    @InjectRepository(Timetable)
    private readonly timetableRepository: Repository<Timetable>,
  ) {}

  private async ensureSingleActiveRotation(
    timetableId: number,
    status: TimetableRotationStatusEnum,
    ignoreId?: number,
  ): Promise<void> {
    if (status !== TimetableRotationStatusEnum.ACTIVE) {
      return;
    }

    const qb = this.rotationRepository
      .createQueryBuilder('rotation')
      .where('rotation.timetable_id = :timetableId', { timetableId })
      .andWhere('rotation.status = :status', {
        status: TimetableRotationStatusEnum.ACTIVE,
      });

    if (ignoreId) {
      qb.andWhere('rotation.id != :ignoreId', { ignoreId });
    }

    const existing = await qb
      .select('rotation.id', 'id')
      .getRawOne<{ id?: number }>();
    if (existing?.id) {
      throw new ConflictException(
        'Only one active rotation is allowed for a timetable at a time',
      );
    }
  }

  private async ensureTimetable(
    companyId: number,
    timetableId: number,
  ): Promise<void> {
    await ensureCompanyOwnedEntity(
      this.timetableRepository,
      { id: timetableId, companyId },
      'timetable_id does not belong to the active company',
    );
  }

  private async findOrFail(
    companyId: number,
    id: number,
  ): Promise<TimetableRotation> {
    const item = await this.rotationRepository.findOne({
      where: { id, companyId },
    });
    if (!item) throw new NotFoundException('Timetable rotation not found');
    return item;
  }

  async create(companyId: number, dto: CreateTimetableRotationDto) {
    await this.ensureTimetable(companyId, dto.timetable_id);
    await this.ensureSingleActiveRotation(
      dto.timetable_id,
      dto.status ?? TimetableRotationStatusEnum.ACTIVE,
    );

    const name = normalizeTrimmedText(dto.name);
    await ensureUniqueEntity(
      this.rotationRepository,
      { timetableId: dto.timetable_id, name },
      'Rotation name already exists for this timetable',
    );

    return this.rotationRepository.save(
      this.rotationRepository.create({
        companyId,
        timetableId: dto.timetable_id,
        name,
        cycleDays: dto.cycle_days,
        description: normalizeNullableText(dto.description) ?? null,
        status: dto.status,
      }),
    );
  }

  async findAll(companyId: number, query: TimetableRotationQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      timetable_id,
      status,
    } = query;

    const qb = this.rotationRepository
      .createQueryBuilder('rotation')
      .where('rotation.company_id = :companyId', { companyId });
    if (timetable_id)
      qb.andWhere('rotation.timetable_id = :timetableId', {
        timetableId: timetable_id,
      });
    if (status) qb.andWhere('rotation.status = :status', { status });

    const sortFieldMap: Record<string, string> = {
      name: 'name',
      cycle_days: 'cycleDays',
      created_at: 'createdAt',
    };
    const safeSortBy = sortFieldMap[sortBy] ?? sortFieldMap.created_at;
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const [items, total] = await qb
      .orderBy(`rotation.${safeSortBy}`, direction)
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

  async update(companyId: number, id: number, dto: UpdateTimetableRotationDto) {
    const item = await this.findOrFail(companyId, id);

    const timetableId = dto.timetable_id ?? item.timetableId;
    await this.ensureTimetable(companyId, timetableId);
    await this.ensureSingleActiveRotation(
      timetableId,
      dto.status ?? item.status,
      item.id,
    );

    if (dto.name !== undefined) {
      const name = normalizeTrimmedText(dto.name);
      await ensureUniqueEntity(
        this.rotationRepository,
        { timetableId, name },
        'Rotation name already exists for this timetable',
        item.id,
      );
      item.name = name;
    }

    item.timetableId = timetableId;
    if (dto.cycle_days !== undefined) item.cycleDays = dto.cycle_days;
    if (dto.description !== undefined)
      item.description = normalizeNullableText(dto.description) ?? null;
    if (dto.status !== undefined) item.status = dto.status;

    return this.rotationRepository.save(item);
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.rotationRepository.remove(item);
    return { message: 'Timetable rotation deleted successfully' };
  }
}
