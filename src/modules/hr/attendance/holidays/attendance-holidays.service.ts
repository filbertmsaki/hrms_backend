import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { Branch } from '../../branches/entities/branch.entity';
import { buildPaginationMeta } from '../../shared/hr.utils';
import { HolidayGroup } from './entities/holiday-group.entity';
import { AttendanceHoliday } from './entities/holiday.entity';
import { AttendanceHolidayQueryDto } from './dtos/attendance-holiday-query.dto';
import { CreateAttendanceHolidayDto } from './dtos/create-attendance-holiday.dto';
import { UpdateAttendanceHolidayDto } from './dtos/update-attendance-holiday.dto';

@Injectable()
export class AttendanceHolidaysService {
  constructor(
    @InjectRepository(AttendanceHoliday)
    private readonly attendanceHolidayRepository: Repository<AttendanceHoliday>,
    @InjectRepository(HolidayGroup)
    private readonly holidayGroupRepository: Repository<HolidayGroup>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
  ) {}

  private map(item: AttendanceHoliday) {
    return {
      id: item.id,
      company_id: item.companyId,
      holiday_group_id: item.holidayGroupId,
      name: item.name,
      date: item.date,
      type: item.type,
      is_paid: item.isPaid,
      affects_overtime: item.affectsOvertime,
      counts_as_working_day: item.countsAsWorkingDay,
      branch_id: item.branchId,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    };
  }

  private async ensureHolidayGroup(companyId: number, holidayGroupId: number): Promise<void> {
    const group = await this.holidayGroupRepository.findOne({
      where: { id: holidayGroupId, companyId },
      select: ['id'],
    });

    if (!group) {
      throw new BadRequestException('holiday_group_id does not belong to the active company');
    }
  }

  private async ensureBranch(companyId: number, branchId: number | null | undefined): Promise<void> {
    if (!branchId) {
      return;
    }

    const branch = await this.branchRepository.findOne({
      where: { id: branchId, company_id: companyId },
      select: ['id'],
    });

    if (!branch) {
      throw new BadRequestException('branch_id does not belong to the active company');
    }
  }

  private async findOrFail(companyId: number, id: number): Promise<AttendanceHoliday> {
    const holiday = await this.attendanceHolidayRepository.findOne({
      where: { id, companyId },
    });

    if (!holiday) {
      throw new NotFoundException('Attendance holiday not found');
    }

    return holiday;
  }

  async create(companyId: number, dto: CreateAttendanceHolidayDto) {
    await this.ensureHolidayGroup(companyId, dto.holiday_group_id);
    await this.ensureBranch(companyId, dto.branch_id);

    const existing = await this.attendanceHolidayRepository.findOne({
      where: {
        holidayGroupId: dto.holiday_group_id,
        name: dto.name.trim(),
        date: dto.date,
      },
      select: ['id'],
    });

    if (existing) {
      throw new ConflictException('Holiday with the same name and date already exists in this group');
    }

    const created = await this.attendanceHolidayRepository.save(
      this.attendanceHolidayRepository.create({
        companyId,
        holidayGroupId: dto.holiday_group_id,
        name: dto.name.trim(),
        date: dto.date,
        type: dto.type,
        isPaid: dto.is_paid ?? true,
        affectsOvertime: dto.affects_overtime ?? false,
        countsAsWorkingDay: dto.counts_as_working_day ?? false,
        branchId: dto.branch_id ?? null,
      }),
    );

    return this.map(created);
  }

  async findAll(companyId: number, query: AttendanceHolidayQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'date',
      sortOrder = SortDirection.DESC,
      holiday_group_id,
      type,
      branch_id,
      from_date,
      to_date,
      search,
    } = query;

    const qb = this.attendanceHolidayRepository
      .createQueryBuilder('attendanceHoliday')
      .where('attendanceHoliday.company_id = :companyId', { companyId });

    if (holiday_group_id) {
      qb.andWhere('attendanceHoliday.holiday_group_id = :holidayGroupId', {
        holidayGroupId: holiday_group_id,
      });
    }

    if (type) {
      qb.andWhere('attendanceHoliday.type = :type', { type });
    }

    if (branch_id) {
      qb.andWhere('attendanceHoliday.branch_id = :branchId', { branchId: branch_id });
    }

    if (from_date) {
      qb.andWhere('attendanceHoliday.date >= :fromDate', { fromDate: from_date });
    }

    if (to_date) {
      qb.andWhere('attendanceHoliday.date <= :toDate', { toDate: to_date });
    }

    if (search?.trim()) {
      qb.andWhere('attendanceHoliday.name LIKE :term', { term: `%${search.trim()}%` });
    }

    const allowedSortFields = ['name', 'date', 'created_at', 'updated_at'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'date';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const sortFieldMap: Record<string, string> = {
      name: 'name',
      date: 'date',
      created_at: 'created_at',
      updated_at: 'updated_at',
    };

    const [items, total] = await qb
      .orderBy(`attendanceHoliday.${sortFieldMap[safeSortBy]}`, direction)
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

  async update(companyId: number, id: number, dto: UpdateAttendanceHolidayDto) {
    const holiday = await this.findOrFail(companyId, id);

    const holidayGroupId = dto.holiday_group_id ?? holiday.holidayGroupId;
    const name = dto.name?.trim() ?? holiday.name;
    const date = dto.date ?? holiday.date;

    await this.ensureHolidayGroup(companyId, holidayGroupId);
    await this.ensureBranch(companyId, dto.branch_id ?? holiday.branchId);

    const duplicate = await this.attendanceHolidayRepository.findOne({
      where: {
        holidayGroupId,
        name,
        date,
      },
      select: ['id'],
    });

    if (duplicate && duplicate.id !== holiday.id) {
      throw new ConflictException('Holiday with the same name and date already exists in this group');
    }

    holiday.holidayGroupId = holidayGroupId;
    holiday.name = name;
    holiday.date = date;

    if (dto.type !== undefined) {
      holiday.type = dto.type;
    }
    if (dto.is_paid !== undefined) {
      holiday.isPaid = dto.is_paid;
    }
    if (dto.affects_overtime !== undefined) {
      holiday.affectsOvertime = dto.affects_overtime;
    }
    if (dto.counts_as_working_day !== undefined) {
      holiday.countsAsWorkingDay = dto.counts_as_working_day;
    }
    if (dto.branch_id !== undefined) {
      holiday.branchId = dto.branch_id;
    }

    return this.map(await this.attendanceHolidayRepository.save(holiday));
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const holiday = await this.findOrFail(companyId, id);
    await this.attendanceHolidayRepository.remove(holiday);
    return { message: 'Attendance holiday deleted successfully' };
  }
}






