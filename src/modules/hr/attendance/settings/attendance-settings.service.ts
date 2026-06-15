import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../shared/hr.utils';
import { AttendanceSetting } from './entities/attendance-setting.entity';
import { AttendanceSettingQueryDto } from './dtos/attendance-setting-query.dto';
import { CreateAttendanceSettingDto } from './dtos/create-attendance-setting.dto';
import { UpdateAttendanceSettingDto } from './dtos/update-attendance-setting.dto';

@Injectable()
export class AttendanceSettingsService {
  constructor(
    @InjectRepository(AttendanceSetting)
    private readonly attendanceSettingRepository: Repository<AttendanceSetting>,
  ) {}

  private map(item: AttendanceSetting) {
    return {
      id: item.id,
      company_id: item.companyId,
      name: item.name,
      overtime_start_after_minutes: item.overtimeStartAfterMinutes,
      max_overtime_minutes_per_day: item.maxOvertimeMinutesPerDay,
      max_overtime_minutes_per_month: item.maxOvertimeMinutesPerMonth,
      overtime_rate_multiplier: Number(item.overtimeRateMultiplier),
      holiday_overtime_multiplier: Number(item.holidayOvertimeMultiplier),
      weekend_overtime_multiplier: Number(item.weekendOvertimeMultiplier),
      requires_approval: item.requiresApproval,
      auto_calculate: item.autoCalculate,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    };
  }

  private async findOrFail(companyId: number, id: number): Promise<AttendanceSetting> {
    const item = await this.attendanceSettingRepository.findOne({ where: { id, companyId } });
    if (!item) {
      throw new NotFoundException('Attendance setting not found');
    }
    return item;
  }

  async create(companyId: number, dto: CreateAttendanceSettingDto) {
    const existing = await this.attendanceSettingRepository.findOne({
      where: { companyId, name: dto.name.trim() },
    });

    if (existing) {
      throw new ConflictException('Attendance setting name already exists for this company');
    }

    const created = await this.attendanceSettingRepository.save(
      this.attendanceSettingRepository.create({
        companyId,
        name: dto.name.trim(),
        overtimeStartAfterMinutes: dto.overtime_start_after_minutes ?? 0,
        maxOvertimeMinutesPerDay: dto.max_overtime_minutes_per_day ?? 0,
        maxOvertimeMinutesPerMonth: dto.max_overtime_minutes_per_month ?? 0,
        overtimeRateMultiplier: String(dto.overtime_rate_multiplier ?? 1),
        holidayOvertimeMultiplier: String(dto.holiday_overtime_multiplier ?? 1),
        weekendOvertimeMultiplier: String(dto.weekend_overtime_multiplier ?? 1),
        requiresApproval: dto.requires_approval ?? false,
        autoCalculate: dto.auto_calculate ?? true,
      }),
    );

    return this.map(created);
  }

  async findAll(companyId: number, query: AttendanceSettingQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      search,
      auto_calculate,
      requires_approval,
    } = query;

    const qb = this.attendanceSettingRepository
      .createQueryBuilder('attendanceSetting')
      .where('attendanceSetting.company_id = :companyId', { companyId });

    if (typeof auto_calculate === 'boolean') {
      qb.andWhere('attendanceSetting.auto_calculate = :autoCalculate', { autoCalculate: auto_calculate });
    }

    if (typeof requires_approval === 'boolean') {
      qb.andWhere('attendanceSetting.requires_approval = :requiresApproval', {
        requiresApproval: requires_approval,
      });
    }

    if (search?.trim()) {
      qb.andWhere('attendanceSetting.name LIKE :term', { term: `%${search.trim()}%` });
    }

    const sortFieldMap: Record<string, string> = {
      name: 'name',
      created_at: 'createdAt',
      updated_at: 'updatedAt',
    };
    const safeSortBy = sortFieldMap[sortBy] ?? sortFieldMap.created_at;
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const [items, total] = await qb
      .orderBy(`attendanceSetting.${safeSortBy}`, direction)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.map(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOne(companyId: number, id: number) {
    return this.map(await this.findOrFail(companyId, id));
  }

  async update(companyId: number, id: number, dto: UpdateAttendanceSettingDto) {
    const item = await this.findOrFail(companyId, id);

    if (dto.name !== undefined) {
      const normalized = dto.name.trim();
      const existing = await this.attendanceSettingRepository.findOne({
        where: { companyId, name: normalized },
      });
      if (existing && existing.id !== item.id) {
        throw new ConflictException('Attendance setting name already exists for this company');
      }
      item.name = normalized;
    }

    if (dto.overtime_start_after_minutes !== undefined) {
      item.overtimeStartAfterMinutes = dto.overtime_start_after_minutes;
    }
    if (dto.max_overtime_minutes_per_day !== undefined) {
      item.maxOvertimeMinutesPerDay = dto.max_overtime_minutes_per_day;
    }
    if (dto.max_overtime_minutes_per_month !== undefined) {
      item.maxOvertimeMinutesPerMonth = dto.max_overtime_minutes_per_month;
    }
    if (dto.overtime_rate_multiplier !== undefined) {
      item.overtimeRateMultiplier = String(dto.overtime_rate_multiplier);
    }
    if (dto.holiday_overtime_multiplier !== undefined) {
      item.holidayOvertimeMultiplier = String(dto.holiday_overtime_multiplier);
    }
    if (dto.weekend_overtime_multiplier !== undefined) {
      item.weekendOvertimeMultiplier = String(dto.weekend_overtime_multiplier);
    }
    if (dto.requires_approval !== undefined) {
      item.requiresApproval = dto.requires_approval;
    }
    if (dto.auto_calculate !== undefined) {
      item.autoCalculate = dto.auto_calculate;
    }

    return this.map(await this.attendanceSettingRepository.save(item));
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.attendanceSettingRepository.remove(item);
    return { message: 'Attendance setting deleted successfully' };
  }
}






