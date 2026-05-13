import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../common/dto/pagination.dto';
import { PositionQueryDto } from './dtos/position-query.dto';
import { CreatePositionDto } from './dtos/create-position.dto';
import { UpdatePositionDto } from './dtos/update-position.dto';
import { CodeGeneratorService } from '../shared/code-generator.service';
import { buildPaginationMeta } from '../shared/hr.utils';
import { Position } from './entities/position.entity';

@Injectable()
export class PositionsService {
  constructor(
    @InjectRepository(Position)
    private readonly positionRepository: Repository<Position>,
    private readonly codeGeneratorService: CodeGeneratorService,
  ) {}

  private mapPosition(position: Position) {
    return {
      id: position.id,
      company_id: position.company_id,
      name: position.name,
      code: position.code,
      category: position.category,
      level: position.level,
      is_manager: position.is_manager,
      description: position.description,
      status: position.status,
      created_at: position.created_at,
      updated_at: position.updated_at,
    };
  }

  private async findPositionOrFail(
    companyId: number,
    positionId: number,
  ): Promise<Position> {
    const position = await this.positionRepository.findOne({
      where: { id: positionId, company_id: companyId },
    });

    if (!position) {
      throw new NotFoundException('Position not found');
    }

    return position;
  }

  async create(companyId: number, createPositionDto: CreatePositionDto) {
    const code = await this.codeGeneratorService.resolveCode(
      this.positionRepository,
      companyId,
      createPositionDto.code,
      { prefix: 'POS-', minDigits: 4 },
    );

    const position = this.positionRepository.create({
      ...createPositionDto,
      code,
      company_id: companyId,
      is_manager: createPositionDto.is_manager ?? false,
      status: createPositionDto.status ?? 'active',
    });

    return this.mapPosition(await this.positionRepository.save(position));
  }

  async findAll(companyId: number, query: PositionQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      search,
      status,
      category,
    } = query;

    const qb = this.positionRepository
      .createQueryBuilder('position')
      .where('position.company_id = :companyId', { companyId });

    if (status?.trim()) {
      qb.andWhere('position.status = :status', { status: status.trim() });
    }

    if (category?.trim()) {
      qb.andWhere('position.category = :category', {
        category: category.trim(),
      });
    }

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      qb.andWhere(
        '(position.name LIKE :term OR position.code LIKE :term OR position.description LIKE :term)',
        { term },
      );
    }

    const allowedSortFields = [
      'id',
      'name',
      'code',
      'category',
      'level',
      'status',
      'created_at',
      'updated_at',
    ];
    const safeSortBy = allowedSortFields.includes(sortBy)
      ? sortBy
      : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const skip = (page - 1) * limit;

    const [items, total] = await qb
      .orderBy(`position.${safeSortBy}`, direction)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((position) => this.mapPosition(position)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOne(companyId: number, positionId: number) {
    return this.mapPosition(await this.findPositionOrFail(companyId, positionId));
  }

  async update(
    companyId: number,
    positionId: number,
    updatePositionDto: UpdatePositionDto,
  ) {
    const position = await this.findPositionOrFail(companyId, positionId);

    // If code is being updated, validate uniqueness
    if (updatePositionDto.code && updatePositionDto.code !== position.code) {
      const isUnique = await this.codeGeneratorService.validateCodeUnique(
        this.positionRepository,
        companyId,
        updatePositionDto.code,
        positionId,
      );
      if (!isUnique) {
        throw new ConflictException(
          `Code "${updatePositionDto.code}" already exists. Please use a different code.`,
        );
      }
      position.code = updatePositionDto.code;
    }

    Object.assign(position, updatePositionDto);
    return this.mapPosition(await this.positionRepository.save(position));
  }

  async remove(
    companyId: number,
    positionId: number,
  ): Promise<{ message: string }> {
    const position = await this.findPositionOrFail(companyId, positionId);
    await this.positionRepository.remove(position);
    return { message: 'Position deleted successfully' };
  }
}
