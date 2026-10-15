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
import { DepartmentPosition } from '../departments/entities/department-position.entity';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { PositionQueryDto } from './dtos/position-query.dto';
import { CreatePositionDto } from './dtos/create-position.dto';
import { UpdatePositionDto } from './dtos/update-position.dto';
import { CodeGeneratorService } from '../shared/code-generator.service';
import { buildPaginationMeta } from '../shared/hr.utils';
import { PositionAvailabilityService } from '../shared/position-availability.service';
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
    @InjectRepository(DepartmentPosition)
    private readonly departmentPositionRepository: Repository<DepartmentPosition>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private readonly hrAccessService: HrAccessService,
    private readonly codeGeneratorService: CodeGeneratorService,
    private readonly positionAvailabilityService: PositionAvailabilityService,
  ) {}

  private mapPosition(position: Position) {
    return {
      id: position.id,
      company_id: position.company_id,
      name: position.name,
      code: position.code,
      branch_id: position.branch_id,
      department_id: position.department_id,
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
      departments: (position.department_mappings ?? [])
        .filter((mapping) => mapping.department)
        .map((mapping) => ({
          id: mapping.department.id,
          name: mapping.department.name,
          code: mapping.department.code,
          branch_id: mapping.department.branch_id,
          status: mapping.department.status,
          headcount: mapping.headcount,
        })),
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
        reports_to_position: true,
        department_mappings: { department: true },
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

  private async resolveDepartments(
    companyId: number,
    departmentIds: number[] | undefined,
  ): Promise<Department[] | null> {
    if (!departmentIds) {
      return null;
    }

    const uniqueIds = [...new Set(departmentIds)];
    if (uniqueIds.length === 0) {
      return [];
    }

    const departments = await this.departmentRepository.find({
      where: uniqueIds.map((id) => ({ id, company_id: companyId })),
    });

    if (departments.length !== uniqueIds.length) {
      throw new NotFoundException(
        'One or more selected departments could not be found',
      );
    }

    return departments;
  }

  private async syncDepartmentMappings(
    companyId: number,
    positionId: number,
    departments: Department[],
    headcount = 1,
  ): Promise<void> {
    const existingMappings = await this.departmentPositionRepository.find({
      where: { company_id: companyId, position_id: positionId },
    });

    const nextDepartmentIds = new Set(departments.map((d) => d.id));
    const mappingsToRemove = existingMappings.filter(
      (mapping) => !nextDepartmentIds.has(mapping.department_id),
    );

    for (const mapping of mappingsToRemove) {
      const employeeCount = await this.employeeRepository.count({
        where: {
          primary_position_id: positionId,
          primary_department_id: mapping.department_id,
        },
      });

      if (employeeCount > 0) {
        const department = await this.departmentRepository.findOne({
          where: { id: mapping.department_id },
        });
        throw new BadRequestException(
          `Cannot remove this position from ${department?.name ?? 'the department'} because ${employeeCount} employee(s) are assigned to it there. Reassign those employee(s) to another position or department first.`,
        );
      }
    }

    const existingDepartmentIds = new Set(
      existingMappings.map((mapping) => mapping.department_id),
    );
    // The current Position form supplies one approved-seat value. Apply that
    // value to every selected department so editing Headcount keeps all
    // department-position capacities in sync.
    const retainedMappings = existingMappings.filter((mapping) =>
      nextDepartmentIds.has(mapping.department_id),
    );
    if (retainedMappings.length > 0) {
      await this.departmentPositionRepository
        .createQueryBuilder()
        .update(DepartmentPosition)
        .set({ headcount })
        .where('company_id = :companyId', { companyId })
        .andWhere('position_id = :positionId', { positionId })
        .andWhere('department_id IN (:...departmentIds)', {
          departmentIds: retainedMappings.map(
            (mapping) => mapping.department_id,
          ),
        })
        .execute();
    }
    const mappingsToAdd = departments.filter(
      (department) => !existingDepartmentIds.has(department.id),
    );

    if (mappingsToRemove.length > 0) {
      await this.departmentPositionRepository.remove(mappingsToRemove);
    }

    if (mappingsToAdd.length > 0) {
      await this.departmentPositionRepository.save(
        mappingsToAdd.map((department) =>
          this.departmentPositionRepository.create({
            company_id: companyId,
            department_id: department.id,
            position_id: positionId,
            headcount,
          }),
        ),
      );
    }
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
    const departments = await this.resolveDepartments(
      companyId,
      createPositionDto.department_ids ??
        (createPositionDto.department_id
          ? [createPositionDto.department_id]
          : undefined),
    );
    const primaryDepartment = departments?.[0] ?? null;
    const reportsToPosition = await this.resolveReportsToPosition(
      companyId,
      createPositionDto.reports_to_position_id,
    );

    for (const department of departments ?? []) {
      this.assertHierarchyConsistency(branch, department);
      if (department.branch_id) {
        await this.hrAccessService.assertCanAccessBranch(
          actor,
          department.branch_id,
        );
      }
    }

    const code = await this.codeGeneratorService.resolveCode(
      this.positionRepository,
      companyId,
      createPositionDto.code,
      { prefix: 'POS-', minDigits: 4 },
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { department_ids, ...positionAttributes } = createPositionDto;
    const position = this.positionRepository.create({
      ...positionAttributes,
      code,
      company_id: companyId,
      branch_id: branch?.id ?? primaryDepartment?.branch_id ?? null,
      department_id: primaryDepartment?.id ?? null,
      reports_to_position_id: reportsToPosition?.id ?? null,
      is_manager: createPositionDto.is_manager ?? false,
      headcount: createPositionDto.headcount ?? 1,
      is_active: createPositionDto.is_active ?? true,
      status: createPositionDto.status ?? 'active',
    });

    const saved = await this.positionRepository.save(position);

    if (departments) {
      await this.syncDepartmentMappings(
        companyId,
        saved.id,
        departments,
        saved.headcount,
      );
    }

    return this.mapPosition(await this.findPositionOrFail(companyId, saved.id));
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
      reports_to_position_id,
    } = query;

    if (branch_id) {
      await this.hrAccessService.assertCanAccessBranch(actor, branch_id);
    }

    const qb = this.positionRepository
      .createQueryBuilder('position')
      .leftJoinAndSelect('position.branch', 'branch')
      .leftJoinAndSelect('position.department', 'department')
      .leftJoinAndSelect('position.reports_to_position', 'reports_to_position')
      .where('position.company_id = :companyId', { companyId });

    if (status?.trim()) {
      qb.andWhere('position.status = :status', { status: status.trim() });
    }

    if (typeof branch_id === 'number') {
      qb.andWhere(
        `(
          position.branch_id = :branchId
          OR EXISTS (
            SELECT 1
            FROM department_positions department_position
            INNER JOIN departments mapped_department
              ON mapped_department.id = department_position.department_id
            WHERE department_position.company_id = position.company_id
              AND department_position.position_id = position.id
              AND mapped_department.branch_id = :branchId
          )
          OR (
            position.branch_id IS NULL
            AND position.department_id IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM department_positions any_department_position
              WHERE any_department_position.company_id = position.company_id
                AND any_department_position.position_id = position.id
            )
          )
        )`,
        { branchId: branch_id },
      );
    }

    if (typeof department_id === 'number') {
      qb.andWhere(
        `(
          position.department_id = :departmentId
          OR EXISTS (
            SELECT 1
            FROM department_positions department_position
            WHERE department_position.company_id = position.company_id
              AND department_position.position_id = position.id
              AND department_position.department_id = :departmentId
          )
          OR (
            position.branch_id IS NULL
            AND position.department_id IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM department_positions any_department_position
              WHERE any_department_position.company_id = position.company_id
                AND any_department_position.position_id = position.id
            )
          )
        )`,
        {
          departmentId: department_id,
        },
      );
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
      qb.andWhere(
        `position.branch_id IS NULL
         AND position.department_id IS NULL
         AND NOT EXISTS (
           SELECT 1
           FROM department_positions any_department_position
           WHERE any_department_position.company_id = position.company_id
             AND any_department_position.position_id = position.id
         )`,
      );
    } else if (accessibleBranchIds) {
      qb.andWhere(
        `(
          position.branch_id IN (:...branchIds)
          OR EXISTS (
            SELECT 1
            FROM department_positions department_position
            INNER JOIN departments mapped_department
              ON mapped_department.id = department_position.department_id
            WHERE department_position.company_id = position.company_id
              AND department_position.position_id = position.id
              AND mapped_department.branch_id IN (:...branchIds)
          )
          OR (
            position.branch_id IS NULL
            AND position.department_id IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM department_positions any_department_position
              WHERE any_department_position.company_id = position.company_id
                AND any_department_position.position_id = position.id
            )
          )
        )`,
        { branchIds: accessibleBranchIds },
      );
    }

    const allowedSortFields = [
      'id',
      'name',
      'code',
      'branch_id',
      'department_id',
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
    } else if (
      await this.positionAvailabilityService.positionHasMappings(
        companyId,
        position.id,
      )
    ) {
      const accessibleBranchIds =
        await this.hrAccessService.getAccessibleBranchIds(actor);

      if (accessibleBranchIds === null) {
        return this.mapPosition(position);
      }

      if (
        accessibleBranchIds.length === 0 ||
        !(await this.positionAvailabilityService.positionHasAccessibleMappings(
          companyId,
          position.id,
          accessibleBranchIds,
        ))
      ) {
        throw new NotFoundException('Position not found');
      }
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

    const departmentIdsInput =
      updatePositionDto.department_ids ??
      (updatePositionDto.department_id !== undefined
        ? updatePositionDto.department_id
          ? [updatePositionDto.department_id]
          : []
        : undefined);

    const departments = await this.resolveDepartments(
      companyId,
      departmentIdsInput,
    );
    const primaryDepartment = departments
      ? (departments[0] ?? null)
      : position.department;

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

    for (const department of departments ??
      [primaryDepartment].filter((d): d is Department => Boolean(d))) {
      this.assertHierarchyConsistency(branch ?? null, department);
      if (department.branch_id) {
        await this.hrAccessService.assertCanAccessBranch(
          actor,
          department.branch_id,
        );
      }
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { department_ids, ...updateAttributes } = updatePositionDto;
    Object.assign(position, {
      ...updateAttributes,
      branch_id: branch?.id ?? primaryDepartment?.branch_id ?? null,
      department_id: primaryDepartment?.id ?? null,
      reports_to_position_id: reportsToPosition?.id ?? null,
    });

    const saved = await this.positionRepository.save(position);

    if (departments) {
      await this.syncDepartmentMappings(
        companyId,
        saved.id,
        departments,
        saved.headcount,
      );
    }

    return this.mapPosition(await this.findPositionOrFail(companyId, saved.id));
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

    const employeeCount = await this.employeeRepository.count({
      where: { primary_position_id: positionId },
    });
    if (employeeCount > 0) {
      throw new BadRequestException(
        `Cannot delete this position because ${employeeCount} employee(s) are currently assigned to it`,
      );
    }

    const mappingCount = await this.departmentPositionRepository.count({
      where: { company_id: companyId, position_id: positionId },
    });
    if (mappingCount > 0) {
      throw new BadRequestException(
        'Cannot delete this position while it is still assigned to one or more departments. Remove the department assignments first.',
      );
    }

    await this.positionRepository.remove(position);
    return { message: 'Position deleted successfully' };
  }
}
