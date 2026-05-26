import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { AccessOrganization } from '../entity/access-organization.entity';
import { CreateAccessOrganizationDto } from '../dto/create-access-organization.dto';
import { UpdateAccessOrganizationDto } from '../dto/update-access-organization.dto';
import { AccessOrganizationSyncStatusEnum } from '../enum/access-organization-sync-status.enum';
import { Branch } from '../../../hr/branches/entities/branch.entity';
import { Department } from '../../../hr/departments/entities/department.entity';
import { AttendanceDevice } from '../../../hr/attendance/devices/entities/attendance-device.entity';
import { HikvisionAccessControlService } from '../../../hikvision/hikvision-access-control.service';
import { buildPaginationMeta } from '../../../hr/shared/hr.utils';
import { SyncAccessOrganizationDto } from '../dto/sync-access-organization.dto';

type AccessOrganizationQuery = {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: SortDirection;
  branch_id?: number;
  department_id?: number;
  sync_status?: AccessOrganizationSyncStatusEnum;
  search?: string;
};

@Injectable()
export class AccessOrganizationsService {
  constructor(
    @InjectRepository(AccessOrganization)
    private readonly organizationRepository: Repository<AccessOrganization>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(AttendanceDevice)
    private readonly attendanceDeviceRepository: Repository<AttendanceDevice>,
    private readonly hikvisionAccessControlService: HikvisionAccessControlService,
  ) {}

  async create(companyId: number, dto: CreateAccessOrganizationDto) {
    await this.ensureBranch(companyId, dto.branch_id);
    await this.ensureDepartment(companyId, dto.department_id);

    const entity = this.organizationRepository.create({
      companyId,
      branchId: dto.branch_id ?? null,
      departmentId: dto.department_id ?? null,
      hikvisionGroupNo: dto.hikvision_group_no.trim(),
      name: dto.name.trim(),
      syncStatus: AccessOrganizationSyncStatusEnum.PENDING,
      metadata: dto.metadata ?? null,
    });

    return this.map(await this.organizationRepository.save(entity));
  }

  async findAll(companyId: number, query: AccessOrganizationQuery) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      branch_id,
      department_id,
      sync_status,
      search,
    } = query;

    const qb = this.organizationRepository
      .createQueryBuilder('organization')
      .where('organization.company_id = :companyId', { companyId });

    if (branch_id) {
      qb.andWhere('organization.branch_id = :branchId', { branchId: branch_id });
    }

    if (department_id) {
      qb.andWhere('organization.department_id = :departmentId', {
        departmentId: department_id,
      });
    }

    if (sync_status) {
      qb.andWhere('organization.sync_status = :syncStatus', {
        syncStatus: sync_status,
      });
    }

    if (search?.trim()) {
      qb.andWhere('(organization.name LIKE :term OR organization.hikvision_group_no LIKE :term)', {
        term: `%${search.trim()}%`,
      });
    }

    const allowedSortFields = ['created_at', 'updated_at', 'name', 'hikvision_group_no'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const [items, total] = await qb
      .orderBy(`organization.${safeSortBy}`, direction)
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

  async update(companyId: number, id: number, dto: UpdateAccessOrganizationDto) {
    const item = await this.findOrFail(companyId, id);

    if (dto.branch_id !== undefined) {
      await this.ensureBranch(companyId, dto.branch_id);
      item.branchId = dto.branch_id ?? null;
    }

    if (dto.department_id !== undefined) {
      await this.ensureDepartment(companyId, dto.department_id);
      item.departmentId = dto.department_id ?? null;
    }

    if (dto.hikvision_group_no !== undefined) {
      item.hikvisionGroupNo = dto.hikvision_group_no.trim();
    }

    if (dto.name !== undefined) {
      item.name = dto.name.trim();
    }

    if (dto.metadata !== undefined) {
      item.metadata = dto.metadata;
    }

    item.syncStatus = AccessOrganizationSyncStatusEnum.PENDING;
    return this.map(await this.organizationRepository.save(item));
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.organizationRepository.softRemove(item);
    return { message: 'Access organization deleted successfully' };
  }

  async syncToDevice(companyId: number, id: number, dto: SyncAccessOrganizationDto) {
    const organization = await this.findOrFail(companyId, id);
    const targetDeviceIds = await this.resolveTargetDeviceIds(companyId, organization, dto.device_id);

    const results: Array<{ device_id: number; status: 'SYNCED' | 'FAILED'; reason?: string }> = [];

    for (const deviceId of targetDeviceIds) {
      try {
        const response = await this.hikvisionAccessControlService.putGroupCfg(
          companyId,
          deviceId,
          organization.hikvisionGroupNo,
          { name: organization.name },
        );

        if (!response.ok) {
          results.push({
            device_id: deviceId,
            status: 'FAILED',
            reason: `status=${response.status}`,
          });
          continue;
        }

        results.push({ device_id: deviceId, status: 'SYNCED' });
      } catch (error) {
        results.push({
          device_id: deviceId,
          status: 'FAILED',
          reason: (error as Error).message,
        });
      }
    }

    const hasFailure = results.some((item) => item.status === 'FAILED');
    organization.syncStatus = hasFailure
      ? AccessOrganizationSyncStatusEnum.FAILED
      : AccessOrganizationSyncStatusEnum.SYNCED;
    organization.metadata = {
      ...(organization.metadata ?? {}),
      hikvision: {
        ...(this.toObject((organization.metadata ?? {}).hikvision)),
        last_push_at: new Date().toISOString(),
        results,
      },
    };

    await this.organizationRepository.save(organization);

    return {
      message: 'Organization sync completed',
      organization_id: organization.id,
      results,
    };
  }

  async syncFromDevice(companyId: number, deviceId: number) {
    const device = await this.attendanceDeviceRepository.findOne({
      where: { id: deviceId, companyId },
      select: ['id', 'branchId'],
    });

    if (!device) {
      throw new NotFoundException('Attendance device not found');
    }

    let synced = 0;
    let skipped = 0;
    let failed = 0;
    const results: Array<{ group_no: string; status: 'SYNCED' | 'SKIPPED' | 'FAILED'; reason?: string }> = [];

    for (let groupNo = 1; groupNo <= 128; groupNo += 1) {
      const groupNoText = String(groupNo);

      try {
        const response = await this.hikvisionAccessControlService.getGroupCfg(
          companyId,
          deviceId,
          groupNoText,
        );

        if (!response.ok) {
          if (this.isSkippable(response.raw)) {
            skipped += 1;
            results.push({ group_no: groupNoText, status: 'SKIPPED', reason: 'invalidID/notSupport' });
            continue;
          }

          failed += 1;
          results.push({
            group_no: groupNoText,
            status: 'FAILED',
            reason: `status=${response.status}`,
          });
          continue;
        }

        const parsed = this.toObject(response.parsed);
        const groupCfg = this.toObject(parsed.GroupCfg ?? parsed);
        const groupName = String(groupCfg.groupName ?? '').trim();

        if (!groupName) {
          skipped += 1;
          results.push({ group_no: groupNoText, status: 'SKIPPED', reason: 'missing groupName' });
          continue;
        }

        const existing = await this.organizationRepository.findOne({
          where: {
            companyId,
            hikvisionGroupNo: groupNoText,
          },
          withDeleted: true,
        });

        const entity = existing ?? this.organizationRepository.create();
        entity.companyId = companyId;
        entity.branchId = existing?.branchId ?? device.branchId ?? null;
        entity.departmentId = existing?.departmentId ?? null;
        entity.hikvisionGroupNo = groupNoText;
        entity.name = groupName;
        entity.syncStatus = AccessOrganizationSyncStatusEnum.SYNCED;
        entity.metadata = {
          ...(existing?.metadata ?? {}),
          hikvision: {
            ...this.toObject((existing?.metadata ?? {}).hikvision),
            last_pull_at: new Date().toISOString(),
            last_pull_status: response.status,
          },
        };

        if (existing?.deletedAt) {
          await this.organizationRepository.recover(existing);
        }

        await this.organizationRepository.save(entity);
        synced += 1;
        results.push({ group_no: groupNoText, status: 'SYNCED' });
      } catch (error) {
        failed += 1;
        results.push({
          group_no: groupNoText,
          status: 'FAILED',
          reason: (error as Error).message,
        });
      }
    }

    return {
      message: 'Organization sync-from-device completed',
      device_id: deviceId,
      synced,
      skipped,
      failed,
      results,
    };
  }

  private async findOrFail(companyId: number, id: number): Promise<AccessOrganization> {
    const item = await this.organizationRepository.findOne({
      where: { id, companyId },
    });

    if (!item) {
      throw new NotFoundException('Access organization not found');
    }

    return item;
  }

  private map(item: AccessOrganization) {
    return {
      id: item.id,
      company_id: item.companyId,
      branch_id: item.branchId,
      department_id: item.departmentId,
      hikvision_group_no: item.hikvisionGroupNo,
      name: item.name,
      sync_status: item.syncStatus,
      metadata: item.metadata,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      deleted_at: item.deletedAt,
    };
  }

  private async resolveTargetDeviceIds(
    companyId: number,
    organization: AccessOrganization,
    inputDeviceId?: number,
  ): Promise<number[]> {
    if (inputDeviceId) {
      const device = await this.attendanceDeviceRepository.findOne({
        where: { id: inputDeviceId, companyId },
        select: ['id'],
      });

      if (!device) {
        throw new BadRequestException('device_id does not belong to the active company');
      }

      return [inputDeviceId];
    }

    const qb = this.attendanceDeviceRepository
      .createQueryBuilder('device')
      .where('device.company_id = :companyId', { companyId })
      .andWhere(
        '(LOWER(device.integration_type) = :integrationType OR LOWER(COALESCE(device.vendor_name, \'\')) LIKE :vendor)',
        {
          integrationType: 'hikvision',
          vendor: '%hikvision%',
        },
      )
      .select(['device.id']);

    if (organization.branchId) {
      qb.andWhere('device.branch_id = :branchId', { branchId: organization.branchId });
    }

    const devices = await qb.getMany();
    if (!devices.length) {
      throw new BadRequestException('No Hikvision devices found for this organization scope');
    }

    return devices.map((device) => device.id);
  }

  private async ensureBranch(companyId: number, branchId?: number | null): Promise<void> {
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

  private async ensureDepartment(companyId: number, departmentId?: number | null): Promise<void> {
    if (!departmentId) {
      return;
    }

    const department = await this.departmentRepository.findOne({
      where: { id: departmentId, company_id: companyId },
      select: ['id'],
    });

    if (!department) {
      throw new BadRequestException('department_id does not belong to the active company');
    }
  }

  private isSkippable(body: string): boolean {
    const lowered = (body || '').toLowerCase();
    return lowered.includes('invalidid') || lowered.includes('notsupport') || lowered.includes('invalid id');
  }

  private toObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }
}
