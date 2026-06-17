import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { AttendanceWifiNetwork } from '../entities/attendance-wifi-network.entity';
import { AttendanceWifiNetworkQueryDto } from '../dtos/attendance-wifi-network-query.dto';
import { AttendanceWifiNetworkStatusEnum } from '../enums/attendance-wifi-network-status.enum';

@Injectable()
export class AttendanceWifiNetworkRepository {
  constructor(
    @InjectRepository(AttendanceWifiNetwork)
    private readonly repo: Repository<AttendanceWifiNetwork>,
  ) {}

  createEntity(data: Partial<AttendanceWifiNetwork>): AttendanceWifiNetwork {
    return this.repo.create(data);
  }

  save(entity: AttendanceWifiNetwork): Promise<AttendanceWifiNetwork> {
    return this.repo.save(entity);
  }

  findOneById(
    companyId: number,
    id: number,
  ): Promise<AttendanceWifiNetwork | null> {
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
  ): Promise<AttendanceWifiNetwork | null> {
    return this.repo.findOne({
      where: {
        id,
        companyId,
        status: AttendanceWifiNetworkStatusEnum.ACTIVE,
      },
    });
  }

  async findPaginated(companyId: number, query: AttendanceWifiNetworkQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const baseWhere: FindOptionsWhere<AttendanceWifiNetwork> = {
      companyId,
    };

    if (query.branchId) {
      baseWhere.branchId = query.branchId;
    }

    if (query.status) {
      baseWhere.status = query.status;
    }

    if (query.ssid) {
      baseWhere.ssid = query.ssid;
    }

    if (query.bssid) {
      baseWhere.bssid = query.bssid;
    }

    const where: FindOptionsWhere<AttendanceWifiNetwork>[] = [];

    if (query.search) {
      where.push({
        ...baseWhere,
        name: ILike(`%${query.search}%`),
      });

      where.push({
        ...baseWhere,
        ssid: ILike(`%${query.search}%`),
      });

      where.push({
        ...baseWhere,
        bssid: ILike(`%${query.search}%`),
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

  async existsBySsidAndBssid(params: {
    companyId: number;
    ssid: string;
    bssid?: string | null;
    excludeId?: number;
  }): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('wifi')
      .where('wifi.company_id = :companyId', {
        companyId: params.companyId,
      })
      .andWhere('LOWER(wifi.ssid) = LOWER(:ssid)', {
        ssid: params.ssid,
      });

    if (params.bssid) {
      qb.andWhere('LOWER(wifi.bssid) = LOWER(:bssid)', {
        bssid: params.bssid,
      });
    } else {
      qb.andWhere('wifi.bssid IS NULL');
    }

    if (params.excludeId) {
      qb.andWhere('wifi.id != :excludeId', {
        excludeId: params.excludeId,
      });
    }

    const count = await qb.getCount();

    return count > 0;
  }

  softDelete(id: number) {
    return this.repo.softDelete(id);
  }
}
