import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../../shared/hr-access.service';
import { KpiCategory } from '../entities/kpi-category.entity';
import { CreateKpiCategoryDto } from '../dto/create-kpi-category.dto';
@Injectable()
export class KpiCategoryService {
  constructor(
    private readonly access: HrAccessService,
    @InjectRepository(KpiCategory)
    private readonly categories: Repository<KpiCategory>,
  ) {}
  private clean(value: string): string {
    return value.normalize('NFC').trim().replace(/\s+/g, ' ');
  }
  private async defaults(companyId: number): Promise<void> {
    await this.categories
      .createQueryBuilder()
      .insert()
      .values([
        {
          companyId,
          name: 'Delivery',
          normalizedName: 'delivery',
          description: 'Timely completion of work and agreed deliverables.',
        },
        {
          companyId,
          name: 'Quality',
          normalizedName: 'quality',
          description: 'Accuracy, standards, and quality of completed work.',
        },
      ])
      .orIgnore()
      .execute();
  }
  async list(actor: AuthenticatedUser): Promise<KpiCategory[]> {
    const companyId = this.access.ensureActorCompanyId(actor);
    await this.defaults(companyId);
    return this.categories.find({
      where: { companyId },
      order: { name: 'ASC' },
    });
  }
  async create(
    actor: AuthenticatedUser,
    dto: CreateKpiCategoryDto,
  ): Promise<KpiCategory> {
    const companyId = this.access.ensureActorCompanyId(actor);
    const name = this.clean(dto.name);
    if (!name || name.length > 80)
      throw new BadRequestException(
        'Category name must contain 1 to 80 characters.',
      );
    await this.defaults(companyId);
    try {
      return await this.categories.save(
        this.categories.create({
          companyId,
          name,
          normalizedName: name.toLocaleLowerCase('en'),
          description: dto.description?.trim() || null,
        }),
      );
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'driverError' in error
      ) {
        const driver = error.driverError;
        if (
          typeof driver === 'object' &&
          driver !== null &&
          'code' in driver &&
          driver.code === '23505'
        )
          throw new ConflictException(
            'This category already exists. Select it from the category list.',
          );
      }
      throw error;
    }
  }
  async update(
    actor: AuthenticatedUser,
    id: number,
    dto: CreateKpiCategoryDto,
  ): Promise<KpiCategory> {
    const companyId = this.access.ensureActorCompanyId(actor);
    const category = await this.categories.findOneBy({ id, companyId });
    if (!category) throw new NotFoundException('Category not found.');
    const name = this.clean(dto.name);
    if (!name || name.length > 80)
      throw new BadRequestException(
        'Category name must contain 1 to 80 characters.',
      );
    if (
      ['delivery', 'quality'].includes(category.normalizedName) &&
      name !== category.name
    )
      throw new BadRequestException(
        'Default category names cannot be changed. You can edit their descriptions.',
      );
    category.name = name;
    category.normalizedName = name.toLocaleLowerCase('en');
    category.description = dto.description?.trim() || null;
    try {
      return await this.categories.save(category);
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'driverError' in error
      ) {
        const driver = error.driverError;
        if (
          typeof driver === 'object' &&
          driver !== null &&
          'code' in driver &&
          driver.code === '23505'
        )
          throw new ConflictException(
            'This category name already exists. Choose a different name.',
          );
      }
      throw error;
    }
  }
  async remove(
    actor: AuthenticatedUser,
    id: number,
  ): Promise<{ deleted: boolean }> {
    const companyId = this.access.ensureActorCompanyId(actor);
    const category = await this.categories.findOneBy({ id, companyId });
    if (!category) throw new NotFoundException('Category not found.');
    if (['delivery', 'quality'].includes(category.normalizedName))
      throw new ConflictException(
        'Delivery and Quality are default categories and cannot be deleted.',
      );
    try {
      const result = await this.categories.delete({ id, companyId });
      if (!result.affected) throw new NotFoundException('Category not found.');
      return { deleted: true };
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'driverError' in error
      ) {
        const driver = error.driverError;
        if (
          typeof driver === 'object' &&
          driver !== null &&
          'code' in driver &&
          (driver.code === '23503' || driver.code === '23001')
        )
          throw new ConflictException(
            'This category is used by a KPI. Move those KPIs to another category before deleting it.',
          );
      }
      throw error;
    }
  }

  async resolve(
    actor: AuthenticatedUser,
    value?: string,
  ): Promise<string | null> {
    const name = this.clean(value ?? '');
    if (!name) return null;
    const companyId = this.access.ensureActorCompanyId(actor);
    const normalizedName = name.toLocaleLowerCase('en');
    await this.defaults(companyId);
    await this.categories
      .createQueryBuilder()
      .insert()
      .values({ companyId, name, normalizedName, description: null })
      .orIgnore()
      .execute();
    const category = await this.categories.findOneByOrFail({
      companyId,
      normalizedName,
    });
    return category.name;
  }
}
