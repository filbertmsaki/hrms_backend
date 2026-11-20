import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../../hr/shared/hr.utils';
import { AttendanceDevice } from '../../../access-control/attendance-devices/entities/attendance-device.entity';
import { Branch } from '../../../hr/branches/entities/branch.entity';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { Employee } from '../../../hr/employees/entities/employee.entity';
import { AccessDoor } from '../../access-doors/entity/access-door.entity';
import { AccessGroupDevice } from '../../access-group-devices/entity/access-group-device.entity';
import { AccessGroupDoor } from '../../access-group-doors/entity/access-group-door.entity';
import { AccessGroupEmployee } from '../../access-group-employees/entity/access-group-employee.entity';
import { AccessOrganizationEmployee } from '../../access-organization-employees/entity/access-organization-employee.entity';
import { AccessOrganization } from '../../access-organizations/entity/access-organization.entity';
import { AccessScheduleTemplate } from '../../access-schedule-templates/entity/access-schedule-template.entity';
import { AccessControlSyncService } from '../../service/access-control-sync.service';
import { AssignAccessGroupDevicesDto } from '../dto/assign-access-group-devices.dto';
import { AssignAccessGroupDoorsDto } from '../dto/assign-access-group-doors.dto';
import { AssignAccessGroupEmployeesDto } from '../dto/assign-access-group-employees.dto';
import { CreateAccessGroupDto } from '../dto/create-access-group.dto';
import { UpdateAccessGroupDto } from '../dto/update-access-group.dto';
import { AccessGroup } from '../entity/access-group.entity';
import { AccessReconciliationOperation } from '../entity/access-reconciliation-operation.entity';
import { AccessGroupStatusEnum } from '../enum/access-group-status.enum';

type AccessGroupQuery = {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: SortDirection;
  branch_id?: number;
  organization_id?: number;
  status?: AccessGroupStatusEnum;
  search?: string;
};

@Injectable()
export class AccessGroupsService {
  constructor(
    @InjectRepository(AccessGroup)
    private readonly groupRepository: Repository<AccessGroup>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(AccessScheduleTemplate)
    private readonly scheduleTemplateRepository: Repository<AccessScheduleTemplate>,
    @InjectRepository(AttendanceDevice)
    private readonly attendanceDeviceRepository: Repository<AttendanceDevice>,
    @InjectRepository(AccessDoor)
    private readonly accessDoorRepository: Repository<AccessDoor>,
    @InjectRepository(AccessGroupDevice)
    private readonly accessGroupDeviceRepository: Repository<AccessGroupDevice>,
    @InjectRepository(AccessGroupDoor)
    private readonly accessGroupDoorRepository: Repository<AccessGroupDoor>,
    @InjectRepository(AccessGroupEmployee)
    private readonly accessGroupEmployeeRepository: Repository<AccessGroupEmployee>,
    @InjectRepository(AccessOrganization)
    private readonly accessOrganizationRepository: Repository<AccessOrganization>,
    @InjectRepository(AccessOrganizationEmployee)
    private readonly accessOrganizationEmployeeRepository: Repository<AccessOrganizationEmployee>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private readonly accessControlSyncService: AccessControlSyncService,
  ) {}

  async create(companyId: number, dto: CreateAccessGroupDto) {
    await this.ensureBranch(companyId, dto.branch_id);
    const organization = await this.ensureOrganization(
      companyId,
      dto.organization_id,
    );
    const groupName = (dto.group_name ?? dto.name ?? '').trim();
    if (!groupName) {
      throw new BadRequestException('group_name is required');
    }

    const duplicate = await this.groupRepository.findOne({
      where: {
        companyId,
        name: groupName,
      },
      select: ['id'],
    });

    if (duplicate) {
      throw new ConflictException(
        'Group name already exists in the active company',
      );
    }

    const entity = this.groupRepository.create({
      companyId,
      branchId: dto.branch_id ?? organization?.branchId ?? null,
      organizationId: organization?.id ?? null,
      name: groupName,
      groupCode: dto.group_code ?? null,
      description: dto.description ?? null,
      status: dto.status ?? AccessGroupStatusEnum.ACTIVE,
      metadata: dto.metadata ?? null,
    });

    return this.map(await this.groupRepository.save(entity));
  }

  async findAll(companyId: number, query: AccessGroupQuery) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      branch_id,
      organization_id,
      status,
      search,
    } = query;

    const qb = this.groupRepository
      .createQueryBuilder('group')
      .where('group.company_id = :companyId', { companyId });

    if (branch_id) {
      qb.andWhere('group.branch_id = :branchId', { branchId: branch_id });
    }

    if (organization_id) {
      qb.andWhere('group.organization_id = :organizationId', {
        organizationId: organization_id,
      });
    }

    if (status) {
      qb.andWhere('group.status = :status', { status });
    }

    if (search?.trim()) {
      qb.andWhere('group.name LIKE :term', { term: `%${search.trim()}%` });
    }

    const sortFieldMap: Record<string, string> = {
      created_at: 'createdAt',
      updated_at: 'updatedAt',
      name: 'name',
      status: 'status',
    };
    const safeSortBy = sortFieldMap[sortBy] ?? sortFieldMap.created_at;
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const [items, total] = await qb
      .orderBy(`group.${safeSortBy}`, direction)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.map(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOne(companyId: number, id: number) {
    const item = await this.findOrFail(companyId, id);

    const [doors, devices, employees] = await Promise.all([
      this.accessGroupDoorRepository
        .createQueryBuilder('groupDoor')
        .where('groupDoor.access_group_id = :groupId', { groupId: item.id })
        .select(['groupDoor.door_id'])
        .getRawMany<{ groupDoor_door_id: number }>(),
      this.accessGroupDeviceRepository.find({
        where: { accessGroupId: item.id },
        select: ['deviceId'],
      }),
      this.accessGroupEmployeeRepository
        .createQueryBuilder('groupEmployee')
        .where('groupEmployee.access_group_id = :groupId', { groupId: item.id })
        .select(['groupEmployee.employee_id'])
        .getRawMany<{ groupEmployee_employee_id: number }>(),
    ]);

    return {
      ...this.map(item),
      device_ids: devices.map((entry) => Number(entry.deviceId)),
      door_ids: doors.map((entry) => Number(entry.groupDoor_door_id)),
      employee_ids: employees.map((entry) =>
        Number(entry.groupEmployee_employee_id),
      ),
    };
  }

  async update(
    companyId: number,
    id: number,
    dto: UpdateAccessGroupDto,
    requestedByCompanyUserId: number | null = null,
  ) {
    const item = await this.findOrFail(companyId, id);
    const originalStatus = item.status;
    const originalBranchId = item.branchId;
    const originalOrganizationId = item.organizationId;
    const originalUpdatedAt = item.updatedAt.getTime();

    if (dto.branch_id !== undefined) {
      await this.ensureBranch(companyId, dto.branch_id);
      item.branchId = dto.branch_id ?? null;
    }

    if (dto.organization_id !== undefined) {
      if (
        (dto.organization_id ?? null) !== item.organizationId &&
        (await this.accessGroupEmployeeRepository.count({
          where: { accessGroupId: id },
        }))
      ) {
        throw new BadRequestException(
          'Remove group employees before changing the organization',
        );
      }
      const organization = await this.ensureOrganization(
        companyId,
        dto.organization_id,
      );
      item.organizationId = organization?.id ?? null;
      if (dto.branch_id === undefined && organization?.branchId !== undefined) {
        item.branchId = organization.branchId ?? item.branchId;
      }
    }

    const nextName = dto.group_name ?? dto.name;
    if (nextName !== undefined) {
      const normalized = nextName.trim();
      if (!normalized) throw new BadRequestException('group_name is required');
      const duplicate = await this.groupRepository.findOne({
        where: {
          companyId,
          name: normalized,
        },
        select: ['id'],
      });
      if (duplicate && duplicate.id !== item.id) {
        throw new ConflictException(
          'Group name already exists in the active company',
        );
      }
      item.name = normalized;
    }

    if (dto.group_code !== undefined) item.groupCode = dto.group_code ?? null;
    if (dto.description !== undefined)
      item.description = dto.description ?? null;
    if (dto.status !== undefined) item.status = dto.status;
    if (dto.metadata !== undefined) item.metadata = dto.metadata;

    return this.groupRepository.manager.transaction(async (manager) => {
      const groups = manager.getRepository(AccessGroup);
      const locked = await groups.findOne({
        where: { id, companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw new NotFoundException('Access group not found');
      if (
        locked.updatedAt.getTime() !== originalUpdatedAt ||
        locked.status !== originalStatus ||
        locked.branchId !== originalBranchId ||
        locked.organizationId !== originalOrganizationId
      )
        throw new ConflictException('Group changed; reload and retry');
      if (
        item.organizationId !== originalOrganizationId &&
        (await manager
          .getRepository(AccessGroupEmployee)
          .count({ where: { accessGroupId: id } }))
      ) {
        throw new BadRequestException(
          'Remove group employees before changing the organization',
        );
      }
      if (
        item.status !== originalStatus ||
        item.branchId !== originalBranchId ||
        item.organizationId !== originalOrganizationId
      )
        await this.recordGroupReconciliation(
          manager,
          companyId,
          id,
          'GROUP_CHANGED',
          requestedByCompanyUserId,
        );
      return this.map(await groups.save(item));
    });
  }

  async remove(
    companyId: number,
    id: number,
    requestedByCompanyUserId: number | null = null,
  ): Promise<{ message: string }> {
    await this.findOrFail(companyId, id);
    await this.groupRepository.manager.transaction(async (manager) => {
      const groups = manager.getRepository(AccessGroup);
      const item = await groups.findOne({
        where: { id, companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!item) throw new NotFoundException('Access group not found');
      await this.recordGroupReconciliation(
        manager,
        companyId,
        id,
        'GROUP_REMOVED',
        requestedByCompanyUserId,
      );
      await groups.remove(item);
    });
    return { message: 'Access group deleted successfully' };
  }

  async assignDoors(
    companyId: number,
    groupId: number,
    dto: AssignAccessGroupDoorsDto,
    requestedByCompanyUserId: number | null = null,
  ) {
    await this.findOrFail(companyId, groupId);

    if (!dto.items?.length) {
      throw new BadRequestException(
        'items with door_id and schedule_template_id are required for group door assignment',
      );
    }
    const normalizedItems = dto.items;

    const uniqueDoorIds = [
      ...new Set(normalizedItems.map((item) => item.door_id)),
    ];
    const doors = await this.accessDoorRepository.find({
      where: { id: In(uniqueDoorIds), companyId },
      select: ['id'],
    });

    if (doors.length !== uniqueDoorIds.length) {
      throw new BadRequestException(
        'One or more door_ids do not belong to the active company',
      );
    }

    // Validate the whole batch before saving any assignment.
    for (const assignment of normalizedItems) {
      const door = await this.accessDoorRepository.findOne({
        where: { id: assignment.door_id, companyId },
      });
      const template = await this.scheduleTemplateRepository.findOne({
        where: { id: assignment.schedule_template_id, companyId },
      });
      if (!door || !door.deviceId || !template)
        throw new BadRequestException(
          'Each door needs a valid device and schedule template',
        );
      if (assignment.device_id && assignment.device_id !== door.deviceId)
        throw new BadRequestException(
          `Door ${door.id} belongs to a different device`,
        );
      if (template.deviceId !== null && template.deviceId !== door.deviceId)
        throw new BadRequestException(
          `Template ${template.id} belongs to a different device`,
        );
      const device = await this.attendanceDeviceRepository.findOne({
        where: { id: door.deviceId, companyId },
        select: ['id'],
      });
      if (!device)
        throw new BadRequestException(
          `Device for door ${door.id} does not belong to the active company`,
        );
    }
    return this.groupRepository.manager.transaction(async (manager) => {
      const group = await manager.getRepository(AccessGroup).findOne({
        where: { id: groupId, companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!group) throw new NotFoundException('Access group not found');
      const groupDoors = manager.getRepository(AccessGroupDoor);
      const groupDevices = manager.getRepository(AccessGroupDevice);
      let created = 0;
      let operationsCreated = 0;
      for (const assignment of normalizedItems) {
        const doorId = assignment.door_id;
        const door = await this.accessDoorRepository.findOne({
          where: { id: doorId, companyId },
        });
        if (!door) {
          continue;
        }

        const templateId = assignment.schedule_template_id || null;
        if (!templateId) {
          throw new BadRequestException(
            'schedule_template_id is required for each door item',
          );
        }

        const template = await this.scheduleTemplateRepository.findOne({
          where: { id: templateId, companyId },
        });
        if (!template) {
          throw new BadRequestException(
            `Invalid schedule_template_id: ${templateId}`,
          );
        }

        const resolvedDeviceId = assignment.device_id ?? door.deviceId;
        if (resolvedDeviceId === null) {
          throw new BadRequestException(
            `door_id ${doorId} is no longer linked to a device; provide a valid device_id`,
          );
        }

        const existing = await groupDoors.findOne({
          where: {
            accessGroupId: groupId,
            deviceId: resolvedDeviceId,
            doorNo: door.doorNo,
            hikvisionTemplateNo: template.hikvisionTemplateNo,
          },
        });

        const link = await groupDevices.findOne({
          where: { accessGroupId: groupId, deviceId: resolvedDeviceId },
        });
        if (!link) {
          await groupDevices.save(
            groupDevices.create({
              accessGroupId: groupId,
              deviceId: resolvedDeviceId,
              metadata: null,
            }),
          );
        }
        if (existing && link) continue;
        if (!existing) {
          await groupDoors.save(
            groupDoors.create({
              accessGroupId: groupId,
              deviceId: resolvedDeviceId,
              doorId,
              doorNo: door.doorNo,
              scheduleTemplateId: template.id,
              hikvisionTemplateNo: template.hikvisionTemplateNo,
            }),
          );
          created += 1;
        }
        operationsCreated += await this.recordDeviceReconciliation(
          manager,
          companyId,
          groupId,
          resolvedDeviceId,
          'DOOR_CHANGED',
          requestedByCompanyUserId,
        );
      }

      return {
        message: 'Group doors assigned successfully',
        group_id: groupId,
        created,
        reconciliation_operations_created: operationsCreated,
      };
    });
  }

  async assignDevices(
    companyId: number,
    groupId: number,
    dto: AssignAccessGroupDevicesDto,
    requestedByCompanyUserId: number | null = null,
  ) {
    await this.findOrFail(companyId, groupId);

    const uniqueDeviceIds = [...new Set(dto.device_ids)];
    const devices = await this.attendanceDeviceRepository.find({
      where: { id: In(uniqueDeviceIds), companyId },
      select: ['id'],
    });

    if (devices.length !== uniqueDeviceIds.length) {
      throw new BadRequestException(
        'One or more device_ids do not belong to the active company',
      );
    }

    return this.groupRepository.manager.transaction(async (manager) => {
      const group = await manager.getRepository(AccessGroup).findOne({
        where: { id: groupId, companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!group) throw new NotFoundException('Access group not found');
      const links = manager.getRepository(AccessGroupDevice);
      let created = 0;
      let operationsCreated = 0;
      for (const deviceId of uniqueDeviceIds.sort((a, b) => a - b)) {
        if (
          await links.findOne({ where: { accessGroupId: groupId, deviceId } })
        )
          continue;
        await links.save(
          links.create({ accessGroupId: groupId, deviceId, metadata: null }),
        );
        operationsCreated += await this.recordDeviceReconciliation(
          manager,
          companyId,
          groupId,
          deviceId,
          'DEVICE_ADDED',
          requestedByCompanyUserId,
        );
        created += 1;
      }
      return {
        message: 'Group devices assigned successfully',
        group_id: groupId,
        created,
        reconciliation_operations_created: operationsCreated,
      };
    });
  }

  async removeDevice(
    companyId: number,
    groupId: number,
    deviceId: number,
    requestedByCompanyUserId: number | null = null,
  ) {
    await this.findOrFail(companyId, groupId);

    return this.groupRepository.manager.transaction(async (manager) => {
      const group = await manager.getRepository(AccessGroup).findOne({
        where: { id: groupId, companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!group) throw new NotFoundException('Access group not found');
      const links = manager.getRepository(AccessGroupDevice);
      const existing = await links.findOne({
        where: { accessGroupId: groupId, deviceId },
      });
      if (!existing)
        throw new NotFoundException('Group device assignment not found');
      const doorAssignments = await manager
        .getRepository(AccessGroupDoor)
        .count({
          where: { accessGroupId: groupId, deviceId },
        });
      if (doorAssignments > 0) {
        throw new BadRequestException(
          'Remove access-group door assignments for this device before removing the device mapping',
        );
      }
      const operationsCreated = await this.recordDeviceReconciliation(
        manager,
        companyId,
        groupId,
        deviceId,
        'DEVICE_REMOVED',
        requestedByCompanyUserId,
      );
      await links.remove(existing);
      return {
        message: 'Group device removed successfully',
        group_id: groupId,
        device_id: deviceId,
        reconciliation_operations_created: operationsCreated,
      };
    });
  }

  private async recordDeviceReconciliation(
    manager: EntityManager,
    companyId: number,
    groupId: number,
    deviceId: number,
    reason:
      | 'DEVICE_ADDED'
      | 'DEVICE_REMOVED'
      | 'DOOR_CHANGED'
      | 'GROUP_CHANGED'
      | 'GROUP_REMOVED',
    requestedByCompanyUserId: number | null,
  ): Promise<number> {
    const members = await manager.getRepository(AccessGroupEmployee).find({
      where: { accessGroupId: groupId },
    });
    const targets = [
      ...new Map(
        members.map((member) => [
          member.employeeId == null
            ? `no:${member.employeeNo ?? ''}`
            : `id:${member.employeeId}`,
          {
            employeeId: member.employeeId ?? null,
            unresolvedEmployeeNo:
              member.employeeId == null ? (member.employeeNo ?? '') : null,
          },
        ]),
      ).values(),
    ];
    if (!targets.length) return 0;
    const operations = manager.getRepository(AccessReconciliationOperation);
    await operations.save(
      targets.map(({ employeeId, unresolvedEmployeeNo }) =>
        operations.create({
          companyId,
          employeeId,
          unresolvedEmployeeNo,
          deviceId,
          sourceGroupId: groupId,
          requestedByCompanyUserId,
          reason,
          status: 'PENDING_REVIEW',
        }),
      ),
    );
    return targets.length;
  }

  private async recordGroupReconciliation(
    manager: EntityManager,
    companyId: number,
    groupId: number,
    reason: 'GROUP_CHANGED' | 'GROUP_REMOVED',
    requestedByCompanyUserId: number | null,
  ): Promise<void> {
    const [links, doors] = await Promise.all([
      manager
        .getRepository(AccessGroupDevice)
        .find({ where: { accessGroupId: groupId } }),
      manager
        .getRepository(AccessGroupDoor)
        .find({ where: { accessGroupId: groupId } }),
    ]);
    const deviceIds = [
      ...new Set(
        [...links, ...doors].flatMap((item) =>
          item.deviceId === null ? [] : [item.deviceId],
        ),
      ),
    ].sort((a, b) => a - b);
    for (const deviceId of deviceIds) {
      await this.recordDeviceReconciliation(
        manager,
        companyId,
        groupId,
        deviceId,
        reason,
        requestedByCompanyUserId,
      );
    }
  }

  async removeDoor(
    companyId: number,
    groupId: number,
    doorId: number,
    requestedByCompanyUserId: number | null = null,
  ) {
    await this.findOrFail(companyId, groupId);
    return this.groupRepository.manager.transaction(async (manager) => {
      const group = await manager.getRepository(AccessGroup).findOne({
        where: { id: groupId, companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!group) throw new NotFoundException('Access group not found');
      const doors = manager.getRepository(AccessGroupDoor);
      const existing = await doors.find({
        where: { accessGroupId: groupId, doorId },
      });

      if (!existing.length) {
        throw new NotFoundException('Group door assignment not found');
      }

      let operationsCreated = 0;
      for (const deviceId of new Set(
        existing.flatMap((door) =>
          door.deviceId === null ? [] : [door.deviceId],
        ),
      )) {
        operationsCreated += await this.recordDeviceReconciliation(
          manager,
          companyId,
          groupId,
          deviceId,
          'DOOR_CHANGED',
          requestedByCompanyUserId,
        );
      }
      await doors.remove(existing);

      return {
        message: 'Group door removed successfully',
        group_id: groupId,
        door_id: doorId,
        reconciliation_operations_created: operationsCreated,
      };
    });
  }

  async assignEmployees(
    companyId: number,
    groupId: number,
    dto: AssignAccessGroupEmployeesDto,
    requestedByCompanyUserId: number | null = null,
  ) {
    const group = await this.findOrFail(companyId, groupId);
    if (!group.organizationId) {
      throw new BadRequestException(
        'Assign an organization to this access group before adding employees',
      );
    }

    const uniqueEmployeeIds = [...new Set(dto.employee_ids)].sort(
      (a, b) => a - b,
    );
    const employees = await this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin(
        CompanyUser,
        'companyUser',
        'companyUser.id = employee.company_user_id',
      )
      .where('employee.id IN (:...employeeIds)', {
        employeeIds: uniqueEmployeeIds,
      })
      .andWhere('companyUser.company_id = :companyId', { companyId })
      .select(['employee.id'])
      .getMany();

    if (employees.length !== uniqueEmployeeIds.length) {
      throw new BadRequestException(
        'One or more employee_ids do not belong to the active company',
      );
    }

    const organizationEmployees =
      await this.accessOrganizationEmployeeRepository.find({
        where: {
          organizationId: group.organizationId,
          employeeId: In(uniqueEmployeeIds),
        },
        relations: ['employee'],
      });

    if (organizationEmployees.length !== uniqueEmployeeIds.length) {
      throw new BadRequestException(
        'Every employee assigned to an access group must already belong to the same organization',
      );
    }

    const organizationEmployeeByEmployeeId = new Map(
      organizationEmployees.map((item) => [item.employeeId, item]),
    );

    return this.groupRepository.manager.transaction(async (manager) => {
      const lockedGroup = await manager.getRepository(AccessGroup).findOne({
        where: { id: groupId, companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedGroup || lockedGroup.organizationId !== group.organizationId)
        throw new BadRequestException(
          'Group organization changed; reload and retry',
        );
      const memberRepository = manager.getRepository(AccessGroupEmployee);
      let created = 0;
      let operationsCreated = 0;
      for (const employeeId of uniqueEmployeeIds) {
        const organizationEmployee =
          organizationEmployeeByEmployeeId.get(employeeId);
        if (!organizationEmployee?.employee) {
          continue;
        }

        const currentMembership = await manager
          .getRepository(AccessOrganizationEmployee)
          .findOne({
            where: { organizationId: group.organizationId!, employeeId },
            lock: { mode: 'pessimistic_write' },
          });
        if (!currentMembership)
          throw new BadRequestException(
            'Employee organization membership changed; reload and retry',
          );
        const existing = await memberRepository.findOne({
          where: {
            accessGroupId: groupId,
            employeeId,
          },
        });

        if (existing) {
          continue;
        }

        await memberRepository.save(
          memberRepository.create({
            accessGroupId: groupId,
            employeeId,
            employeeNo: organizationEmployee.employee.employee_no,
            employeeName:
              `${organizationEmployee.employee.first_name} ${organizationEmployee.employee.last_name}`.trim(),
            organizationId: group.organizationId,
          }),
        );
        operationsCreated += await this.recordMembershipReconciliation(
          manager,
          companyId,
          groupId,
          employeeId,
          'GROUP_ADDED',
          requestedByCompanyUserId,
        );

        created += 1;
      }

      return {
        message: 'Group employees assigned successfully',
        group_id: groupId,
        created,
        reconciliation_operations_created: operationsCreated,
        reconciliation_status: operationsCreated
          ? 'PENDING_REVIEW'
          : 'NO_DEVICE_TARGETS',
      };
    });
  }

  async removeEmployee(
    companyId: number,
    groupId: number,
    employeeId: number,
    requestedByCompanyUserId: number | null = null,
  ) {
    await this.findOrFail(companyId, groupId);

    return this.groupRepository.manager.transaction(async (manager) => {
      const lockedGroup = await manager.getRepository(AccessGroup).findOne({
        where: { id: groupId, companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedGroup) throw new NotFoundException('Access group not found');
      const memberRepository = manager.getRepository(AccessGroupEmployee);
      const existing = await memberRepository.find({
        where: { accessGroupId: groupId, employeeId },
      });
      if (!existing.length)
        throw new NotFoundException('Group employee assignment not found');
      const operationsCreated = await this.recordMembershipReconciliation(
        manager,
        companyId,
        groupId,
        employeeId,
        'GROUP_REMOVED',
        requestedByCompanyUserId,
      );
      await memberRepository.remove(existing);
      return {
        message: 'Group employee removed successfully',
        group_id: groupId,
        employee_id: employeeId,
        reconciliation_operations_created: operationsCreated,
        reconciliation_status: operationsCreated
          ? 'PENDING_REVIEW'
          : 'NO_DEVICE_TARGETS',
      };
    });
  }

  private async recordMembershipReconciliation(
    manager: EntityManager,
    companyId: number,
    groupId: number,
    employeeId: number,
    reason: 'GROUP_ADDED' | 'GROUP_REMOVED',
    requestedByCompanyUserId: number | null,
  ): Promise<number> {
    const [links, doors] = await Promise.all([
      manager
        .getRepository(AccessGroupDevice)
        .find({ where: { accessGroupId: groupId } }),
      manager
        .getRepository(AccessGroupDoor)
        .find({ where: { accessGroupId: groupId } }),
    ]);
    const candidateIds = [
      ...new Set([
        ...links.map((link) => link.deviceId),
        ...doors.flatMap((door) =>
          door.deviceId === null ? [] : [door.deviceId],
        ),
      ]),
    ];
    if (!candidateIds.length) return 0;
    const devices = await manager.getRepository(AttendanceDevice).find({
      where: { companyId, id: In(candidateIds) },
      select: ['id'],
      withDeleted: true,
    });
    if (devices.length !== candidateIds.length)
      throw new BadRequestException(
        'A group device is missing or belongs to another company',
      );
    const operations = manager.getRepository(AccessReconciliationOperation);
    await operations.save(
      devices.map((device) =>
        operations.create({
          companyId,
          employeeId,
          deviceId: device.id,
          sourceGroupId: groupId,
          requestedByCompanyUserId,
          reason,
          status: 'PENDING_REVIEW',
        }),
      ),
    );
    return devices.length;
  }

  async listReconciliationOperations(companyId: number, groupId: number) {
    await this.findOrFail(companyId, groupId);
    const rows = await this.groupRepository.manager
      .getRepository(AccessReconciliationOperation)
      .find({
        where: { companyId, sourceGroupId: groupId },
        order: { id: 'DESC' },
        take: 100,
      });
    return {
      group_id: groupId,
      data: rows.map((row) => ({
        id: row.id,
        employee_id: row.employeeId,
        unresolved_employee_no: row.unresolvedEmployeeNo,
        effective_date: row.effectiveDate,
        device_id: row.deviceId,
        requested_by_company_user_id: row.requestedByCompanyUserId,
        reason: row.reason,
        status: row.status,
        created_at: row.createdAt,
        last_error: row.lastError,
      })),
      warning:
        'These records require review. They do not yet synchronize or revoke device access.',
    };
  }

  async syncGroup(companyId: number, groupId: number) {
    return this.accessControlSyncService.syncGroup(companyId, groupId);
  }

  async previewGroup(companyId: number, groupId: number) {
    return this.accessControlSyncService.previewGroup(companyId, groupId);
  }

  async listGroupDoors(companyId: number, groupId: number) {
    await this.findOrFail(companyId, groupId);
    const rows = await this.accessGroupDoorRepository.find({
      where: { accessGroupId: groupId },
      relations: ['door', 'scheduleTemplate'],
    });

    return {
      group_id: groupId,
      data: rows.map((row) => ({
        id: row.id,
        access_group_id: row.accessGroupId,
        door_id: row.doorId,
        device_id: row.deviceId,
        door_no: row.doorNo,
        schedule_template_id: row.scheduleTemplateId,
        hikvision_template_no: row.hikvisionTemplateNo,
        metadata: row.metadata,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
      })),
    };
  }

  async listGroupDevices(companyId: number, groupId: number) {
    await this.findOrFail(companyId, groupId);
    const rows = await this.accessGroupDeviceRepository.find({
      where: { accessGroupId: groupId },
      relations: ['device'],
      order: { createdAt: 'ASC', id: 'ASC' },
    });

    return {
      group_id: groupId,
      data: rows.map((row) => ({
        id: row.id,
        access_group_id: row.accessGroupId,
        device_id: row.deviceId,
        metadata: row.metadata,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
      })),
    };
  }

  async listGroupEmployees(companyId: number, groupId: number) {
    await this.findOrFail(companyId, groupId);
    const rows = await this.accessGroupEmployeeRepository.find({
      where: { accessGroupId: groupId },
      relations: ['employee', 'organization'],
    });

    return {
      group_id: groupId,
      data: rows.map((row) => ({
        id: row.id,
        access_group_id: row.accessGroupId,
        employee_id: row.employeeId,
        employee_no: row.employeeNo,
        employee_name: row.employeeName,
        organization_id: row.organizationId,
        status: row.status,
        source: row.source,
        assigned_at: row.assignedAt,
        removed_at: row.removedAt,
        metadata: row.metadata,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
      })),
    };
  }

  private async findOrFail(
    companyId: number,
    id: number,
  ): Promise<AccessGroup> {
    const item = await this.groupRepository.findOne({
      where: { id, companyId },
    });
    if (!item) {
      throw new NotFoundException('Access group not found');
    }

    return item;
  }

  private async ensureBranch(
    companyId: number,
    branchId?: number | null,
  ): Promise<void> {
    if (!branchId) {
      return;
    }

    const branch = await this.branchRepository.findOne({
      where: { id: branchId, company_id: companyId },
      select: ['id'],
    });

    if (!branch) {
      throw new BadRequestException(
        'branch_id does not belong to the active company',
      );
    }
  }

  private async ensureOrganization(
    companyId: number,
    organizationId?: number | null,
  ): Promise<AccessOrganization | null> {
    if (!organizationId) {
      return null;
    }

    const organization = await this.accessOrganizationRepository.findOne({
      where: { id: organizationId, companyId },
      select: ['id', 'branchId'],
    });

    if (!organization) {
      throw new BadRequestException(
        'organization_id does not belong to the active company',
      );
    }

    return organization;
  }

  private map(item: AccessGroup) {
    return {
      id: item.id,
      company_id: item.companyId,
      branch_id: item.branchId,
      organization_id: item.organizationId,
      name: item.name,
      group_name: item.name,
      group_code: item.groupCode,
      description: item.description,
      status: item.status,
      source: item.source,
      grouping_key: item.groupingKey,
      is_virtual: item.isVirtual,
      is_active: item.isActive,
      metadata: item.metadata,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      deleted_at: item.deletedAt,
    };
  }
}
