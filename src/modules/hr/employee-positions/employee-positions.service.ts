import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SortDirection } from '../../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { EmployeePositionAssignmentTypeEnum } from '../employees/enums/employee-position-assignment-type.enum';
import { EmployeePositionStatusEnum } from '../employees/enums/employee-position-status.enum';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeePosition } from '../employees/entities/employee-position.entity';
import { Position } from '../positions/entities/position.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { buildPaginationMeta } from '../shared/hr.utils';
import { CreateEmployeePositionDto } from './dtos/create-employee-position.dto';
import { EmployeePositionQueryDto } from './dtos/employee-position-query.dto';
import { UpdateEmployeePositionDto } from './dtos/update-employee-position.dto';

@Injectable()
export class EmployeePositionsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(EmployeePosition)
    private readonly employeePositionRepository: Repository<EmployeePosition>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Position)
    private readonly positionRepository: Repository<Position>,
    private readonly hrAccessService: HrAccessService,
  ) {}

  private mapAssignment(entity: EmployeePosition) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      employee_id: entity.employee_id,
      position_id: entity.position_id,
      is_primary: entity.is_primary,
      start_date: entity.start_date,
      end_date: entity.end_date,
      assignment_type: entity.assignment_type,
      status: entity.status,
      notes: entity.notes,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      employee: entity.employee
        ? {
            id: entity.employee.id,
            employee_no: entity.employee.employee_no,
            first_name: entity.employee.first_name,
            last_name: entity.employee.last_name,
          }
        : null,
      position: entity.position
        ? {
            id: entity.position.id,
            name: entity.position.name,
            code: entity.position.code,
            branch_id: entity.position.branch_id,
            department_id: entity.position.department_id,
          }
        : null,
    };
  }

  private async findEmployeeOrFail(
    companyId: number,
    id: number,
  ): Promise<Employee> {
    const employee = await this.employeeRepository.findOne({
      where: { id, company_user: { company_id: companyId } },
      relations: {
        department_assignments: {
          department: true,
        },
      },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return employee;
  }

  private async findPositionOrFail(
    companyId: number,
    id: number,
  ): Promise<Position> {
    const position = await this.positionRepository.findOne({
      where: { id, company_id: companyId },
    });
    if (!position) {
      throw new NotFoundException('Position not found');
    }
    return position;
  }

  private async findAssignmentOrFail(
    companyId: number,
    id: number,
  ): Promise<EmployeePosition> {
    const assignment = await this.employeePositionRepository.findOne({
      where: { id, company_id: companyId },
      relations: { employee: true, position: true },
    });
    if (!assignment) {
      throw new NotFoundException('Employee position assignment not found');
    }
    return assignment;
  }

  private async syncEmployeePrimarySnapshot(
    employeeId: number,
    companyId: number,
  ): Promise<void> {
    const currentPrimary = await this.employeePositionRepository.findOne({
      where: {
        company_id: companyId,
        employee_id: employeeId,
        is_primary: true,
        status: EmployeePositionStatusEnum.ACTIVE,
      },
      order: { id: 'DESC' },
    });

    await this.employeeRepository.update(
      { id: employeeId },
      {
        primary_position_id: currentPrimary?.position_id ?? null,
      },
    );
  }

  async create(
    companyId: number,
    dto: CreateEmployeePositionDto,
    actor: AuthenticatedUser,
  ) {
    if (dto.end_date && new Date(dto.end_date) < new Date(dto.start_date)) {
      throw new BadRequestException('end_date cannot be before start_date');
    }

    const employee = await this.findEmployeeOrFail(companyId, dto.employee_id);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const position = await this.findPositionOrFail(companyId, dto.position_id);
    if (position.branch_id) {
      await this.hrAccessService.assertCanAccessBranch(
        actor,
        position.branch_id,
      );
    }

    const createdId = await this.dataSource.transaction(async (manager) => {
      if (dto.is_primary) {
        await manager.getRepository(EmployeePosition).update(
          {
            company_id: companyId,
            employee_id: employee.id,
            is_primary: true,
          },
          { is_primary: false },
        );
      }

      const saved = await manager.getRepository(EmployeePosition).save(
        manager.getRepository(EmployeePosition).create({
          company_id: companyId,
          employee_id: employee.id,
          position_id: position.id,
          is_primary: dto.is_primary ?? false,
          start_date: dto.start_date,
          end_date: dto.end_date ?? null,
          assignment_type:
            dto.assignment_type ?? EmployeePositionAssignmentTypeEnum.PRIMARY,
          status: dto.status ?? EmployeePositionStatusEnum.ACTIVE,
          notes: dto.notes?.trim() || null,
        }),
      );

      await this.syncEmployeePrimarySnapshot(employee.id, companyId);
      return saved.id;
    });

    return this.findOne(companyId, createdId, actor);
  }

  async findAll(
    companyId: number,
    query: EmployeePositionQueryDto,
    actor: AuthenticatedUser,
  ) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      employee_id,
      position_id,
      status,
      is_primary,
    } = query;

    if (typeof employee_id === 'number') {
      const employee = await this.findEmployeeOrFail(companyId, employee_id);
      await this.hrAccessService.assertCanAccessEmployee(actor, employee);
    }

    const qb = this.employeePositionRepository
      .createQueryBuilder('employeePosition')
      .leftJoinAndSelect('employeePosition.employee', 'employee')
      .leftJoinAndSelect('employeePosition.position', 'position')
      .where('employeePosition.company_id = :companyId', { companyId });

    if (typeof employee_id === 'number') {
      qb.andWhere('employeePosition.employee_id = :employeeId', {
        employeeId: employee_id,
      });
    }

    if (typeof position_id === 'number') {
      qb.andWhere('employeePosition.position_id = :positionId', {
        positionId: position_id,
      });
    }

    if (status) {
      qb.andWhere('employeePosition.status = :status', { status });
    }

    if (typeof is_primary === 'boolean') {
      qb.andWhere('employeePosition.is_primary = :isPrimary', {
        isPrimary: is_primary,
      });
    }

    const accessibleBranchIds =
      await this.hrAccessService.getAccessibleBranchIds(actor);
    if (accessibleBranchIds?.length === 0) {
      qb.andWhere('position.branch_id IS NULL');
    } else if (accessibleBranchIds) {
      qb.andWhere(
        '(position.branch_id IS NULL OR position.branch_id IN (:...branchIds))',
        {
          branchIds: accessibleBranchIds,
        },
      );
    }

    const allowedSortFields = [
      'id',
      'start_date',
      'end_date',
      'status',
      'is_primary',
      'created_at',
      'updated_at',
    ];
    const safeSortBy = allowedSortFields.includes(sortBy)
      ? sortBy
      : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const skip = (page - 1) * limit;

    const [items, total] = await qb
      .orderBy(`employeePosition.${safeSortBy}`, direction)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.mapAssignment(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOne(companyId: number, id: number, actor: AuthenticatedUser) {
    const assignment = await this.findAssignmentOrFail(companyId, id);
    const employee = await this.findEmployeeOrFail(
      companyId,
      assignment.employee_id,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);
    return this.mapAssignment(assignment);
  }

  async update(
    companyId: number,
    id: number,
    dto: UpdateEmployeePositionDto,
    actor: AuthenticatedUser,
  ) {
    const existing = await this.findAssignmentOrFail(companyId, id);
    const employee = await this.findEmployeeOrFail(
      companyId,
      existing.employee_id,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const nextEmployee = dto.employee_id
      ? await this.findEmployeeOrFail(companyId, dto.employee_id)
      : employee;
    if (dto.employee_id && dto.employee_id !== employee.id) {
      await this.hrAccessService.assertCanAccessEmployee(actor, nextEmployee);
    }

    const position = dto.position_id
      ? await this.findPositionOrFail(companyId, dto.position_id)
      : existing.position;
    if (position.branch_id) {
      await this.hrAccessService.assertCanAccessBranch(
        actor,
        position.branch_id,
      );
    }

    const startDate = dto.start_date ?? existing.start_date;
    const endDate = dto.end_date ?? existing.end_date;
    if (endDate && new Date(endDate) < new Date(startDate)) {
      throw new BadRequestException('end_date cannot be before start_date');
    }

    await this.dataSource.transaction(async (manager) => {
      if (dto.is_primary) {
        await manager.getRepository(EmployeePosition).update(
          {
            company_id: companyId,
            employee_id: nextEmployee.id,
            is_primary: true,
          },
          { is_primary: false },
        );
      }

      Object.assign(existing, {
        employee_id: nextEmployee.id,
        position_id: position.id,
        is_primary: dto.is_primary ?? existing.is_primary,
        start_date: startDate,
        end_date: endDate ?? null,
        assignment_type: dto.assignment_type ?? existing.assignment_type,
        status: dto.status ?? existing.status,
        notes:
          dto.notes !== undefined ? dto.notes?.trim() || null : existing.notes,
      });

      await manager.getRepository(EmployeePosition).save(existing);
      await this.syncEmployeePrimarySnapshot(nextEmployee.id, companyId);
      if (nextEmployee.id !== employee.id) {
        await this.syncEmployeePrimarySnapshot(employee.id, companyId);
      }
    });

    return this.findOne(companyId, id, actor);
  }

  async remove(
    companyId: number,
    id: number,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const assignment = await this.findAssignmentOrFail(companyId, id);
    const employee = await this.findEmployeeOrFail(
      companyId,
      assignment.employee_id,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(EmployeePosition).remove(assignment);
      await this.syncEmployeePrimarySnapshot(employee.id, companyId);
    });

    return { message: 'Employee position assignment deleted successfully' };
  }
}
