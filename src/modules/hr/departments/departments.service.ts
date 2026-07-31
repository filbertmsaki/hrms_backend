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
import { Employee } from '../employees/entities/employee.entity';
import { Position } from '../positions/entities/position.entity';
import { Department } from './entities/department.entity';
import { DepartmentPosition } from './entities/department-position.entity';
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
    @InjectRepository(DepartmentPosition)
    private readonly departmentPositionRepository: Repository<DepartmentPosition>,
    @InjectRepository(Position)
    private readonly positionRepository: Repository<Position>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
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

  private async resolvePositions(
    companyId: number,
    positionIds: number[] | undefined,
  ): Promise<Position[] | null> {
    if (!positionIds) {
      return null;
    }

    const uniqueIds = [...new Set(positionIds)];
    if (uniqueIds.length === 0) {
      return [];
    }

    const positions = await this.positionRepository.find({
      where: uniqueIds.map((id) => ({ id, company_id: companyId })),
    });

    if (positions.length !== uniqueIds.length) {
      throw new NotFoundException(
        'One or more selected positions could not be found',
      );
    }

    const inactive = positions.filter(
      (position) => !position.is_active || position.status !== 'active',
    );
    if (inactive.length > 0) {
      throw new BadRequestException(
        `Cannot assign inactive position(s): ${inactive.map((p) => p.name).join(', ')}`,
      );
    }

    return positions;
  }

  private async syncPositionMappings(
    companyId: number,
    departmentId: number,
    positions: Position[],
  ): Promise<void> {
    const existingMappings = await this.departmentPositionRepository.find({
      where: { company_id: companyId, department_id: departmentId },
    });

    const nextPositionIds = new Set(positions.map((p) => p.id));
    const mappingsToRemove = existingMappings.filter(
      (mapping) => !nextPositionIds.has(mapping.position_id),
    );

    for (const mapping of mappingsToRemove) {
      const employeeCount = await this.employeeRepository.count({
        where: {
          primary_department_id: departmentId,
          primary_position_id: mapping.position_id,
        },
      });

      if (employeeCount > 0) {
        const position = await this.positionRepository.findOne({
          where: { id: mapping.position_id },
        });
        throw new BadRequestException(
          `Cannot remove ${position?.name ?? 'this position'} from the department because ${employeeCount} employee(s) currently use this department-position combination`,
        );
      }
    }

    const existingPositionIds = new Set(
      existingMappings.map((mapping) => mapping.position_id),
    );
    const mappingsToAdd = positions.filter(
      (position) => !existingPositionIds.has(position.id),
    );

    if (mappingsToRemove.length > 0) {
      await this.departmentPositionRepository.remove(mappingsToRemove);
    }

    if (mappingsToAdd.length > 0) {
      await this.departmentPositionRepository.save(
        mappingsToAdd.map((position) =>
          this.departmentPositionRepository.create({
            company_id: companyId,
            department_id: departmentId,
            position_id: position.id,
          }),
        ),
      );
    }
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

    const positions = await this.resolvePositions(
      companyId,
      createDepartmentDto.position_ids,
    );

    const code = await this.codeGeneratorService.resolveCode(
      this.departmentRepository,
      companyId,
      createDepartmentDto.code,
      { prefix: 'DEP-', minDigits: 4 },
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { position_ids, ...departmentAttributes } = createDepartmentDto;
    const department = this.departmentRepository.create({
      ...departmentAttributes,
      code,
      company_id: companyId,
      branch_id: branch?.id ?? null,
      parent_id: parent?.id ?? null,
      status: createDepartmentDto.status ?? 'active',
    });

    const saved = await this.departmentRepository.save(department);

    if (positions) {
      await this.syncPositionMappings(companyId, saved.id, positions);
    }

    return this.mapDepartment(
      await this.findDepartmentOrFail(companyId, saved.id),
    );
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

    const positions = await this.resolvePositions(
      companyId,
      updateDepartmentDto.position_ids,
    );

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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { position_ids, ...updateAttributes } = updateDepartmentDto;
    Object.assign(department, {
      ...updateAttributes,
      branch_id: branch?.id ?? null,
      parent_id: parent?.id ?? null,
    });

    parent = null;

    const saved = await this.departmentRepository.save(department);

    if (positions) {
      await this.syncPositionMappings(companyId, saved.id, positions);
    }

    return this.mapDepartment(
      await this.findDepartmentOrFail(companyId, saved.id),
    );
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

    const employeeCount = await this.employeeRepository.count({
      where: { primary_department_id: departmentId },
    });
    if (employeeCount > 0) {
      throw new BadRequestException(
        `Cannot delete this department because ${employeeCount} employee(s) are currently assigned to it`,
      );
    }

    const childDepartmentCount = await this.departmentRepository.count({
      where: { parent_id: departmentId },
    });
    if (childDepartmentCount > 0) {
      throw new BadRequestException(
        'Cannot delete this department while it has child departments. Reassign or remove them first.',
      );
    }

    await this.departmentRepository.remove(department);
    return { message: 'Department deleted successfully' };
  }

  async listPositions(
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

    const mappings = await this.departmentPositionRepository.find({
      where: { company_id: companyId, department_id: departmentId },
      relations: { position: true },
      order: { created_at: 'ASC' },
    });

    return mappings
      .filter((mapping) => mapping.position)
      .map((mapping) => ({
        id: mapping.position.id,
        name: mapping.position.name,
        code: mapping.position.code,
        level: mapping.position.level,
        is_active: mapping.position.is_active,
        status: mapping.position.status,
      }));
  }

  async assignPosition(
    companyId: number,
    departmentId: number,
    positionId: number,
    actor: AuthenticatedUser,
  ) {
    const department = await this.findDepartmentOrFail(companyId, departmentId);
    if (department.branch_id) {
      await this.hrAccessService.assertCanAccessBranch(
        actor,
        department.branch_id,
      );
    }

    const position = await this.positionRepository.findOne({
      where: { id: positionId, company_id: companyId },
    });
    if (!position) {
      throw new NotFoundException('Position not found');
    }

    const existing = await this.departmentPositionRepository.findOne({
      where: {
        company_id: companyId,
        department_id: departmentId,
        position_id: positionId,
      },
    });

    if (!existing) {
      await this.departmentPositionRepository.save(
        this.departmentPositionRepository.create({
          company_id: companyId,
          department_id: departmentId,
          position_id: positionId,
        }),
      );
    }

    return this.listPositions(companyId, departmentId, actor);
  }

  async removePosition(
    companyId: number,
    departmentId: number,
    positionId: number,
    actor: AuthenticatedUser,
  ) {
    const department = await this.findDepartmentOrFail(companyId, departmentId);
    if (department.branch_id) {
      await this.hrAccessService.assertCanAccessBranch(
        actor,
        department.branch_id,
      );
    }

    const mapping = await this.departmentPositionRepository.findOne({
      where: {
        company_id: companyId,
        department_id: departmentId,
        position_id: positionId,
      },
    });

    if (!mapping) {
      throw new NotFoundException(
        'This position is not assigned to the department',
      );
    }

    const employeeCount = await this.employeeRepository.count({
      where: {
        primary_position_id: positionId,
        primary_department_id: departmentId,
      },
    });

    if (employeeCount > 0) {
      throw new BadRequestException(
        `The position cannot be removed from this department because ${employeeCount} employee(s) currently use this department-position combination`,
      );
    }

    await this.departmentPositionRepository.remove(mapping);

    return this.listPositions(companyId, departmentId, actor);
  }
}
