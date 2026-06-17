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
import { Department } from '../departments/entities/department.entity';
import { Designation } from '../designations/entities/designation.entity';
import { HrAccessService } from '../shared/hr-access.service';
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
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(Designation)
    private readonly designationRepository: Repository<Designation>,
    private readonly hrAccessService: HrAccessService,
    private readonly codeGeneratorService: CodeGeneratorService,
  ) {}

  private mapPosition(position: Position) {
    return {
      id: position.id,
      company_id: position.company_id,
      name: position.name,
      code: position.code,
      branch_id: position.branch_id,
      department_id: position.department_id,
      designation_id: position.designation_id,
      reports_to_position_id: position.reports_to_position_id,
      level: position.level,
      is_manager: position.is_manager,
      headcount: position.headcount,
      is_active: position.is_active,
      description: position.description,
      status: position.status,
      created_at: position.created_at,
      updated_at: position.updated_at,
      branch: position.branch
        ? {
            id: position.branch.id,
            name: position.branch.name,
            code: position.branch.code,
            status: position.branch.status,
          }
        : null,
      department: position.department
        ? {
            id: position.department.id,
            name: position.department.name,
            code: position.department.code,
            branch_id: position.department.branch_id,
            status: position.department.status,
          }
        : null,
      designation: position.designation
        ? {
            id: position.designation.id,
            name: position.designation.name,
            code: position.designation.code,
            status: position.designation.status,
          }
        : null,
      reports_to_position: position.reports_to_position
        ? {
            id: position.reports_to_position.id,
            name: position.reports_to_position.name,
            code: position.reports_to_position.code,
            department_id: position.reports_to_position.department_id,
            branch_id: position.reports_to_position.branch_id,
          }
        : null,
    };
  }

  private async findPositionOrFail(
    companyId: number,
    positionId: number,
  ): Promise<Position> {
    const position = await this.positionRepository.findOne({
      where: { id: positionId, company_id: companyId },
      relations: {
        branch: true,
        department: true,
        designation: true,
        reports_to_position: true,
      },
    });

    if (!position) {
      throw new NotFoundException('Position not found');
    }

    return position;
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
      where: { id: branchId, company_id: companyId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    await this.hrAccessService.assertCanAccessBranch(actor, branch.id);
    return branch;
  }

  private async resolveDepartment(
    companyId: number,
    departmentId: number | null | undefined,
  ): Promise<Department | null> {
    if (!departmentId) {
      return null;
    }

    const department = await this.departmentRepository.findOne({
      where: { id: departmentId, company_id: companyId },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return department;
  }

  private async resolveDesignation(
    companyId: number,
    designationId: number | null | undefined,
  ): Promise<Designation | null> {
    if (!designationId) {
      return null;
    }

    const designation = await this.designationRepository.findOne({
      where: { id: designationId, company_id: companyId },
    });

    if (!designation) {
      throw new NotFoundException('Designation not found');
    }

    return designation;
  }

  private async resolveReportsToPosition(
    companyId: number,
    positionId: number | null | undefined,
  ): Promise<Position | null> {
    if (!positionId) {
      return null;
    }

    return this.findPositionOrFail(companyId, positionId);
  }

  private assertHierarchyConsistency(
    branch: Branch | null,
    department: Department | null,
    designation: Designation | null,
  ): void {
    if (
      department?.branch_id &&
      branch?.id &&
      department.branch_id !== branch.id
    ) {
      throw new BadRequestException(
        'department_id does not belong to the selected branch_id',
      );
    }

    if (
      designation?.department_id &&
      department?.id &&
      designation.department_id !== department.id
    ) {
      throw new BadRequestException(
        'designation_id does not belong to the selected department_id',
      );
    }
  }

  async create(
    companyId: number,
    createPositionDto: CreatePositionDto,
    actor: AuthenticatedUser,
  ) {
    const branch = await this.resolveBranch(
      companyId,
      createPositionDto.branch_id,
      actor,
    );
    const department = await this.resolveDepartment(
      companyId,
      createPositionDto.department_id,
    );
    const designation = await this.resolveDesignation(
      companyId,
      createPositionDto.designation_id,
    );
    const reportsToPosition = await this.resolveReportsToPosition(
      companyId,
      createPositionDto.reports_to_position_id,
    );

    this.assertHierarchyConsistency(branch, department, designation);
    if (department?.branch_id) {
      await this.hrAccessService.assertCanAccessBranch(
        actor,
        department.branch_id,
      );
    }

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
      branch_id: branch?.id ?? department?.branch_id ?? null,
      department_id: department?.id ?? null,
      designation_id: designation?.id ?? null,
      reports_to_position_id: reportsToPosition?.id ?? null,
      is_manager: createPositionDto.is_manager ?? false,
      headcount: createPositionDto.headcount ?? 1,
      is_active: createPositionDto.is_active ?? true,
      status: createPositionDto.status ?? 'active',
    });

    return this.mapPosition(await this.positionRepository.save(position));
  }

  async findAll(
    companyId: number,
    query: PositionQueryDto,
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
      department_id,
      designation_id,
      reports_to_position_id,
    } = query;

    if (branch_id) {
      await this.hrAccessService.assertCanAccessBranch(actor, branch_id);
    }

    const qb = this.positionRepository
      .createQueryBuilder('position')
      .leftJoinAndSelect('position.branch', 'branch')
      .leftJoinAndSelect('position.department', 'department')
      .leftJoinAndSelect('position.designation', 'designation')
      .leftJoinAndSelect('position.reports_to_position', 'reports_to_position')
      .where('position.company_id = :companyId', { companyId });

    if (status?.trim()) {
      qb.andWhere('position.status = :status', { status: status.trim() });
    }

    if (typeof branch_id === 'number') {
      qb.andWhere('position.branch_id = :branchId', { branchId: branch_id });
    }

    if (typeof department_id === 'number') {
      qb.andWhere('position.department_id = :departmentId', {
        departmentId: department_id,
      });
    }

    if (typeof designation_id === 'number') {
      qb.andWhere('position.designation_id = :designationId', {
        designationId: designation_id,
      });
    }

    if (typeof reports_to_position_id === 'number') {
      qb.andWhere('position.reports_to_position_id = :reportsToPositionId', {
        reportsToPositionId: reports_to_position_id,
      });
    }

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      qb.andWhere(
        '(position.name LIKE :term OR position.code LIKE :term OR position.description LIKE :term)',
        { term },
      );
    }

    const accessibleBranchIds =
      await this.hrAccessService.getAccessibleBranchIds(actor);
    if (accessibleBranchIds?.length === 0) {
      qb.andWhere('position.branch_id IS NULL');
    } else if (accessibleBranchIds) {
      qb.andWhere(
        '(position.branch_id IS NULL OR position.branch_id IN (:...branchIds))',
        { branchIds: accessibleBranchIds },
      );
    }

    const allowedSortFields = [
      'id',
      'name',
      'code',
      'branch_id',
      'department_id',
      'designation_id',
      'level',
      'headcount',
      'is_active',
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

  async findOne(
    companyId: number,
    positionId: number,
    actor: AuthenticatedUser,
  ) {
    const position = await this.findPositionOrFail(companyId, positionId);
    if (position.branch_id) {
      await this.hrAccessService.assertCanAccessBranch(
        actor,
        position.branch_id,
      );
    }
    return this.mapPosition(position);
  }

  async update(
    companyId: number,
    positionId: number,
    updatePositionDto: UpdatePositionDto,
    actor: AuthenticatedUser,
  ) {
    const position = await this.findPositionOrFail(companyId, positionId);
    if (position.branch_id) {
      await this.hrAccessService.assertCanAccessBranch(
        actor,
        position.branch_id,
      );
    }

    const branch =
      updatePositionDto.branch_id === undefined
        ? position.branch
        : await this.resolveBranch(
            companyId,
            updatePositionDto.branch_id,
            actor,
          );

    const department =
      updatePositionDto.department_id === undefined
        ? position.department
        : await this.resolveDepartment(
            companyId,
            updatePositionDto.department_id,
          );

    const designation =
      updatePositionDto.designation_id === undefined
        ? position.designation
        : await this.resolveDesignation(
            companyId,
            updatePositionDto.designation_id,
          );

    const reportsToPosition =
      updatePositionDto.reports_to_position_id === undefined
        ? position.reports_to_position
        : await this.resolveReportsToPosition(
            companyId,
            updatePositionDto.reports_to_position_id,
          );

    if (reportsToPosition && reportsToPosition.id === position.id) {
      throw new BadRequestException('A position cannot report to itself');
    }

    this.assertHierarchyConsistency(
      branch ?? null,
      department ?? null,
      designation ?? null,
    );
    if (department?.branch_id) {
      await this.hrAccessService.assertCanAccessBranch(
        actor,
        department.branch_id,
      );
    }

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

    Object.assign(position, {
      ...updatePositionDto,
      branch_id: branch?.id ?? department?.branch_id ?? null,
      department_id: department?.id ?? null,
      designation_id: designation?.id ?? null,
      reports_to_position_id: reportsToPosition?.id ?? null,
    });

    return this.mapPosition(await this.positionRepository.save(position));
  }

  async remove(
    companyId: number,
    positionId: number,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const position = await this.findPositionOrFail(companyId, positionId);
    if (position.branch_id) {
      await this.hrAccessService.assertCanAccessBranch(
        actor,
        position.branch_id,
      );
    }
    await this.positionRepository.remove(position);
    return { message: 'Position deleted successfully' };
  }
}
