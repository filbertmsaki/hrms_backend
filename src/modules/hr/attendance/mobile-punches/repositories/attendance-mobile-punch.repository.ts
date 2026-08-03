import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsWhere,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { AttendanceMobilePunch } from '../entities/attendance-mobile-punch.entity';
import { AttendanceMobilePunchQueryDto } from '../dtos/attendance-mobile-punch-query.dto';
import { AttendancePunchValidationStatusEnum } from '../enums/attendance-punch-validation-status.enum';

@Injectable()
export class AttendanceMobilePunchRepository {
  constructor(
    @InjectRepository(AttendanceMobilePunch)
    private readonly repo: Repository<AttendanceMobilePunch>,
  ) {}

  createEntity(data: Partial<AttendanceMobilePunch>): AttendanceMobilePunch {
    return this.repo.create(data);
  }

  save(entity: AttendanceMobilePunch): Promise<AttendanceMobilePunch> {
    return this.repo.save(entity);
  }

  getNativeRepository(): Repository<AttendanceMobilePunch> {
    return this.repo;
  }

  findOneById(
    companyId: number,
    id: number,
  ): Promise<AttendanceMobilePunch | null> {
    return this.repo.findOne({
      where: {
        id,
        companyId,
      },
      relations: {
        employee: true,
        branch: true,
        geofence: true,
        wifiNetwork: true,
      },
    });
  }

  findByClientRequest(
    companyId: number,
    employeeId: number,
    clientRequestId: string,
  ): Promise<AttendanceMobilePunch | null> {
    return this.repo.findOne({
      where: {
        companyId,
        employeeId,
        clientRequestId,
      },
      relations: {
        employee: true,
        branch: true,
        geofence: true,
        wifiNetwork: true,
      },
    });
  }

  async findPaginated(companyId: number, query: AttendanceMobilePunchQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<AttendanceMobilePunch> = {
      companyId,
    };

    if (query.employeeId) {
      where.employeeId = query.employeeId;
    }

    if (query.branchId) {
      where.branchId = query.branchId;
    }

    if (query.punchType) {
      where.punchType = query.punchType;
    }

    if (query.validationStatus) {
      where.validationStatus = query.validationStatus;
    }

    if (query.dateFrom && query.dateTo) {
      where.attendanceDate = Between(query.dateFrom, query.dateTo);
    } else if (query.dateFrom) {
      where.attendanceDate = MoreThanOrEqual(query.dateFrom);
    } else if (query.dateTo) {
      where.attendanceDate = LessThanOrEqual(query.dateTo);
    }

    const [items, total] = await this.repo.findAndCount({
      where,
      relations: {
        employee: true,
        branch: true,
        geofence: true,
        wifiNetwork: true,
      },
      order: {
        punchTime: 'DESC',
      },
      skip,
      take: limit,
    });

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  findLatestForEmployeeDate(params: {
    companyId: number;
    employeeId: number;
    attendanceDate: string;
  }): Promise<AttendanceMobilePunch | null> {
    return this.repo.findOne({
      where: {
        companyId: params.companyId,
        employeeId: params.employeeId,
        attendanceDate: params.attendanceDate,
      },
      order: {
        punchTime: 'DESC',
      },
    });
  }

  findApprovedForEmployeeWindow(params: {
    companyId: number;
    employeeId: number;
    windowStart: Date;
    windowEnd: Date;
  }): Promise<AttendanceMobilePunch[]> {
    return this.repo.find({
      where: {
        companyId: params.companyId,
        employeeId: params.employeeId,
        validationStatus: In([
          AttendancePunchValidationStatusEnum.APPROVED,
          AttendancePunchValidationStatusEnum.OVERRIDE_APPROVED,
        ]),
        punchTime: Between(params.windowStart, params.windowEnd),
      },
      order: {
        punchTime: 'ASC',
      },
    });
  }

  findUnprocessedApproved(limit = 100): Promise<AttendanceMobilePunch[]> {
    return this.repo.find({
      where: [
        {
          isProcessed: false,
          validationStatus: AttendancePunchValidationStatusEnum.APPROVED,
        },
        {
          isProcessed: false,
          validationStatus:
            AttendancePunchValidationStatusEnum.OVERRIDE_APPROVED,
        },
      ],
      order: {
        punchTime: 'ASC',
      },
      take: limit,
    });
  }
}
