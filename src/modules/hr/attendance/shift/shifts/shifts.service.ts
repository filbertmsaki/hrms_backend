import { Injectable, NotFoundException } from '@nestjs/common';
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
import {
  ensureCompanyOwnedEntity,
  ensureUniqueEntity,
  normalizeNullableText,
  normalizeTrimmedText,
} from '../../shared/attendance-domain.utils';

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
    await ensureCompanyOwnedEntity(
      this.branchRepository,
      { id: branchId, company_id: companyId },
      'branch_id does not belong to the active company',
    );
  }

  private async ensureDepartment(
    companyId: number,
    departmentId?: number | null,
  ): Promise<void> {
    if (!departmentId) return;
    await ensureCompanyOwnedEntity(
      this.departmentRepository,
      { id: departmentId, company_id: companyId },
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

    const code = normalizeTrimmedText(dto.code);
    const name = normalizeTrimmedText(dto.name);

    await ensureUniqueEntity(
      this.shiftRepository,
      { companyId, code },
      'Shift code already exists for this company',
    );
    await ensureUniqueEntity(
      this.shiftRepository,
      { companyId, name },
      'Shift name already exists for this company',
    );

    const created = this.shiftRepository.create({
      companyId,
      branchId: dto.branch_id ?? null,
      departmentId: dto.department_id ?? null,
      name,
      code,
      description: normalizeNullableText(dto.description) ?? null,
      shiftType: dto.shift_type,
      startTime: dto.start_time,
      endTime: dto.end_time,
      expectedWorkMinutes: dto.expected_work_minutes,
      minimumWorkMinutes: dto.minimum_work_minutes,
      halfDayMinutes: dto.half_day_minutes,
      graceInMinutes: dto.grace_in_minutes ?? 0,
      graceOutMinutes: dto.grace_out_minutes ?? 0,
      lateAfterMinutes: dto.late_after_minutes ?? 0,
      halfDayAfterMinutes: dto.half_day_after_minutes ?? 0,
      absentAfterMinutes: dto.absent_after_minutes ?? 0,
      earlyLeaveAfterMinutes: dto.early_leave_after_minutes ?? 0,
      isNightShift: dto.is_night_shift ?? false,
      crossesMidnight: dto.crosses_midnight ?? false,
      allowOvertime: dto.allow_overtime ?? false,
      maxOvertimeMinutes: dto.max_overtime_minutes ?? 0,
      overtimeStartAfterMinutes: dto.overtime_start_after_minutes ?? 0,
      overtimeRateMultiplier:
        dto.overtime_rate_multiplier?.toFixed(2) ?? '1.00',
      weekendMultiplier: dto.weekend_multiplier?.toFixed(2) ?? '1.00',
      holidayMultiplier: dto.holiday_multiplier?.toFixed(2) ?? '1.00',
      overtimeRequiresApproval: dto.overtime_requires_approval ?? false,
      overtimeAutoCalculate: dto.overtime_auto_calculate ?? true,
      requiresCheckout: dto.requires_checkout ?? true,
      allowEarlyCheckin: dto.allow_early_checkin ?? true,
      allowLateCheckout: dto.allow_late_checkout ?? true,
      allowMultipleCheckin: dto.allow_multiple_checkin ?? false,
      autoMarkAbsent: dto.auto_mark_absent ?? true,
      allowMobileAttendance: dto.allow_mobile_attendance ?? true,
      allowRemoteAttendance: dto.allow_remote_attendance ?? false,
      requireGeofence: dto.require_geofence ?? false,
      requireBiometric: dto.require_biometric ?? false,
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
      const code = normalizeTrimmedText(dto.code);
      await ensureUniqueEntity(
        this.shiftRepository,
        { companyId, code },
        'Shift code already exists for this company',
        item.id,
      );
      item.code = code;
    }

    if (dto.name !== undefined) {
      const name = normalizeTrimmedText(dto.name);
      await ensureUniqueEntity(
        this.shiftRepository,
        { companyId, name },
        'Shift name already exists for this company',
        item.id,
      );
      item.name = name;
    }

    if (dto.description !== undefined)
      item.description = normalizeNullableText(dto.description) ?? null;
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
    if (dto.half_day_after_minutes !== undefined)
      item.halfDayAfterMinutes = dto.half_day_after_minutes;
    if (dto.absent_after_minutes !== undefined)
      item.absentAfterMinutes = dto.absent_after_minutes;
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
    if (dto.overtime_start_after_minutes !== undefined)
      item.overtimeStartAfterMinutes = dto.overtime_start_after_minutes;
    if (dto.overtime_rate_multiplier !== undefined)
      item.overtimeRateMultiplier = dto.overtime_rate_multiplier.toFixed(2);
    if (dto.weekend_multiplier !== undefined)
      item.weekendMultiplier = dto.weekend_multiplier.toFixed(2);
    if (dto.holiday_multiplier !== undefined)
      item.holidayMultiplier = dto.holiday_multiplier.toFixed(2);
    if (dto.overtime_requires_approval !== undefined)
      item.overtimeRequiresApproval = dto.overtime_requires_approval;
    if (dto.overtime_auto_calculate !== undefined)
      item.overtimeAutoCalculate = dto.overtime_auto_calculate;
    if (dto.requires_checkout !== undefined)
      item.requiresCheckout = dto.requires_checkout;
    if (dto.allow_early_checkin !== undefined)
      item.allowEarlyCheckin = dto.allow_early_checkin;
    if (dto.allow_late_checkout !== undefined)
      item.allowLateCheckout = dto.allow_late_checkout;
    if (dto.allow_multiple_checkin !== undefined)
      item.allowMultipleCheckin = dto.allow_multiple_checkin;
    if (dto.auto_mark_absent !== undefined)
      item.autoMarkAbsent = dto.auto_mark_absent;
    if (dto.allow_mobile_attendance !== undefined)
      item.allowMobileAttendance = dto.allow_mobile_attendance;
    if (dto.allow_remote_attendance !== undefined)
      item.allowRemoteAttendance = dto.allow_remote_attendance;
    if (dto.require_geofence !== undefined)
      item.requireGeofence = dto.require_geofence;
    if (dto.require_biometric !== undefined)
      item.requireBiometric = dto.require_biometric;
    if (dto.status !== undefined) item.status = dto.status;

    return this.shiftRepository.save(item);
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.shiftRepository.softRemove(item);
    return { message: 'Shift deleted successfully' };
  }
}
