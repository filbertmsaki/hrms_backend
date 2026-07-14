import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from './entities/department.entity';
import { CreateDepartmentDto } from './dtos/create-department.dto';
import { DepartmentQueryDto } from './dtos/department-query.dto';
import { UpdateDepartmentDto } from './dtos/update-department.dto';
import { HrAccessService } from '../shared/hr-access.service';
import { CodeGeneratorService } from '../shared/code-generator.service';
import { buildPaginationMeta } from '../shared/hr.utils';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    private readonly hrAccessService: HrAccessService,
    private readonly codeGeneratorService: CodeGeneratorService,
  ) {}

  private mapDepartment(department: Department) {
    return {
      id: department.id,
      company_id: department.company_id,
      branch_id: department.branch_id,
      parent_id: department.parent_id,
      name: department.name,
      code: department.code,
      description: department.description,
      status: department.status,
      created_at: department.created_at,
      updated_at: department.updated_at,
      branch_name: department.branch?.name ?? null,
      parent_name: department.parent?.name ?? null,
    };
  }

  private async findDepartmentOrFail(
    companyId: number,
    departmentId: number,
  ): Promise<Department> {
    const department = await this.departmentRepository.findOne({
      where: { id: departmentId, company_id: companyId },
      relations: {
        branch: true,
        parent: true,
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return department;
  }

  private async resolveBranch(
    companyId: number,
    branchId: number | null | undefined,
    actor: AuthenticatedUser,
  ): Promise<Branch | null> {
    if (!branchId) {
      return null;
    }

    const branch = await this.branchRepository.findOne({
      where: {
        id: branchId,
        company_id: companyId,
      },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    await this.hrAccessService.assertCanAccessBranch(actor, branch.id);
    return branch;
  }

  async create(
    companyId: number,
    createDepartmentDto: CreateDepartmentDto,
    actor: AuthenticatedUser,
  ) {
    const branch = await this.resolveBranch(
      companyId,
      createDepartmentDto.branch_id,
      actor,
    );

    let parent: Department | null = null;
    if (createDepartmentDto.parent_id) {
      parent = await this.findDepartmentOrFail(
        companyId,
        createDepartmentDto.parent_id,
      );

      if (parent.branch_id) {
        await this.hrAccessService.assertCanAccessBranch(
          actor,
          parent.branch_id,
        );
      }
    }

    const code = await this.codeGeneratorService.resolveCode(
      this.departmentRepository,
      companyId,
      createDepartmentDto.code,
      { prefix: 'DEP-', minDigits: 4 },
    );

    const department = this.departmentRepository.create({
      ...createDepartmentDto,
      code,
      company_id: companyId,
      branch_id: branch?.id ?? null,
      parent_id: parent?.id ?? null,
      status: createDepartmentDto.status ?? 'active',
    });

    return this.mapDepartment(await this.departmentRepository.save(department));
  }

  async findAll(
    companyId: number,
    query: DepartmentQueryDto,
    actor: AuthenticatedUser,
  ) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      search,
      status,
      branch_id,
      parent_id,
    } = query;

    if (branch_id) {
      await this.hrAccessService.assertCanAccessBranch(actor, branch_id);
    }

    const qb = this.departmentRepository
      .createQueryBuilder('department')
      .leftJoinAndSelect('department.branch', 'branch')
      .leftJoinAndSelect('department.parent', 'parent')
      .where('department.company_id = :companyId', { companyId });

    if (status?.trim()) {
      qb.andWhere('department.status = :status', { status: status.trim() });
    }

    if (typeof branch_id === 'number') {
      qb.andWhere('department.branch_id = :branchId', { branchId: branch_id });
    }

    if (typeof parent_id === 'number') {
      qb.andWhere('department.parent_id = :parentId', { parentId: parent_id });
    }

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      qb.andWhere(
        '(department.name LIKE :term OR department.code LIKE :term OR department.description LIKE :term)',
        { term },
      );
    }

    const accessibleBranchIds =
      await this.hrAccessService.getAccessibleBranchIds(actor);

    if (accessibleBranchIds?.length === 0) {
      qb.andWhere('department.branch_id IS NULL');
    } else if (accessibleBranchIds) {
      qb.andWhere(
        '(department.branch_id IS NULL OR department.branch_id IN (:...branchIds))',
        { branchIds: accessibleBranchIds },
      );
    }

    const allowedSortFields = [
      'id',
      'name',
      'code',
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
      .orderBy(`department.${safeSortBy}`, direction)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((department) => this.mapDepartment(department)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOne(
    companyId: number,
    departmentId: number,
    actor: AuthenticatedUser,
  ) {
    const department = await this.findDepartmentOrFail(companyId, departmentId);

    if (department.branch_id) {
      await this.hrAccessService.assertCanAccessBranch(
        actor,
        department.branch_id,
      );
    }

    return this.mapDepartment(department);
  }

  async update(
    companyId: number,
    departmentId: number,
    updateDepartmentDto: UpdateDepartmentDto,
    actor: AuthenticatedUser,
  ) {
    const department = await this.findDepartmentOrFail(companyId, departmentId);

    if (department.branch_id) {
      await this.hrAccessService.assertCanAccessBranch(
        actor,
        department.branch_id,
      );
    }

    if (
      typeof updateDepartmentDto.parent_id === 'number' &&
      updateDepartmentDto.parent_id === department.id
    ) {
      throw new BadRequestException(
        'A department cannot be its own parent department',
      );
    }

    const branch =
      updateDepartmentDto.branch_id === undefined
        ? department.branch
        : await this.resolveBranch(
            companyId,
            updateDepartmentDto.branch_id,
            actor,
          );

    let parent =
      updateDepartmentDto.parent_id === undefined
        ? department.parent
        : updateDepartmentDto.parent_id
          ? await this.findDepartmentOrFail(
              companyId,
              updateDepartmentDto.parent_id,
            )
          : null;

    if (parent?.branch_id) {
      await this.hrAccessService.assertCanAccessBranch(actor, parent.branch_id);
    }

    // If code is being updated, validate uniqueness
    if (
      updateDepartmentDto.code &&
      updateDepartmentDto.code !== department.code
    ) {
      const isUnique = await this.codeGeneratorService.validateCodeUnique(
        this.departmentRepository,
        companyId,
        updateDepartmentDto.code,
        departmentId,
      );
      if (!isUnique) {
        throw new ConflictException(
          `Code "${updateDepartmentDto.code}" already exists. Please use a different code.`,
        );
      }
      department.code = updateDepartmentDto.code;
    }

    Object.assign(department, {
      ...updateDepartmentDto,
      branch_id: branch?.id ?? null,
      parent_id: parent?.id ?? null,
    });

    parent = null;

    return this.mapDepartment(await this.departmentRepository.save(department));
  }

  async remove(
    companyId: number,
    departmentId: number,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const department = await this.findDepartmentOrFail(companyId, departmentId);

    if (department.branch_id) {
      await this.hrAccessService.assertCanAccessBranch(
        actor,
        department.branch_id,
      );
    }

    await this.departmentRepository.remove(department);
    return { message: 'Department deleted successfully' };
  }
}
