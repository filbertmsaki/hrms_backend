import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../../hr/shared/hr.utils';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { AttendanceDevice } from '../../../access-control/attendance-devices/entities/attendance-device.entity';
import { Branch } from '../../../hr/branches/entities/branch.entity';
import { Department } from '../../../hr/departments/entities/department.entity';
import { Employee } from '../../../hr/employees/entities/employee.entity';
import { HikvisionAccessControlService } from '../../../hikvision/hikvision-access-control.service';
import { AccessGroupDevice } from '../../access-group-devices/entity/access-group-device.entity';
import { AccessGroupDoor } from '../../access-group-doors/entity/access-group-door.entity';
import { AccessGroupEmployee } from '../../access-group-employees/entity/access-group-employee.entity';
import { AccessGroupEmployeeStatusEnum } from '../../access-group-employees/enum/access-group-employee-status.enum';
import { AccessGroup } from '../../access-groups/entity/access-group.entity';
import { AccessControlSyncService } from '../../service/access-control-sync.service';
import { EmployeeDeviceAssignmentsService } from '../../employee-device-assignments/service/employee-device-assignments.service';
import { AssignAccessOrganizationEmployeesDto } from '../dto/assign-access-organization-employees.dto';
import { CreateAccessOrganizationDto } from '../dto/create-access-organization.dto';
import { SyncAccessOrganizationDto } from '../dto/sync-access-organization.dto';
import { UpdateAccessOrganizationDto } from '../dto/update-access-organization.dto';
import { AccessOrganizationEmployee } from '../../access-organization-employees/entity/access-organization-employee.entity';
import { AccessOrganization } from '../entity/access-organization.entity';
import { AccessOrganizationSyncStatusEnum } from '../enum/access-organization-sync-status.enum';

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
    @InjectRepository(AccessOrganizationEmployee)
    private readonly organizationEmployeeRepository: Repository<AccessOrganizationEmployee>,
    @InjectRepository(AccessGroup)
    private readonly accessGroupRepository: Repository<AccessGroup>,
    @InjectRepository(AccessGroupDevice)
    private readonly accessGroupDeviceRepository: Repository<AccessGroupDevice>,
    @InjectRepository(AccessGroupDoor)
    private readonly accessGroupDoorRepository: Repository<AccessGroupDoor>,
    @InjectRepository(AccessGroupEmployee)
    private readonly accessGroupEmployeeRepository: Repository<AccessGroupEmployee>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(AttendanceDevice)
    private readonly attendanceDeviceRepository: Repository<AttendanceDevice>,
    private readonly hikvisionAccessControlService: HikvisionAccessControlService,
    private readonly employeeDeviceAssignmentsService: EmployeeDeviceAssignmentsService,
    private readonly accessControlSyncService: AccessControlSyncService,
  ) {}

  async create(companyId: number, dto: CreateAccessOrganizationDto) {
    await this.ensureBranch(companyId, dto.branch_id);
    await this.ensureDepartment(companyId, dto.department_id);

    const orgName = (dto.org_name ?? dto.name ?? '').trim();
    if (!orgName) {
      throw new BadRequestException('org_name is required');
    }

    const entity = this.organizationRepository.create({
      companyId,
      branchId: dto.branch_id ?? null,
      departmentId: dto.department_id ?? null,
      parentId: dto.parent_id ?? null,
      hikvisionGroupNo: dto.hikvision_group_no?.trim() || null,
      hikvisionOrgIndex: dto.hikvision_org_index?.trim() || dto.hikvision_group_no?.trim() || null,
      orgName,
      name: orgName,
      orgCode: dto.org_code?.trim() || null,
      description: dto.description ?? null,
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

    const sortFieldMap: Record<string, string> = {
      created_at: 'createdAt',
      updated_at: 'updatedAt',
      name: 'name',
      hikvision_group_no: 'hikvisionGroupNo',
    };
    const safeSortBy = sortFieldMap[sortBy] ?? sortFieldMap.created_at;
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
    const organization = await this.findOrFail(companyId, id);
    const employeeIds = await this.organizationEmployeeRepository.find({
      where: { organizationId: id },
      select: ['employeeId'],
      order: { id: 'ASC' },
    });

    return {
      ...this.map(organization),
      employee_ids: employeeIds.map((item) => item.employeeId),
    };
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
      item.hikvisionGroupNo = dto.hikvision_group_no?.trim() || null;
    }

    if (dto.hikvision_org_index !== undefined) {
      item.hikvisionOrgIndex = dto.hikvision_org_index?.trim() || null;
    }

    if (dto.name !== undefined || dto.org_name !== undefined) {
      const orgName = (dto.org_name ?? dto.name ?? '').trim();
      item.name = orgName || item.name;
      item.orgName = orgName || item.orgName;
    }

    if (dto.org_code !== undefined) item.orgCode = dto.org_code?.trim() || null;
    if (dto.description !== undefined) item.description = dto.description ?? null;
    if (dto.parent_id !== undefined) item.parentId = dto.parent_id ?? null;
    if (dto.metadata !== undefined) {
      item.metadata = dto.metadata;
    }

    item.syncStatus = AccessOrganizationSyncStatusEnum.PENDING;
    return this.map(await this.organizationRepository.save(item));
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    const memberships = await this.organizationEmployeeRepository.find({
      where: { organizationId: id },
      select: ['employeeId'],
    });

    for (const membership of memberships) {
      await this.removeEmployee(companyId, id, membership.employeeId);
    }

    await this.organizationRepository.remove(item);
    return { message: 'Access organization deleted successfully' };
  }

  async listEmployees(companyId: number, organizationId: number) {
    await this.findOrFail(companyId, organizationId);
    const rows = await this.organizationEmployeeRepository.find({
      where: { organizationId },
      relations: ['employee'],
      order: { createdAt: 'ASC', id: 'ASC' },
    });

    return {
      organization_id: organizationId,
      data: rows.map((row) => ({
        id: row.id,
        organization_id: row.organizationId,
        employee_id: row.employeeId,
        employee_no: row.employeeNo,
        employee_name: row.employeeName,
        metadata: row.metadata,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
      })),
    };
  }

  async assignEmployees(
    companyId: number,
    organizationId: number,
    dto: AssignAccessOrganizationEmployeesDto,
  ) {
    const organization = await this.findOrFail(companyId, organizationId);
    const uniqueEmployeeIds = [...new Set(dto.employee_ids)];
    const employees = await this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin(CompanyUser, 'companyUser', 'companyUser.id = employee.company_user_id')
      .where('employee.id IN (:...employeeIds)', { employeeIds: uniqueEmployeeIds })
      .andWhere('companyUser.company_id = :companyId', { companyId })
      .getMany();

    if (employees.length !== uniqueEmployeeIds.length) {
      throw new BadRequestException('One or more employee_ids do not belong to the active company');
    }

    const existingMemberships = await this.organizationEmployeeRepository.find({
      where: { employeeId: In(uniqueEmployeeIds) },
      select: ['id', 'employeeId', 'organizationId'],
    });

    const conflicts = existingMemberships.filter(
      (item) => item.organizationId !== organization.id,
    );
    if (conflicts.length > 0) {
      throw new BadRequestException(
        'Each employee can belong to only one organization at a time',
      );
    }

    const existingByEmployeeId = new Map(
      existingMemberships.map((item) => [item.employeeId, item]),
    );

    let created = 0;
    for (const employee of employees) {
      if (existingByEmployeeId.has(employee.id)) {
        continue;
      }

      await this.organizationEmployeeRepository.save(
        this.organizationEmployeeRepository.create({
          organizationId: organization.id,
          employeeId: employee.id,
          employeeNo: employee.employee_no,
          employeeName: this.buildEmployeeDisplayName(employee),
          metadata: null,
        }),
      );
      created += 1;
    }

    return {
      message: 'Organization employees assigned successfully',
      organization_id: organization.id,
      created,
    };
  }

  async removeEmployee(companyId: number, organizationId: number, employeeId: number) {
    await this.findOrFail(companyId, organizationId);
    const membership = await this.organizationEmployeeRepository.findOne({
      where: { organizationId, employeeId },
    });

    if (!membership) {
      throw new NotFoundException('Organization employee assignment not found');
    }

    const groupMemberships = await this.accessGroupEmployeeRepository
      .createQueryBuilder('groupEmployee')
      .innerJoin(AccessGroup, 'accessGroup', 'accessGroup.id = groupEmployee.access_group_id')
      .where('groupEmployee.employee_id = :employeeId', { employeeId })
      .andWhere('accessGroup.organization_id = :organizationId', { organizationId })
      .andWhere('accessGroup.company_id = :companyId', { companyId })
      .getMany();

    const affectedGroupIds = [...new Set(groupMemberships.map((item) => item.accessGroupId))];
    const affectedDeviceIds = await this.resolveAffectedDeviceIds(affectedGroupIds);

    if (affectedGroupIds.length > 0) {
      await this.accessGroupEmployeeRepository
        .createQueryBuilder()
        .delete()
        .from(AccessGroupEmployee)
        .where('employee_id = :employeeId', { employeeId })
        .andWhere('access_group_id IN (:...groupIds)', { groupIds: affectedGroupIds })
        .execute();
    }

    await this.organizationEmployeeRepository.remove(membership);

    const revokedDeviceIds: number[] = [];
    for (const deviceId of affectedDeviceIds) {
      const stillHasAccess = await this.employeeStillHasGroupAccessOnDevice(
        companyId,
        employeeId,
        deviceId,
      );

      if (stillHasAccess) {
        continue;
      }

      try {
        await this.employeeDeviceAssignmentsService.removeDoorPermissionOnly(
          companyId,
          employeeId,
          deviceId,
        );
        revokedDeviceIds.push(deviceId);
      } catch (error) {
        if (!(error instanceof NotFoundException)) {
          throw error;
        }
      }
    }

    const remainingMemberships = await this.accessGroupEmployeeRepository
      .createQueryBuilder('groupEmployee')
      .innerJoin(AccessGroup, 'accessGroup', 'accessGroup.id = groupEmployee.access_group_id')
      .where('groupEmployee.employee_id = :employeeId', { employeeId })
      .andWhere('groupEmployee.status = :status', {
        status: AccessGroupEmployeeStatusEnum.ACTIVE,
      })
      .andWhere('accessGroup.company_id = :companyId', { companyId })
      .getCount();

    if (remainingMemberships > 0) {
      await this.accessControlSyncService.syncEmployee(companyId, employeeId);
    }

    return {
      message: 'Employee removed from organization successfully',
      organization_id: organizationId,
      employee_id: employeeId,
      removed_group_count: affectedGroupIds.length,
      revoked_device_ids: revokedDeviceIds,
    };
  }

  async syncToDevice(companyId: number, id: number, dto: SyncAccessOrganizationDto) {
    const organization = await this.findOrFail(companyId, id);
    const targetDeviceIds = await this.resolveTargetDeviceIds(companyId, organization, dto.device_id);

    const results: Array<{ device_id: number; status: 'SYNCED' | 'FAILED'; reason?: string }> = [];

    for (const deviceId of targetDeviceIds) {
      try {
        if (!organization.hikvisionGroupNo) {
          results.push({
            device_id: deviceId,
            status: 'FAILED',
            reason: 'hikvision_group_no is required for device sync',
          });
          continue;
        }

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
        });

        const entity = existing ?? this.organizationRepository.create();
        entity.companyId = companyId;
        entity.branchId = existing?.branchId ?? device.branchId ?? null;
        entity.departmentId = existing?.departmentId ?? null;
        entity.parentId = existing?.parentId ?? null;
        entity.hikvisionGroupNo = groupNoText;
        entity.hikvisionOrgIndex = groupNoText;
        entity.name = groupName;
        entity.orgName = groupName;
        entity.syncStatus = AccessOrganizationSyncStatusEnum.SYNCED;
        entity.metadata = {
          ...(existing?.metadata ?? {}),
          hikvision: {
            ...this.toObject((existing?.metadata ?? {}).hikvision),
            last_pull_at: new Date().toISOString(),
            last_pull_status: response.status,
          },
        };

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

    const groupIds = await this.accessGroupRepository.find({
      where: { companyId, organizationId: organization.id },
      select: ['id'],
    });

    if (!groupIds.length) {
      throw new BadRequestException('No access groups are linked to this organization');
    }

    const devices = await this.accessGroupDeviceRepository.find({
      where: { accessGroupId: In(groupIds.map((item) => item.id)) },
      select: ['deviceId'],
    });

    const uniqueDeviceIds = [...new Set(devices.map((item) => item.deviceId).filter(Boolean))];
    if (!uniqueDeviceIds.length) {
      throw new BadRequestException('No devices are linked to this organization through access groups');
    }

    return uniqueDeviceIds;
  }

  private async resolveAffectedDeviceIds(groupIds: number[]): Promise<number[]> {
    if (!groupIds.length) {
      return [];
    }

    const [groupDevices, groupDoors] = await Promise.all([
      this.accessGroupDeviceRepository.find({
        where: { accessGroupId: In(groupIds) },
        select: ['deviceId'],
      }),
      this.accessGroupDoorRepository.find({
        where: { accessGroupId: In(groupIds) },
        select: ['deviceId'],
      }),
    ]);

    return [...new Set(
      [...groupDevices, ...groupDoors]
        .map((item) => item.deviceId)
        .filter((deviceId): deviceId is number => deviceId !== null),
    )];
  }

  private async employeeStillHasGroupAccessOnDevice(
    companyId: number,
    employeeId: number,
    deviceId: number,
  ): Promise<boolean> {
    const count = await this.accessGroupEmployeeRepository
      .createQueryBuilder('groupEmployee')
      .innerJoin(AccessGroup, 'accessGroup', 'accessGroup.id = groupEmployee.access_group_id')
      .leftJoin(AccessGroupDevice, 'groupDevice', 'groupDevice.access_group_id = accessGroup.id')
      .leftJoin(AccessGroupDoor, 'groupDoor', 'groupDoor.access_group_id = accessGroup.id')
      .where('groupEmployee.employee_id = :employeeId', { employeeId })
      .andWhere('groupEmployee.status = :status', {
        status: AccessGroupEmployeeStatusEnum.ACTIVE,
      })
      .andWhere('accessGroup.company_id = :companyId', { companyId })
      .andWhere(
        `(groupEmployee.device_id = :deviceId OR groupDevice.device_id = :deviceId OR groupDoor.device_id = :deviceId OR accessGroup.device_id = :deviceId)`,
        { deviceId },
      )
      .getCount();

    return count > 0;
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

  private map(item: AccessOrganization) {
    return {
      id: item.id,
      company_id: item.companyId,
      branch_id: item.branchId,
      department_id: item.departmentId,
      parent_id: item.parentId,
      hikvision_org_index: item.hikvisionOrgIndex,
      hikvision_group_no: item.hikvisionGroupNo,
      name: item.name,
      org_name: item.orgName,
      org_code: item.orgCode,
      description: item.description,
      source: item.source,
      is_active: item.isActive,
      last_synced_at: item.lastSyncedAt,
      sync_status: item.syncStatus,
      metadata: item.metadata,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      deleted_at: item.deletedAt,
    };
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

  private buildEmployeeDisplayName(employee: Employee): string {
    const displayName = [employee.first_name, employee.middle_name, employee.last_name]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .join(' ')
      .trim();

    return displayName || employee.employee_no;
  }
}
