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
import { Branch } from '../../../branches/entities/branch.entity';
import { Department } from '../../../departments/entities/department.entity';
import { Shift } from './entities/shift.entity';
import { CreateShiftDto } from './dtos/create-shift.dto';
import { UpdateShiftDto } from './dtos/update-shift.dto';
import { ShiftQueryDto } from './dtos/shift-query.dto';

@Injectable()
export class ShiftsService {
  constructor(
    @InjectRepository(Shift)
    private readonly shiftRepository: Repository<Shift>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
  ) {}

  private async ensureBranch(
    companyId: number,
    branchId?: number | null,
  ): Promise<void> {
    if (!branchId) return;
    const branch = await this.branchRepository.findOne({
      where: { id: branchId, company_id: companyId },
    });
    if (!branch)
      throw new BadRequestException(
        'branch_id does not belong to the active company',
      );
  }

  private async ensureDepartment(
    companyId: number,
    departmentId?: number | null,
  ): Promise<void> {
    if (!departmentId) return;
    const department = await this.departmentRepository.findOne({
      where: { id: departmentId, company_id: companyId },
    });
    if (!department)
      throw new BadRequestException(
        'department_id does not belong to the active company',
      );
  }

  private async findOrFail(companyId: number, id: number): Promise<Shift> {
    const item = await this.shiftRepository.findOne({
      where: { id, companyId },
    });
    if (!item) throw new NotFoundException('Shift not found');
    return item;
  }

  async create(
    companyId: number,
    createdBy: number | null,
    dto: CreateShiftDto,
  ) {
    await this.ensureBranch(companyId, dto.branch_id);
    await this.ensureDepartment(companyId, dto.department_id);

    const code = dto.code.trim();
    const name = dto.name.trim();

    const existingCode = await this.shiftRepository.findOne({
      where: { companyId, code },
    });
    if (existingCode)
      throw new ConflictException('Shift code already exists for this company');

    const existingName = await this.shiftRepository.findOne({
      where: { companyId, name },
    });
    if (existingName)
      throw new ConflictException('Shift name already exists for this company');

    const created = this.shiftRepository.create({
      companyId,
      branchId: dto.branch_id ?? null,
      departmentId: dto.department_id ?? null,
      name,
      code,
      description: dto.description?.trim() || null,
      shiftType: dto.shift_type,
      startTime: dto.start_time,
      endTime: dto.end_time,
      expectedWorkMinutes: dto.expected_work_minutes,
      minimumWorkMinutes: dto.minimum_work_minutes,
      halfDayMinutes: dto.half_day_minutes,
      graceInMinutes: dto.grace_in_minutes ?? 0,
      graceOutMinutes: dto.grace_out_minutes ?? 0,
      lateAfterMinutes: dto.late_after_minutes ?? 0,
      earlyLeaveAfterMinutes: dto.early_leave_after_minutes ?? 0,
      isNightShift: dto.is_night_shift ?? false,
      crossesMidnight: dto.crosses_midnight ?? false,
      allowOvertime: dto.allow_overtime ?? false,
      maxOvertimeMinutes: dto.max_overtime_minutes ?? 0,
      requiresCheckout: dto.requires_checkout ?? true,
      allowEarlyCheckin: dto.allow_early_checkin ?? true,
      allowLateCheckout: dto.allow_late_checkout ?? true,
      status: dto.status,
      createdBy,
    });

    return this.shiftRepository.save(created);
  }

  async findAll(companyId: number, query: ShiftQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      search,
      branch_id,
      department_id,
      shift_type,
      status,
    } = query;

    const qb = this.shiftRepository
      .createQueryBuilder('shift')
      .where('shift.company_id = :companyId', { companyId });

    if (branch_id)
      qb.andWhere('shift.branch_id = :branchId', { branchId: branch_id });
    if (department_id)
      qb.andWhere('shift.department_id = :departmentId', {
        departmentId: department_id,
      });
    if (shift_type)
      qb.andWhere('shift.shift_type = :shiftType', { shiftType: shift_type });
    if (status) qb.andWhere('shift.status = :status', { status });
    if (search?.trim())
      qb.andWhere('(shift.name LIKE :term OR shift.code LIKE :term)', {
        term: `%${search.trim()}%`,
      });

    const sortFieldMap: Record<string, string> = {
      name: 'name',
      code: 'code',
      created_at: 'createdAt',
      updated_at: 'updatedAt',
    };
    const safeSortBy = sortFieldMap[sortBy] ?? sortFieldMap.created_at;
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const [items, total] = await qb
      .orderBy(`shift.${safeSortBy}`, direction)
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

  async update(companyId: number, id: number, dto: UpdateShiftDto) {
    const item = await this.findOrFail(companyId, id);

    if (dto.branch_id !== undefined) {
      await this.ensureBranch(companyId, dto.branch_id);
      item.branchId = dto.branch_id ?? null;
    }

    if (dto.department_id !== undefined) {
      await this.ensureDepartment(companyId, dto.department_id);
      item.departmentId = dto.department_id ?? null;
    }

    if (dto.code !== undefined) {
      const code = dto.code.trim();
      const existing = await this.shiftRepository.findOne({
        where: { companyId, code },
      });
      if (existing && existing.id !== item.id)
        throw new ConflictException(
          'Shift code already exists for this company',
        );
      item.code = code;
    }

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      const existing = await this.shiftRepository.findOne({
        where: { companyId, name },
      });
      if (existing && existing.id !== item.id)
        throw new ConflictException(
          'Shift name already exists for this company',
        );
      item.name = name;
    }

    if (dto.description !== undefined)
      item.description = dto.description?.trim() || null;
    if (dto.shift_type !== undefined) item.shiftType = dto.shift_type;
    if (dto.start_time !== undefined) item.startTime = dto.start_time;
    if (dto.end_time !== undefined) item.endTime = dto.end_time;
    if (dto.expected_work_minutes !== undefined)
      item.expectedWorkMinutes = dto.expected_work_minutes;
    if (dto.minimum_work_minutes !== undefined)
      item.minimumWorkMinutes = dto.minimum_work_minutes;
    if (dto.half_day_minutes !== undefined)
      item.halfDayMinutes = dto.half_day_minutes;
    if (dto.grace_in_minutes !== undefined)
      item.graceInMinutes = dto.grace_in_minutes;
    if (dto.grace_out_minutes !== undefined)
      item.graceOutMinutes = dto.grace_out_minutes;
    if (dto.late_after_minutes !== undefined)
      item.lateAfterMinutes = dto.late_after_minutes;
    if (dto.early_leave_after_minutes !== undefined)
      item.earlyLeaveAfterMinutes = dto.early_leave_after_minutes;
    if (dto.is_night_shift !== undefined)
      item.isNightShift = dto.is_night_shift;
    if (dto.crosses_midnight !== undefined)
      item.crossesMidnight = dto.crosses_midnight;
    if (dto.allow_overtime !== undefined)
      item.allowOvertime = dto.allow_overtime;
    if (dto.max_overtime_minutes !== undefined)
      item.maxOvertimeMinutes = dto.max_overtime_minutes;
    if (dto.requires_checkout !== undefined)
      item.requiresCheckout = dto.requires_checkout;
    if (dto.allow_early_checkin !== undefined)
      item.allowEarlyCheckin = dto.allow_early_checkin;
    if (dto.allow_late_checkout !== undefined)
      item.allowLateCheckout = dto.allow_late_checkout;
    if (dto.status !== undefined) item.status = dto.status;

    return this.shiftRepository.save(item);
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.shiftRepository.softRemove(item);
    return { message: 'Shift deleted successfully' };
  }
}
