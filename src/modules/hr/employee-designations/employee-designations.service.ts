import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SortDirection } from '../../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { Designation } from '../designations/entities/designation.entity';
import { EmployeeDesignation } from '../employees/entities/employee-designation.entity';
import { Employee } from '../employees/entities/employee.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { buildPaginationMeta } from '../shared/hr.utils';
import { CreateEmployeeDesignationDto } from './dtos/create-employee-designation.dto';
import { EmployeeDesignationQueryDto } from './dtos/employee-designation-query.dto';
import { UpdateEmployeeDesignationDto } from './dtos/update-employee-designation.dto';

@Injectable()
export class EmployeeDesignationsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(EmployeeDesignation)
    private readonly employeeDesignationRepository: Repository<EmployeeDesignation>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Designation)
    private readonly designationRepository: Repository<Designation>,
    private readonly hrAccessService: HrAccessService,
  ) {}

  private mapAssignment(entity: EmployeeDesignation) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      employee_id: entity.employee_id,
      designation_id: entity.designation_id,
      start_date: entity.start_date,
      end_date: entity.end_date,
      is_current: entity.is_current,
      remarks: entity.remarks,
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
      designation: entity.designation
        ? {
            id: entity.designation.id,
            name: entity.designation.name,
            code: entity.designation.code,
          }
        : null,
    };
  }

  private async findEmployeeOrFail(companyId: number, id: number): Promise<Employee> {
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

  private async findDesignationOrFail(
    companyId: number,
    id: number,
  ): Promise<Designation> {
    const designation = await this.designationRepository.findOne({
      where: { id, company_id: companyId },
      relations: { department: true },
    });
    if (!designation) {
      throw new NotFoundException('Designation not found');
    }
    return designation;
  }

  private async findAssignmentOrFail(
    companyId: number,
    id: number,
  ): Promise<EmployeeDesignation> {
    const assignment = await this.employeeDesignationRepository.findOne({
      where: { id, company_id: companyId },
      relations: { employee: true, designation: true },
    });
    if (!assignment) {
      throw new NotFoundException('Employee designation assignment not found');
    }
    return assignment;
  }

  private async syncEmployeePrimaryDesignation(
    employeeId: number,
    companyId: number,
  ): Promise<void> {
    const current = await this.employeeDesignationRepository.findOne({
      where: {
        company_id: companyId,
        employee_id: employeeId,
        is_current: true,
      },
      order: { id: 'DESC' },
    });

    await this.employeeRepository.update(
      { id: employeeId },
      { primary_designation_id: current?.designation_id ?? null },
    );
  }

  async create(
    companyId: number,
    dto: CreateEmployeeDesignationDto,
    actor: AuthenticatedUser,
  ) {
    if (dto.end_date && new Date(dto.end_date) < new Date(dto.start_date)) {
      throw new BadRequestException('end_date cannot be before start_date');
    }

    const employee = await this.findEmployeeOrFail(companyId, dto.employee_id);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);
    const designation = await this.findDesignationOrFail(companyId, dto.designation_id);

    if (designation.department?.branch_id) {
      await this.hrAccessService.assertCanAccessBranch(
        actor,
        designation.department.branch_id,
      );
    }

    const createdId = await this.dataSource.transaction(async (manager) => {
      if (dto.is_current ?? true) {
        await manager.getRepository(EmployeeDesignation).update(
          {
            company_id: companyId,
            employee_id: employee.id,
            is_current: true,
          },
          { is_current: false },
        );
      }

      const saved = await manager.getRepository(EmployeeDesignation).save(
        manager.getRepository(EmployeeDesignation).create({
          company_id: companyId,
          employee_id: employee.id,
          designation_id: designation.id,
          start_date: dto.start_date,
          end_date: dto.end_date ?? null,
          is_current: dto.is_current ?? true,
          remarks: dto.remarks?.trim() || null,
        }),
      );

      await this.syncEmployeePrimaryDesignation(employee.id, companyId);
      return saved.id;
    });

    return this.findOne(companyId, createdId, actor);
  }

  async findAll(
    companyId: number,
    query: EmployeeDesignationQueryDto,
    actor: AuthenticatedUser,
  ) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      employee_id,
      designation_id,
      is_current,
    } = query;

    if (typeof employee_id === 'number') {
      const employee = await this.findEmployeeOrFail(companyId, employee_id);
      await this.hrAccessService.assertCanAccessEmployee(actor, employee);
    }

    const qb = this.employeeDesignationRepository
      .createQueryBuilder('employeeDesignation')
      .leftJoinAndSelect('employeeDesignation.employee', 'employee')
      .leftJoinAndSelect('employeeDesignation.designation', 'designation')
      .where('employeeDesignation.company_id = :companyId', { companyId });

    if (typeof employee_id === 'number') {
      qb.andWhere('employeeDesignation.employee_id = :employeeId', {
        employeeId: employee_id,
      });
    }

    if (typeof designation_id === 'number') {
      qb.andWhere('employeeDesignation.designation_id = :designationId', {
        designationId: designation_id,
      });
    }

    if (typeof is_current === 'boolean') {
      qb.andWhere('employeeDesignation.is_current = :isCurrent', {
        isCurrent: is_current,
      });
    }

    const allowedSortFields = [
      'id',
      'start_date',
      'end_date',
      'is_current',
      'created_at',
      'updated_at',
    ];
    const safeSortBy = allowedSortFields.includes(sortBy)
      ? sortBy
      : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const skip = (page - 1) * limit;

    const [items, total] = await qb
      .orderBy(`employeeDesignation.${safeSortBy}`, direction)
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
    const employee = await this.findEmployeeOrFail(companyId, assignment.employee_id);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);
    return this.mapAssignment(assignment);
  }

  async update(
    companyId: number,
    id: number,
    dto: UpdateEmployeeDesignationDto,
    actor: AuthenticatedUser,
  ) {
    const existing = await this.findAssignmentOrFail(companyId, id);
    const employee = await this.findEmployeeOrFail(companyId, existing.employee_id);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const nextEmployee = dto.employee_id
      ? await this.findEmployeeOrFail(companyId, dto.employee_id)
      : employee;
    if (dto.employee_id && dto.employee_id !== employee.id) {
      await this.hrAccessService.assertCanAccessEmployee(actor, nextEmployee);
    }

    const designation = dto.designation_id
      ? await this.findDesignationOrFail(companyId, dto.designation_id)
      : existing.designation;
    if (designation.department?.branch_id) {
      await this.hrAccessService.assertCanAccessBranch(
        actor,
        designation.department.branch_id,
      );
    }

    const startDate = dto.start_date ?? existing.start_date;
    const endDate = dto.end_date ?? existing.end_date;
    if (endDate && new Date(endDate) < new Date(startDate)) {
      throw new BadRequestException('end_date cannot be before start_date');
    }

    await this.dataSource.transaction(async (manager) => {
      if (dto.is_current) {
        await manager.getRepository(EmployeeDesignation).update(
          {
            company_id: companyId,
            employee_id: nextEmployee.id,
            is_current: true,
          },
          { is_current: false },
        );
      }

      Object.assign(existing, {
        employee_id: nextEmployee.id,
        designation_id: designation.id,
        start_date: startDate,
        end_date: endDate ?? null,
        is_current: dto.is_current ?? existing.is_current,
        remarks:
          dto.remarks !== undefined ? dto.remarks?.trim() || null : existing.remarks,
      });

      await manager.getRepository(EmployeeDesignation).save(existing);
      await this.syncEmployeePrimaryDesignation(nextEmployee.id, companyId);
      if (nextEmployee.id !== employee.id) {
        await this.syncEmployeePrimaryDesignation(employee.id, companyId);
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
    const employee = await this.findEmployeeOrFail(companyId, assignment.employee_id);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(EmployeeDesignation).remove(assignment);
      await this.syncEmployeePrimaryDesignation(employee.id, companyId);
    });

    return { message: 'Employee designation assignment deleted successfully' };
  }
}
