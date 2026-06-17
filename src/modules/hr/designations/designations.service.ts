import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { Department } from '../departments/entities/department.entity';
import { CodeGeneratorService } from '../shared/code-generator.service';
import { HrAccessService } from '../shared/hr-access.service';
import { buildPaginationMeta } from '../shared/hr.utils';
import { CreateDesignationDto } from './dtos/create-designation.dto';
import { DesignationQueryDto } from './dtos/designation-query.dto';
import { UpdateDesignationDto } from './dtos/update-designation.dto';
import { Designation } from './entities/designation.entity';

@Injectable()
export class DesignationsService {
  constructor(
    @InjectRepository(Designation)
    private readonly designationRepository: Repository<Designation>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    private readonly codeGeneratorService: CodeGeneratorService,
    private readonly hrAccessService: HrAccessService,
  ) {}

  private mapDesignation(designation: Designation) {
    return {
      id: designation.id,
      company_id: designation.company_id,
      department_id: designation.department_id,
      name: designation.name,
      code: designation.code,
      hierarchy_level: designation.hierarchy_level,
      grade_level: designation.grade_level,
      is_managerial: designation.is_managerial,
      description: designation.description,
      status: designation.status,
      created_at: designation.created_at,
      updated_at: designation.updated_at,
      department: designation.department
        ? {
            id: designation.department.id,
            name: designation.department.name,
            code: designation.department.code,
            branch_id: designation.department.branch_id,
            status: designation.department.status,
          }
        : null,
    };
  }

  private async resolveDepartment(
    companyId: number,
    departmentId: number | null | undefined,
    actor: AuthenticatedUser,
  ): Promise<Department | null> {
    if (!departmentId) {
      return null;
    }

    const department = await this.departmentRepository.findOne({
      where: {
        id: departmentId,
        company_id: companyId,
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    if (department.branch_id) {
      await this.hrAccessService.assertCanAccessBranch(
        actor,
        department.branch_id,
      );
    }

    return department;
  }

  private async findDesignationOrFail(
    companyId: number,
    designationId: number,
  ): Promise<Designation> {
    const designation = await this.designationRepository.findOne({
      where: {
        id: designationId,
        company_id: companyId,
      },
      relations: {
        department: true,
      },
    });

    if (!designation) {
      throw new NotFoundException('Designation not found');
    }

    return designation;
  }

  async create(
    companyId: number,
    dto: CreateDesignationDto,
    actor: AuthenticatedUser,
  ) {
    const department = await this.resolveDepartment(
      companyId,
      dto.department_id,
      actor,
    );
    const code = await this.codeGeneratorService.resolveCode(
      this.designationRepository,
      companyId,
      dto.code,
      { prefix: 'DES-', minDigits: 4 },
    );

    const designation = this.designationRepository.create({
      ...dto,
      code,
      company_id: companyId,
      department_id: department?.id ?? null,
      is_managerial: dto.is_managerial ?? false,
      status: dto.status ?? 'active',
    });

    return this.mapDesignation(
      await this.designationRepository.save(designation),
    );
  }

  async findAll(
    companyId: number,
    query: DesignationQueryDto,
    actor: AuthenticatedUser,
  ) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      search,
      status,
      department_id,
    } = query;

    if (typeof department_id === 'number') {
      const department = await this.resolveDepartment(
        companyId,
        department_id,
        actor,
      );
      if (!department) {
        throw new NotFoundException('Department not found');
      }
    }

    const qb = this.designationRepository
      .createQueryBuilder('designation')
      .leftJoinAndSelect('designation.department', 'department')
      .where('designation.company_id = :companyId', { companyId });

    if (status?.trim()) {
      qb.andWhere('designation.status = :status', { status: status.trim() });
    }

    if (typeof department_id === 'number') {
      qb.andWhere('designation.department_id = :departmentId', {
        departmentId: department_id,
      });
    }

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      qb.andWhere(
        '(designation.name LIKE :term OR designation.code LIKE :term OR designation.description LIKE :term)',
        { term },
      );
    }

    const accessibleBranchIds =
      await this.hrAccessService.getAccessibleBranchIds(actor);
    if (accessibleBranchIds?.length === 0) {
      qb.andWhere('(department.id IS NULL OR department.branch_id IS NULL)');
    } else if (accessibleBranchIds) {
      qb.andWhere(
        '(department.id IS NULL OR department.branch_id IS NULL OR department.branch_id IN (:...branchIds))',
        { branchIds: accessibleBranchIds },
      );
    }

    const allowedSortFields = [
      'id',
      'name',
      'code',
      'hierarchy_level',
      'grade_level',
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
      .orderBy(`designation.${safeSortBy}`, direction)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((designation) => this.mapDesignation(designation)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOne(companyId: number, id: number, actor: AuthenticatedUser) {
    const designation = await this.findDesignationOrFail(companyId, id);
    if (designation.department?.branch_id) {
      await this.hrAccessService.assertCanAccessBranch(
        actor,
        designation.department.branch_id,
      );
    }
    return this.mapDesignation(designation);
  }

  async update(
    companyId: number,
    id: number,
    dto: UpdateDesignationDto,
    actor: AuthenticatedUser,
  ) {
    const designation = await this.findDesignationOrFail(companyId, id);
    if (designation.department?.branch_id) {
      await this.hrAccessService.assertCanAccessBranch(
        actor,
        designation.department.branch_id,
      );
    }

    const department =
      dto.department_id === undefined
        ? designation.department
        : await this.resolveDepartment(companyId, dto.department_id, actor);

    if (dto.code && dto.code !== designation.code) {
      const isUnique = await this.codeGeneratorService.validateCodeUnique(
        this.designationRepository,
        companyId,
        dto.code,
        id,
      );
      if (!isUnique) {
        throw new ConflictException(
          `Code "${dto.code}" already exists. Please use a different code.`,
        );
      }
      designation.code = dto.code;
    }

    Object.assign(designation, {
      ...dto,
      department_id: department?.id ?? null,
    });

    return this.mapDesignation(
      await this.designationRepository.save(designation),
    );
  }

  async remove(
    companyId: number,
    id: number,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const designation = await this.findDesignationOrFail(companyId, id);
    if (designation.department?.branch_id) {
      await this.hrAccessService.assertCanAccessBranch(
        actor,
        designation.department.branch_id,
      );
    }
    await this.designationRepository.remove(designation);
    return { message: 'Designation deleted successfully' };
  }
}
