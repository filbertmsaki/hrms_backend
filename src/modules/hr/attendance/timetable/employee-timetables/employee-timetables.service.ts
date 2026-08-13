import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { SortDirection } from '../../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../../shared/hr.utils';
import { Employee } from '../../../employees/entities/employee.entity';
import { Timetable } from '../timetables/entities/timetable.entity';
import { EmployeeTimetable } from './entities/employee-timetable.entity';
import { CreateEmployeeTimetableDto } from './dtos/create-employee-timetable.dto';
import { UpdateEmployeeTimetableDto } from './dtos/update-employee-timetable.dto';
import { EmployeeTimetableQueryDto } from './dtos/employee-timetable-query.dto';
import { EmployeeTimetableStatusEnum } from './enums/employee-timetable-status.enum';
import {
  ensureCompanyOwnedEntity,
  ensureDateRangeOrder,
  ensureEmployeeBelongsToCompany,
} from '../../shared/attendance-domain.utils';
import { AttendanceAssignmentDomainService } from '../../shared/attendance-assignment-domain.service';

@Injectable()
export class EmployeeTimetablesService {
  constructor(
    @InjectRepository(EmployeeTimetable)
    private readonly employeeTimetableRepository: Repository<EmployeeTimetable>,
    @InjectRepository(Timetable)
    private readonly timetableRepository: Repository<Timetable>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private readonly attendanceAssignmentDomainService: AttendanceAssignmentDomainService,
  ) {}

  private getEmployeeTimetableRepository(
    manager?: EntityManager,
  ): Repository<EmployeeTimetable> {
    return (
      manager?.getRepository(EmployeeTimetable) ??
      this.employeeTimetableRepository
    );
  }

  private getTimetableRepository(
    manager?: EntityManager,
  ): Repository<Timetable> {
    return manager?.getRepository(Timetable) ?? this.timetableRepository;
  }

  private getEmployeeRepository(manager?: EntityManager): Repository<Employee> {
    return manager?.getRepository(Employee) ?? this.employeeRepository;
  }

  private async ensureTimetable(
    companyId: number,
    timetableId: number,
    manager?: EntityManager,
  ): Promise<void> {
    await ensureCompanyOwnedEntity(
      this.getTimetableRepository(manager),
      { id: timetableId, companyId },
      'timetable_id does not belong to the active company',
    );
  }

  private async ensureEmployee(
    companyId: number,
    employeeId: number,
    manager?: EntityManager,
  ): Promise<void> {
    await ensureEmployeeBelongsToCompany(
      this.getEmployeeRepository(manager),
      companyId,
      employeeId,
    );
  }

  private async findOrFail(
    companyId: number,
    id: number,
  ): Promise<EmployeeTimetable> {
    const item = await this.employeeTimetableRepository.findOne({
      where: { id, companyId },
    });
    if (!item) throw new NotFoundException('Employee timetable not found');
    return item;
  }

  async create(
    companyId: number,
    dto: CreateEmployeeTimetableDto,
    manager?: EntityManager,
  ) {
    const repository = this.getEmployeeTimetableRepository(manager);

    await this.ensureEmployee(companyId, dto.employee_id, manager);
    await this.ensureTimetable(companyId, dto.timetable_id, manager);
    ensureDateRangeOrder(dto.effective_from, dto.effective_to ?? null);
    await this.attendanceAssignmentDomainService.ensureNoOverlappingEmployeeTimetable(
      {
        companyId,
        employeeId: dto.employee_id,
        effectiveFrom: dto.effective_from,
        effectiveTo: dto.effective_to ?? null,
        status: dto.status ?? EmployeeTimetableStatusEnum.ACTIVE,
        manager,
      },
    );
    await this.attendanceAssignmentDomainService.ensureNoConflictingAssignmentType(
      {
        companyId,
        employeeId: dto.employee_id,
        effectiveFrom: dto.effective_from,
        effectiveTo: dto.effective_to ?? null,
        status: dto.status ?? EmployeeTimetableStatusEnum.ACTIVE,
        assignmentType: 'TIMETABLE',
      },
    );

    const duplicate = await repository.findOne({
      where: {
        companyId,
        employeeId: dto.employee_id,
        timetableId: dto.timetable_id,
        effectiveFrom: dto.effective_from,
      },
    });
    if (duplicate)
      throw new ConflictException(
        'Employee timetable assignment already exists for effective_from',
      );

    return repository.save(
      repository.create({
        companyId,
        employeeId: dto.employee_id,
        timetableId: dto.timetable_id,
        effectiveFrom: dto.effective_from,
        effectiveTo: dto.effective_to ?? null,
        status: dto.status,
        assignedBy: dto.assigned_by ?? null,
      }),
    );
  }

  async findAll(companyId: number, query: EmployeeTimetableQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'effective_from',
      sortOrder = SortDirection.DESC,
      employee_id,
      timetable_id,
      status,
    } = query;

    const qb = this.employeeTimetableRepository
      .createQueryBuilder('employeeTimetable')
      .where('employeeTimetable.company_id = :companyId', { companyId });
    if (employee_id)
      qb.andWhere('employeeTimetable.employee_id = :employeeId', {
        employeeId: employee_id,
      });
    if (timetable_id)
      qb.andWhere('employeeTimetable.timetable_id = :timetableId', {
        timetableId: timetable_id,
      });
    if (status) qb.andWhere('employeeTimetable.status = :status', { status });

    const sortFieldMap: Record<string, string> = {
      effective_from: 'effectiveFrom',
      created_at: 'createdAt',
    };
    const safeSortBy = sortFieldMap[sortBy] ?? sortFieldMap.effective_from;
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const [items, total] = await qb
      .orderBy(`employeeTimetable.${safeSortBy}`, direction)
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

  async update(companyId: number, id: number, dto: UpdateEmployeeTimetableDto) {
    const item = await this.findOrFail(companyId, id);
    const employeeId = dto.employee_id ?? item.employeeId;
    const timetableId = dto.timetable_id ?? item.timetableId;

    await this.ensureEmployee(companyId, employeeId);
    await this.ensureTimetable(companyId, timetableId);
    const effectiveFrom = dto.effective_from ?? item.effectiveFrom;
    const effectiveTo =
      dto.effective_to !== undefined ? dto.effective_to : item.effectiveTo;
    const status = dto.status ?? item.status;

    ensureDateRangeOrder(effectiveFrom, effectiveTo);
    await this.attendanceAssignmentDomainService.ensureNoOverlappingEmployeeTimetable(
      {
        companyId,
        employeeId,
        effectiveFrom,
        effectiveTo,
        status,
        ignoreId: item.id,
      },
    );
    await this.attendanceAssignmentDomainService.ensureNoConflictingAssignmentType(
      {
        companyId,
        employeeId,
        effectiveFrom,
        effectiveTo,
        status,
        assignmentType: 'TIMETABLE',
      },
    );

    item.employeeId = employeeId;
    item.timetableId = timetableId;

    if (dto.effective_from !== undefined)
      item.effectiveFrom = dto.effective_from;
    if (dto.effective_to !== undefined) item.effectiveTo = dto.effective_to;
    if (dto.status !== undefined) item.status = dto.status;
    if (dto.assigned_by !== undefined) item.assignedBy = dto.assigned_by;

    return this.employeeTimetableRepository.save(item);
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.employeeTimetableRepository.remove(item);
    return { message: 'Employee timetable deleted successfully' };
  }
}
