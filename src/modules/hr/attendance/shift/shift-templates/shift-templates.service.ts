import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../../shared/hr.utils';
import { ShiftTemplate } from './entities/shift-template.entity';
import { CreateShiftTemplateDto } from './dtos/create-shift-template.dto';
import { UpdateShiftTemplateDto } from './dtos/update-shift-template.dto';
import { ShiftTemplateQueryDto } from './dtos/shift-template-query.dto';

@Injectable()
export class ShiftTemplatesService {
  constructor(
    @InjectRepository(ShiftTemplate)
    private readonly templateRepository: Repository<ShiftTemplate>,
  ) {}

  private async findOrFail(
    companyId: number,
    id: number,
  ): Promise<ShiftTemplate> {
    const item = await this.templateRepository.findOne({
      where: { id, companyId },
    });
    if (!item) throw new NotFoundException('Shift template not found');
    return item;
  }

  async create(companyId: number, dto: CreateShiftTemplateDto) {
    const name = dto.name.trim();

    const existing = await this.templateRepository.findOne({
      where: { companyId, name },
    });
    if (existing)
      throw new ConflictException(
        'Shift template name already exists for this company',
      );

    return this.templateRepository.save(
      this.templateRepository.create({
        companyId,
        name,
        templateType: dto.template_type,
        configuration: dto.configuration,
        status: dto.status,
      }),
    );
  }

  async findAll(companyId: number, query: ShiftTemplateQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      search,
      template_type,
      status,
    } = query;

    const qb = this.templateRepository
      .createQueryBuilder('template')
      .where('template.company_id = :companyId', { companyId });

    if (template_type)
      qb.andWhere('template.template_type = :templateType', {
        templateType: template_type,
      });
    if (status) qb.andWhere('template.status = :status', { status });
    if (search?.trim())
      qb.andWhere('template.name LIKE :term', { term: `%${search.trim()}%` });

    const sortFieldMap: Record<string, string> = {
      name: 'name',
      created_at: 'createdAt',
      updated_at: 'updatedAt',
    };
    const safeSortBy = sortFieldMap[sortBy] ?? sortFieldMap.created_at;
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const [items, total] = await qb
      .orderBy(`template.${safeSortBy}`, direction)
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

  async update(companyId: number, id: number, dto: UpdateShiftTemplateDto) {
    const item = await this.findOrFail(companyId, id);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      const existing = await this.templateRepository.findOne({
        where: { companyId, name },
      });
      if (existing && existing.id !== item.id)
        throw new ConflictException(
          'Shift template name already exists for this company',
        );
      item.name = name;
    }

    if (dto.template_type !== undefined) item.templateType = dto.template_type;
    if (dto.configuration !== undefined) item.configuration = dto.configuration;
    if (dto.status !== undefined) item.status = dto.status;

    return this.templateRepository.save(item);
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.templateRepository.remove(item);
    return { message: 'Shift template deleted successfully' };
  }
}
