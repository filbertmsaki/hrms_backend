import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { AttendancePolicyQueryDto } from './dtos/attendance-policy-query.dto';
import { CreateAttendancePolicyDto } from './dtos/create-attendance-policy.dto';
import { UpdateAttendancePolicyDto } from './dtos/update-attendance-policy.dto';
import { buildPaginationMeta } from '../../shared/hr.utils';
import { AttendancePolicy } from './entities/attendance-policy.entity';
import {
  normalizeNonBlankText,
  validateAttendanceThresholdProgression,
} from '../shared/attendance-domain.utils';

@Injectable()
export class AttendancePoliciesService {
  constructor(
    @InjectRepository(AttendancePolicy)
    private readonly attendancePolicyRepository: Repository<AttendancePolicy>,
  ) {}

  private mapAttendancePolicy(policy: AttendancePolicy) {
    return {
      id: policy.id,
      company_id: policy.company_id,
      name: policy.name,
      is_active: policy.is_active,
      late_after_minutes: policy.late_after_minutes,
      half_day_after_minutes: policy.half_day_after_minutes,
      absent_after_minutes: policy.absent_after_minutes,
      allow_early_checkin: policy.allow_early_checkin,
      allow_late_checkout: policy.allow_late_checkout,
      auto_absent_if_no_checkin: policy.auto_absent_if_no_checkin,
      requires_manager_approval_for_overtime:
        policy.requires_manager_approval_for_overtime,
      overtime_start_after_minutes: policy.overtime_start_after_minutes,
      max_overtime_minutes_per_day: policy.max_overtime_minutes_per_day,
      max_overtime_minutes_per_month: policy.max_overtime_minutes_per_month,
      overtime_rate_multiplier: policy.overtime_rate_multiplier,
      holiday_overtime_multiplier: policy.holiday_overtime_multiplier,
      weekend_overtime_multiplier: policy.weekend_overtime_multiplier,
      overtime_requires_approval: policy.overtime_requires_approval,
      overtime_auto_calculate: policy.overtime_auto_calculate,
      rounding_mode: policy.rounding_mode,
      max_missing_punch_allowed: policy.max_missing_punch_allowed,
      weekend_days: policy.weekend_days,
      auto_mark_weekend_as_off: policy.auto_mark_weekend_as_off,
      treat_weekend_as_absent_if_scheduled:
        policy.treat_weekend_as_absent_if_scheduled,
      holiday_policy_mode: policy.holiday_policy_mode,
      authentication_modes: policy.authentication_modes,
      require_geo_fencing: policy.require_geo_fencing,
      allow_multi_device_login: policy.allow_multi_device_login,
      allow_location_exception_override:
        policy.allow_location_exception_override,
      require_selfie_for_check_in: policy.require_selfie_for_check_in,
      require_selfie_for_check_out: policy.require_selfie_for_check_out,
      prevent_mobile_device_sharing: policy.prevent_mobile_device_sharing,
      allow_offline_punches: policy.allow_offline_punches,
      offline_max_age_hours: policy.offline_max_age_hours,
      auto_calculate_attendance: policy.auto_calculate_attendance,
      calculation_time: policy.calculation_time,
      grace_period_minutes: policy.grace_period_minutes,
      consider_shift_roster: policy.consider_shift_roster,
      ignore_missing_checkout_if_hours_valid:
        policy.ignore_missing_checkout_if_hours_valid,
      created_at: policy.created_at,
      updated_at: policy.updated_at,
    };
  }

  private normalizeOptionalString(
    value: string | undefined,
  ): string | undefined {
    return normalizeNonBlankText(value);
  }

  private async findPolicyOrFail(
    companyId: number,
    policyId: number,
  ): Promise<AttendancePolicy> {
    const policy = await this.attendancePolicyRepository.findOne({
      where: {
        id: policyId,
        company_id: companyId,
      },
    });

    if (!policy) {
      throw new NotFoundException('Attendance policy not found');
    }

    return policy;
  }

  private async ensureUniquePolicyName(
    companyId: number,
    name: string,
    ignorePolicyId?: number,
  ): Promise<void> {
    const qb = this.attendancePolicyRepository
      .createQueryBuilder('attendancePolicy')
      .where('attendancePolicy.company_id = :companyId', { companyId })
      .andWhere('attendancePolicy.name = :name', { name });

    if (ignorePolicyId) {
      qb.andWhere('attendancePolicy.id != :ignorePolicyId', { ignorePolicyId });
    }

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException(
        `Attendance policy name "${name}" already exists for this company`,
      );
    }
  }

  private async setPolicyActiveState(
    companyId: number,
    policyId: number,
    isActive: boolean,
  ): Promise<void> {
    if (!isActive) {
      return;
    }

    await this.attendancePolicyRepository.manager.transaction(
      async (manager) => {
        await manager
          .getRepository(AttendancePolicy)
          .update(
            { company_id: companyId, is_active: true },
            { is_active: false },
          );

        const result = await manager
          .getRepository(AttendancePolicy)
          .update({ id: policyId, company_id: companyId }, { is_active: true });

        if (!result.affected) {
          throw new NotFoundException('Attendance policy not found');
        }
      },
    );
  }

  async create(companyId: number, dto: CreateAttendancePolicyDto) {
    // Policies provide company-level attendance defaults.
    // Resolver logic may still apply narrower shift or timetable overrides later.
    const normalizedName = this.normalizeOptionalString(dto.name)!;
    const weekendDays = this.normalizeOptionalString(dto.weekend_days);
    const authenticationModes = this.normalizeOptionalString(
      dto.authentication_modes,
    );

    const lateAfterMinutes = dto.late_after_minutes ?? 10;
    const halfDayAfterMinutes = dto.half_day_after_minutes ?? 240;
    const absentAfterMinutes = dto.absent_after_minutes ?? 480;

    validateAttendanceThresholdProgression(
      lateAfterMinutes,
      halfDayAfterMinutes,
      absentAfterMinutes,
    );
    await this.ensureUniquePolicyName(companyId, normalizedName);

    const policy = this.attendancePolicyRepository.create({
      ...dto,
      company_id: companyId,
      name: normalizedName,
      weekend_days: weekendDays ?? dto.weekend_days,
      authentication_modes: authenticationModes ?? dto.authentication_modes,
      late_after_minutes: lateAfterMinutes,
      half_day_after_minutes: halfDayAfterMinutes,
      absent_after_minutes: absentAfterMinutes,
      overtime_start_after_minutes: dto.overtime_start_after_minutes ?? 0,
      max_overtime_minutes_per_day: dto.max_overtime_minutes_per_day ?? 0,
      max_overtime_minutes_per_month: dto.max_overtime_minutes_per_month ?? 0,
      overtime_rate_multiplier:
        dto.overtime_rate_multiplier?.toFixed(2) ?? '1.00',
      holiday_overtime_multiplier:
        dto.holiday_overtime_multiplier?.toFixed(2) ?? '1.00',
      weekend_overtime_multiplier:
        dto.weekend_overtime_multiplier?.toFixed(2) ?? '1.00',
      overtime_requires_approval: dto.overtime_requires_approval ?? false,
      overtime_auto_calculate: dto.overtime_auto_calculate ?? true,
      is_active: dto.is_active ?? false,
    });

    const created = await this.attendancePolicyRepository.save(policy);
    await this.setPolicyActiveState(companyId, created.id, created.is_active);

    return this.mapAttendancePolicy(
      await this.findPolicyOrFail(companyId, created.id),
    );
  }

  async findAll(companyId: number, query: AttendancePolicyQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      search,
      is_active,
    } = query;

    const qb = this.attendancePolicyRepository
      .createQueryBuilder('attendancePolicy')
      .where('attendancePolicy.company_id = :companyId', { companyId });

    if (typeof is_active === 'boolean') {
      qb.andWhere('attendancePolicy.is_active = :isActive', {
        isActive: is_active,
      });
    }

    if (search?.trim()) {
      qb.andWhere('attendancePolicy.name LIKE :term', {
        term: `%${search.trim()}%`,
      });
    }

    const allowedSortFields = [
      'id',
      'name',
      'is_active',
      'created_at',
      'updated_at',
      'calculation_time',
    ];
    const safeSortBy = allowedSortFields.includes(sortBy)
      ? sortBy
      : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const skip = (page - 1) * limit;

    const [items, total] = await qb
      .orderBy(`attendancePolicy.${safeSortBy}`, direction)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.mapAttendancePolicy(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOne(companyId: number, policyId: number) {
    const policy = await this.findPolicyOrFail(companyId, policyId);
    return this.mapAttendancePolicy(policy);
  }

  async update(
    companyId: number,
    policyId: number,
    dto: UpdateAttendancePolicyDto,
  ) {
    const policy = await this.findPolicyOrFail(companyId, policyId);

    const resolvedLateAfterMinutes =
      dto.late_after_minutes ?? policy.late_after_minutes;
    const resolvedHalfDayAfterMinutes =
      dto.half_day_after_minutes ?? policy.half_day_after_minutes;
    const resolvedAbsentAfterMinutes =
      dto.absent_after_minutes ?? policy.absent_after_minutes;

    validateAttendanceThresholdProgression(
      resolvedLateAfterMinutes,
      resolvedHalfDayAfterMinutes,
      resolvedAbsentAfterMinutes,
    );

    if (dto.name !== undefined) {
      const normalizedName = this.normalizeOptionalString(dto.name)!;
      if (normalizedName !== policy.name) {
        await this.ensureUniquePolicyName(companyId, normalizedName, policy.id);
      }
      policy.name = normalizedName;
    }

    if (dto.weekend_days !== undefined) {
      policy.weekend_days = this.normalizeOptionalString(dto.weekend_days)!;
    }

    if (dto.authentication_modes !== undefined) {
      policy.authentication_modes = this.normalizeOptionalString(
        dto.authentication_modes,
      )!;
    }

    Object.assign(policy, {
      ...dto,
      late_after_minutes: resolvedLateAfterMinutes,
      half_day_after_minutes: resolvedHalfDayAfterMinutes,
      absent_after_minutes: resolvedAbsentAfterMinutes,
    });

    if (dto.overtime_rate_multiplier !== undefined) {
      policy.overtime_rate_multiplier = dto.overtime_rate_multiplier.toFixed(2);
    }

    if (dto.holiday_overtime_multiplier !== undefined) {
      policy.holiday_overtime_multiplier =
        dto.holiday_overtime_multiplier.toFixed(2);
    }

    if (dto.weekend_overtime_multiplier !== undefined) {
      policy.weekend_overtime_multiplier =
        dto.weekend_overtime_multiplier.toFixed(2);
    }

    const saved = await this.attendancePolicyRepository.save(policy);
    if (dto.is_active === true) {
      await this.setPolicyActiveState(companyId, saved.id, true);
    }

    return this.mapAttendancePolicy(
      await this.findPolicyOrFail(companyId, saved.id),
    );
  }

  async activate(companyId: number, policyId: number) {
    await this.findPolicyOrFail(companyId, policyId);
    await this.setPolicyActiveState(companyId, policyId, true);
    return this.mapAttendancePolicy(
      await this.findPolicyOrFail(companyId, policyId),
    );
  }

  async remove(
    companyId: number,
    policyId: number,
  ): Promise<{ message: string }> {
    const policy = await this.findPolicyOrFail(companyId, policyId);

    if (policy.is_active) {
      throw new BadRequestException(
        'Active attendance policy cannot be deleted. Activate another policy first, then delete this policy.',
      );
    }

    await this.attendancePolicyRepository.remove(policy);

    return {
      message: 'Attendance policy deleted successfully',
    };
  }
}
