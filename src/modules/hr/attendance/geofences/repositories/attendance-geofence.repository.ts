import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, In, Repository } from 'typeorm';
import { AttendanceGeofence } from '../entities/attendance-geofence.entity';
import { AttendanceGeofenceQueryDto } from '../dtos/attendance-geofence-query.dto';
import { AttendanceGeofenceStatusEnum } from '../enums/attendance-geofence-status.enum';

@Injectable()
export class AttendanceGeofenceRepository {
  constructor(
    @InjectRepository(AttendanceGeofence)
    private readonly repo: Repository<AttendanceGeofence>,
  ) {}

  createEntity(data: Partial<AttendanceGeofence>): AttendanceGeofence {
    return this.repo.create(data);
  }

  save(entity: AttendanceGeofence): Promise<AttendanceGeofence> {
    return this.repo.save(entity);
  }

  findOneById(
    companyId: number,
    id: number,
  ): Promise<AttendanceGeofence | null> {
    return this.repo.findOne({
      where: {
        id,
        companyId,
      },
      relations: {
        branch: true,
      },
    });
  }

  findActiveById(
    companyId: number,
    id: number,
  ): Promise<AttendanceGeofence | null> {
    return this.repo.findOne({
      where: {
        id,
        companyId,
        status: AttendanceGeofenceStatusEnum.ACTIVE,
      },
    });
  }

  findActiveByIds(
    companyId: number,
    ids: number[],
  ): Promise<AttendanceGeofence[]> {
    if (!ids.length) {
      return Promise.resolve([]);
    }

    return this.repo.find({
      where: {
        companyId,
        id: In(ids),
        status: AttendanceGeofenceStatusEnum.ACTIVE,
      },
      order: {
        id: 'ASC',
      },
    });
  }

  findActiveForBranch(
    companyId: number,
    branchId?: number | null,
  ): Promise<AttendanceGeofence[]> {
    const qb = this.repo
      .createQueryBuilder('geofence')
      .where('geofence.company_id = :companyId', { companyId })
      .andWhere('geofence.status = :status', {
        status: AttendanceGeofenceStatusEnum.ACTIVE,
      })
      .orderBy('geofence.id', 'ASC');

    if (branchId) {
      qb.andWhere('(geofence.branch_id IS NULL OR geofence.branch_id = :branchId)', {
        branchId,
      });
    }

    return qb.getMany();
  }

  async findPaginated(companyId: number, query: AttendanceGeofenceQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<AttendanceGeofence>[] = [];

    const baseWhere: FindOptionsWhere<AttendanceGeofence> = {
      companyId,
    };

    if (query.branchId) {
      baseWhere.branchId = query.branchId;
    }

    if (query.status) {
      baseWhere.status = query.status;
    }

    if (query.type) {
      baseWhere.type = query.type;
    }

    if (query.search) {
      where.push({
        ...baseWhere,
        name: ILike(`%${query.search}%`),
      });

      where.push({
        ...baseWhere,
        description: ILike(`%${query.search}%`),
      });
    }

    const [items, total] = await this.repo.findAndCount({
      where: where.length ? where : baseWhere,
      relations: {
        branch: true,
      },
      order: {
        id: 'DESC',
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

  async existsByName(
    companyId: number,
    name: string,
    excludeId?: number,
  ): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('geofence')
      .where('geofence.company_id = :companyId', { companyId })
      .andWhere('LOWER(geofence.name) = LOWER(:name)', { name });

    if (excludeId) {
      qb.andWhere('geofence.id != :excludeId', { excludeId });
    }

    const count = await qb.getCount();
    return count > 0;
  }

  softDelete(id: number) {
    return this.repo.softDelete(id);
  }
}
