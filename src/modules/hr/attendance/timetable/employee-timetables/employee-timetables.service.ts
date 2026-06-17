import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../../shared/hr.utils';
import { Employee } from '../../../employees/entities/employee.entity';
import { Timetable } from '../timetables/entities/timetable.entity';
import { EmployeeTimetable } from './entities/employee-timetable.entity';
import { CreateEmployeeTimetableDto } from './dtos/create-employee-timetable.dto';
import { UpdateEmployeeTimetableDto } from './dtos/update-employee-timetable.dto';
import { EmployeeTimetableQueryDto } from './dtos/employee-timetable-query.dto';
import { EmployeeTimetableStatusEnum } from './enums/employee-timetable-status.enum';
import { TimetableGeneratedScheduleInvalidationService } from '../timetable-generated-schedules/timetable-generated-schedule-invalidation.service';

@Injectable()
export class EmployeeTimetablesService {
  constructor(
    @InjectRepository(EmployeeTimetable)
    private readonly employeeTimetableRepository: Repository<EmployeeTimetable>,
    @InjectRepository(Timetable)
    private readonly timetableRepository: Repository<Timetable>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private readonly generatedScheduleInvalidationService: TimetableGeneratedScheduleInvalidationService,
  ) {}

  private compareDates(a: string, b: string): number {
    return a.localeCompare(b);
  }

  private minDate(...values: Array<string | null | undefined>): string | null {
    const filtered = values.filter((value): value is string => Boolean(value));
    if (!filtered.length) {
      return null;
    }

    return filtered.reduce((min, current) =>
      this.compareDates(current, min) < 0 ? current : min,
    );
  }

  private maxDate(...values: Array<string | null | undefined>): string | null {
    const filtered = values.filter((value): value is string => Boolean(value));
    if (!filtered.length) {
      return null;
    }

    return filtered.reduce((max, current) =>
      this.compareDates(current, max) > 0 ? current : max,
    );
  }

  private async invalidateGeneratedSchedulesForAssignmentChange(
    companyId: number,
    employeeId: number,
    previousRange: { effectiveFrom: string; effectiveTo: string | null } | null,
    nextRange: { effectiveFrom: string; effectiveTo: string | null } | null,
  ): Promise<void> {
    const fromDate = this.minDate(
      previousRange?.effectiveFrom,
      nextRange?.effectiveFrom,
    );
    const hasOpenEndedRange =
      previousRange?.effectiveTo === null || nextRange?.effectiveTo === null;
    const toDate = hasOpenEndedRange
      ? null
      : this.maxDate(previousRange?.effectiveTo, nextRange?.effectiveTo);

    if (!fromDate) {
      return;
    }

    await this.generatedScheduleInvalidationService.invalidate({
      companyId,
      employeeId,
      fromDate,
      toDate,
    });
  }

  private async ensureTimetable(
    companyId: number,
    timetableId: number,
  ): Promise<void> {
    const item = await this.timetableRepository.findOne({
      where: { id: timetableId, companyId },
      select: ['id'],
    });
    if (!item)
      throw new BadRequestException(
        'timetable_id does not belong to the active company',
      );
  }

  private async ensureEmployee(
    companyId: number,
    employeeId: number,
  ): Promise<void> {
    const item = await this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin('employee.company_user', 'companyUser')
      .where('employee.id = :employeeId', { employeeId })
      .andWhere('companyUser.company_id = :companyId', { companyId })
      .getOne();
    if (!item)
      throw new BadRequestException(
        'employee_id does not belong to the active company',
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

  private ensureEffectiveRange(
    effectiveFrom: string,
    effectiveTo?: string | null,
  ): void {
    if (!effectiveTo) return;
    if (effectiveTo < effectiveFrom) {
      throw new BadRequestException(
        'effective_to cannot be before effective_from',
      );
    }
  }

  private async ensureNoActiveOverlap(input: {
    companyId: number;
    employeeId: number;
    effectiveFrom: string;
    effectiveTo: string | null;
    status: EmployeeTimetableStatusEnum;
    ignoreId?: number;
  }): Promise<void> {
    const {
      companyId,
      employeeId,
      effectiveFrom,
      effectiveTo,
      status,
      ignoreId,
    } = input;
    if (status !== EmployeeTimetableStatusEnum.ACTIVE) {
      return;
    }

    const qb = this.employeeTimetableRepository
      .createQueryBuilder('employeeTimetable')
      .where('employeeTimetable.company_id = :companyId', { companyId })
      .andWhere('employeeTimetable.employee_id = :employeeId', { employeeId })
      .andWhere('employeeTimetable.status = :status', {
        status: EmployeeTimetableStatusEnum.ACTIVE,
      })
      .andWhere('employeeTimetable.effective_from <= :candidateEnd', {
        candidateEnd: effectiveTo ?? '9999-12-31',
      })
      .andWhere(
        '(employeeTimetable.effective_to IS NULL OR employeeTimetable.effective_to >= :candidateStart)',
        { candidateStart: effectiveFrom },
      );

    if (ignoreId) {
      qb.andWhere('employeeTimetable.id != :ignoreId', { ignoreId });
    }

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException(
        'Active employee timetable overlaps an existing timetable assignment',
      );
    }
  }

  async create(companyId: number, dto: CreateEmployeeTimetableDto) {
    await this.ensureEmployee(companyId, dto.employee_id);
    await this.ensureTimetable(companyId, dto.timetable_id);
    this.ensureEffectiveRange(dto.effective_from, dto.effective_to ?? null);
    await this.ensureNoActiveOverlap({
      companyId,
      employeeId: dto.employee_id,
      effectiveFrom: dto.effective_from,
      effectiveTo: dto.effective_to ?? null,
      status: dto.status ?? EmployeeTimetableStatusEnum.ACTIVE,
    });

    const duplicate = await this.employeeTimetableRepository.findOne({
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

    const created = await this.employeeTimetableRepository.save(
      this.employeeTimetableRepository.create({
        companyId,
        employeeId: dto.employee_id,
        timetableId: dto.timetable_id,
        effectiveFrom: dto.effective_from,
        effectiveTo: dto.effective_to ?? null,
        status: dto.status,
        assignedBy: dto.assigned_by ?? null,
      }),
    );

    await this.invalidateGeneratedSchedulesForAssignmentChange(
      companyId,
      created.employeeId,
      null,
      {
        effectiveFrom: created.effectiveFrom,
        effectiveTo: created.effectiveTo,
      },
    );

    return created;
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
    const previousRange = {
      effectiveFrom: item.effectiveFrom,
      effectiveTo: item.effectiveTo,
    };
    const previousEmployeeId = item.employeeId;

    const employeeId = dto.employee_id ?? item.employeeId;
    const timetableId = dto.timetable_id ?? item.timetableId;

    await this.ensureEmployee(companyId, employeeId);
    await this.ensureTimetable(companyId, timetableId);
    const effectiveFrom = dto.effective_from ?? item.effectiveFrom;
    const effectiveTo =
      dto.effective_to !== undefined ? dto.effective_to : item.effectiveTo;
    const status = dto.status ?? item.status;

    this.ensureEffectiveRange(effectiveFrom, effectiveTo);
    await this.ensureNoActiveOverlap({
      companyId,
      employeeId,
      effectiveFrom,
      effectiveTo,
      status,
      ignoreId: item.id,
    });

    item.employeeId = employeeId;
    item.timetableId = timetableId;

    if (dto.effective_from !== undefined)
      item.effectiveFrom = dto.effective_from;
    if (dto.effective_to !== undefined) item.effectiveTo = dto.effective_to;
    if (dto.status !== undefined) item.status = dto.status;
    if (dto.assigned_by !== undefined) item.assignedBy = dto.assigned_by;

    const saved = await this.employeeTimetableRepository.save(item);

    await this.invalidateGeneratedSchedulesForAssignmentChange(
      companyId,
      previousEmployeeId,
      previousRange,
      previousEmployeeId === saved.employeeId
        ? {
            effectiveFrom: saved.effectiveFrom,
            effectiveTo: saved.effectiveTo,
          }
        : null,
    );

    if (saved.employeeId !== previousEmployeeId) {
      await this.invalidateGeneratedSchedulesForAssignmentChange(
        companyId,
        saved.employeeId,
        null,
        {
          effectiveFrom: saved.effectiveFrom,
          effectiveTo: saved.effectiveTo,
        },
      );
    }

    return saved;
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.employeeTimetableRepository.remove(item);
    await this.invalidateGeneratedSchedulesForAssignmentChange(
      companyId,
      item.employeeId,
      {
        effectiveFrom: item.effectiveFrom,
        effectiveTo: item.effectiveTo,
      },
      null,
    );
    return { message: 'Employee timetable deleted successfully' };
  }
}
