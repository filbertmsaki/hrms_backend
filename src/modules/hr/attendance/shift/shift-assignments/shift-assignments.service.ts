import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../../shared/hr.utils';
import { Employee } from '../../../employees/entities/employee.entity';
import { Shift } from '../shifts/entities/shift.entity';
import { ShiftRotationGroup } from '../shift-rotation-groups/entities/shift-rotation-group.entity';
import { ShiftAssignment } from './entities/shift-assignment.entity';
import { ShiftAssignmentStatusEnum } from './enums/shift-assignment-status.enum';
import { CreateShiftAssignmentDto } from './dtos/create-shift-assignment.dto';
import { UpdateShiftAssignmentDto } from './dtos/update-shift-assignment.dto';
import { ShiftAssignmentQueryDto } from './dtos/shift-assignment-query.dto';
import {
  ensureCompanyOwnedEntity,
  ensureDateRangeOrder,
  ensureEmployeeBelongsToCompany,
} from '../../shared/attendance-domain.utils';
import { AttendanceAssignmentDomainService } from '../../shared/attendance-assignment-domain.service';

@Injectable()
export class ShiftAssignmentsService {
  constructor(
    @InjectRepository(ShiftAssignment)
    private readonly shiftAssignmentRepository: Repository<ShiftAssignment>,
    @InjectRepository(Shift)
    private readonly shiftRepository: Repository<Shift>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(ShiftRotationGroup)
    private readonly rotationGroupRepository: Repository<ShiftRotationGroup>,
    private readonly attendanceAssignmentDomainService: AttendanceAssignmentDomainService,
  ) {}

  private async ensureShift(companyId: number, shiftId: number): Promise<void> {
    await ensureCompanyOwnedEntity(
      this.shiftRepository,
      { id: shiftId, companyId },
      'shift_id does not belong to the active company',
    );
  }

  private async ensureEmployee(
    companyId: number,
    employeeId: number,
  ): Promise<void> {
    await ensureEmployeeBelongsToCompany(
      this.employeeRepository,
      companyId,
      employeeId,
    );
  }

  private async ensureRotationGroup(
    companyId: number,
    rotationGroupId?: number | null,
  ): Promise<void> {
    if (!rotationGroupId) return;
    await ensureCompanyOwnedEntity(
      this.rotationGroupRepository,
      { id: rotationGroupId, companyId },
      'rotation_group_id does not belong to the active company',
    );
  }

  private async findOrFail(
    companyId: number,
    id: number,
  ): Promise<ShiftAssignment> {
    const item = await this.shiftAssignmentRepository.findOne({
      where: { id, companyId },
    });
    if (!item) throw new NotFoundException('Shift assignment not found');
    return item;
  }

  async create(companyId: number, dto: CreateShiftAssignmentDto) {
    await this.ensureEmployee(companyId, dto.employee_id);
    await this.ensureShift(companyId, dto.shift_id);
    await this.ensureRotationGroup(companyId, dto.rotation_group_id);
    ensureDateRangeOrder(dto.effective_from, dto.effective_to ?? null);
    await this.attendanceAssignmentDomainService.ensureNoOverlappingShiftAssignment(
      {
        companyId,
        employeeId: dto.employee_id,
        effectiveFrom: dto.effective_from,
        effectiveTo: dto.effective_to ?? null,
        status: dto.status ?? ShiftAssignmentStatusEnum.ACTIVE,
      },
    );
    await this.attendanceAssignmentDomainService.ensureNoConflictingAssignmentType(
      {
        companyId,
        employeeId: dto.employee_id,
        effectiveFrom: dto.effective_from,
        effectiveTo: dto.effective_to ?? null,
        status: dto.status ?? ShiftAssignmentStatusEnum.ACTIVE,
        assignmentType: 'SHIFT',
      },
    );

    const duplicate = await this.shiftAssignmentRepository.findOne({
      where: {
        companyId,
        employeeId: dto.employee_id,
        shiftId: dto.shift_id,
        effectiveFrom: dto.effective_from,
      },
    });
    if (duplicate)
      throw new ConflictException(
        'Shift assignment already exists for this effective_from',
      );

    return this.shiftAssignmentRepository.save(
      this.shiftAssignmentRepository.create({
        companyId,
        employeeId: dto.employee_id,
        shiftId: dto.shift_id,
        effectiveFrom: dto.effective_from,
        effectiveTo: dto.effective_to ?? null,
        rotationGroupId: dto.rotation_group_id ?? null,
        isPrimary: dto.is_primary ?? false,
        status: dto.status,
        assignedBy: dto.assigned_by ?? null,
      }),
    );
  }

  async findAll(companyId: number, query: ShiftAssignmentQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'effective_from',
      sortOrder = SortDirection.DESC,
      employee_id,
      shift_id,
      status,
    } = query;

    const qb = this.shiftAssignmentRepository
      .createQueryBuilder('assignment')
      .where('assignment.company_id = :companyId', { companyId });
    if (employee_id)
      qb.andWhere('assignment.employee_id = :employeeId', {
        employeeId: employee_id,
      });
    if (shift_id)
      qb.andWhere('assignment.shift_id = :shiftId', { shiftId: shift_id });
    if (status) qb.andWhere('assignment.status = :status', { status });

    const sortFieldMap: Record<string, string> = {
      effective_from: 'effectiveFrom',
      created_at: 'createdAt',
    };
    const safeSortBy = sortFieldMap[sortBy] ?? sortFieldMap.effective_from;
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const [items, total] = await qb
      .orderBy(`assignment.${safeSortBy}`, direction)
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

  async update(companyId: number, id: number, dto: UpdateShiftAssignmentDto) {
    const item = await this.findOrFail(companyId, id);

    const employeeId = dto.employee_id ?? item.employeeId;
    const shiftId = dto.shift_id ?? item.shiftId;

    await this.ensureEmployee(companyId, employeeId);
    await this.ensureShift(companyId, shiftId);
    await this.ensureRotationGroup(
      companyId,
      dto.rotation_group_id ?? item.rotationGroupId,
    );
    const effectiveFrom = dto.effective_from ?? item.effectiveFrom;
    const effectiveTo =
      dto.effective_to !== undefined ? dto.effective_to : item.effectiveTo;
    const status = dto.status ?? item.status;

    ensureDateRangeOrder(effectiveFrom, effectiveTo);
    await this.attendanceAssignmentDomainService.ensureNoOverlappingShiftAssignment(
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
        assignmentType: 'SHIFT',
      },
    );

    item.employeeId = employeeId;
    item.shiftId = shiftId;

    if (dto.effective_from !== undefined)
      item.effectiveFrom = dto.effective_from;
    if (dto.effective_to !== undefined) item.effectiveTo = dto.effective_to;
    if (dto.rotation_group_id !== undefined)
      item.rotationGroupId = dto.rotation_group_id;
    if (dto.is_primary !== undefined) item.isPrimary = dto.is_primary;
    if (dto.status !== undefined) item.status = dto.status;
    if (dto.assigned_by !== undefined) item.assignedBy = dto.assigned_by;

    return this.shiftAssignmentRepository.save(item);
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.shiftAssignmentRepository.remove(item);
    return { message: 'Shift assignment deleted successfully' };
  }
}
