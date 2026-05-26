import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { AttendanceDevice } from '../../hr/attendance/devices/entities/attendance-device.entity';
import { Employee } from '../../hr/employees/entities/employee.entity';
import { HikvisionAccessControlService } from '../../hikvision/hikvision-access-control.service';
import { AccessDoor } from '../access-doors/entity/access-door.entity';
import { AccessGroupDoor } from '../access-group-doors/entity/access-group-door.entity';
import { AccessGroupEmployee } from '../access-group-employees/entity/access-group-employee.entity';
import { AccessGroupStatusEnum } from '../access-groups/enum/access-group-status.enum';
import { AccessGroup } from '../access-groups/entity/access-group.entity';
import { AccessOrganization } from '../access-organizations/entity/access-organization.entity';
import { AccessScheduleTemplate } from '../access-schedule-templates/entity/access-schedule-template.entity';
import { AccessWeekPlan } from '../access-week-plans/entity/access-week-plan.entity';
import { EmployeeAccessCredential } from '../employee-access-credentials/entity/employee-access-credential.entity';
import { EmployeeDeviceAssignment } from '../employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeDeviceAssignmentSyncStatusEnum } from '../employee-device-assignments/enum/employee-device-assignment-sync-status.enum';

@Injectable()
export class AccessControlSyncService {
  private readonly logger = new Logger(AccessControlSyncService.name);

  constructor(
    @InjectRepository(AccessGroup)
    private readonly accessGroupRepository: Repository<AccessGroup>,
    @InjectRepository(AccessGroupDoor)
    private readonly accessGroupDoorRepository: Repository<AccessGroupDoor>,
    @InjectRepository(AccessGroupEmployee)
    private readonly accessGroupEmployeeRepository: Repository<AccessGroupEmployee>,
    @InjectRepository(AccessDoor)
    private readonly accessDoorRepository: Repository<AccessDoor>,
    @InjectRepository(AccessScheduleTemplate)
    private readonly accessScheduleTemplateRepository: Repository<AccessScheduleTemplate>,
    @InjectRepository(AccessWeekPlan)
    private readonly accessWeekPlanRepository: Repository<AccessWeekPlan>,
    @InjectRepository(AccessOrganization)
    private readonly accessOrganizationRepository: Repository<AccessOrganization>,
    @InjectRepository(EmployeeAccessCredential)
    private readonly employeeAccessCredentialRepository: Repository<EmployeeAccessCredential>,
    @InjectRepository(EmployeeDeviceAssignment)
    private readonly employeeDeviceAssignmentRepository: Repository<EmployeeDeviceAssignment>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(AttendanceDevice)
    private readonly attendanceDeviceRepository: Repository<AttendanceDevice>,
    private readonly hikvisionAccessControlService: HikvisionAccessControlService,
  ) {}

  async syncGroup(companyId: number, groupId: number) {
    const group = await this.accessGroupRepository.findOne({
      where: { id: groupId, companyId },
      relations: ['scheduleTemplate'],
    });

    if (!group) {
      throw new NotFoundException('Access group not found');
    }

    if (group.status !== AccessGroupStatusEnum.ACTIVE) {
      throw new BadRequestException('Only active groups can be synced');
    }

    const groupDoorAssignments = await this.accessGroupDoorRepository.find({
      where: { accessGroupId: group.id },
    });

    const groupEmployeeAssignments = await this.accessGroupEmployeeRepository.find({
      where: { accessGroupId: group.id },
    });

    if (!groupDoorAssignments.length) {
      throw new BadRequestException('Group has no assigned doors');
    }

    if (!groupEmployeeAssignments.length) {
      throw new BadRequestException('Group has no assigned employees');
    }

    const doorIds = groupDoorAssignments.map((item) => item.doorId);
    const doors = await this.accessDoorRepository.find({
      where: { id: In(doorIds), companyId },
    });

    const scheduleTemplate = await this.accessScheduleTemplateRepository.findOne({
      where: { id: group.scheduleTemplateId, companyId },
    });

    if (!scheduleTemplate) {
      throw new NotFoundException('Schedule template not found for group');
    }

    const weekPlans = await this.accessWeekPlanRepository.find({
      where: {
        companyId,
        scheduleTemplateId: scheduleTemplate.id,
      },
    });

    const doorMapByDevice = new Map<number, AccessDoor[]>();
    for (const door of doors) {
      if (!doorMapByDevice.has(door.deviceId)) {
        doorMapByDevice.set(door.deviceId, []);
      }
      doorMapByDevice.get(door.deviceId)!.push(door);
    }

    const results: Array<Record<string, unknown>> = [];

    for (const groupEmployee of groupEmployeeAssignments) {
      const employee = await this.findEmployeeOrFail(companyId, groupEmployee.employeeId);
      const credentials = await this.employeeAccessCredentialRepository.findOne({
        where: { companyId, employeeId: employee.id },
      });

      const employeeAssignments = await this.employeeDeviceAssignmentRepository.find({
        where: { employeeId: employee.id },
      });
      const assignedDeviceIds = new Set(employeeAssignments.map((item) => item.deviceId));

      for (const [deviceId, deviceDoors] of doorMapByDevice.entries()) {
        if (assignedDeviceIds.size > 0 && !assignedDeviceIds.has(deviceId)) {
          results.push({
            employee_id: employee.id,
            device_id: deviceId,
            status: 'SKIPPED',
            reason: 'employee not assigned to this device',
          });
          continue;
        }

        const syncResult = await this.syncEmployeeToDevice({
          companyId,
          group,
          scheduleTemplate,
          weekPlans,
          employee,
          credentials,
          deviceId,
          doors: deviceDoors,
        });

        results.push(syncResult);
      }
    }

    return {
      message: 'Access group sync completed',
      group_id: groupId,
      results,
    };
  }

  async syncEmployee(companyId: number, employeeId: number) {
    await this.findEmployeeOrFail(companyId, employeeId);

    const memberships = await this.accessGroupEmployeeRepository.find({
      where: { employeeId },
    });

    const groupIds = [...new Set(memberships.map((item) => item.accessGroupId))];

    const results: Array<Record<string, unknown>> = [];
    for (const groupId of groupIds) {
      try {
        const response = await this.syncGroup(companyId, groupId);
        results.push({ group_id: groupId, status: 'SYNCED', response });
      } catch (error) {
        results.push({
          group_id: groupId,
          status: 'FAILED',
          reason: (error as Error).message,
        });
      }
    }

    return {
      message: 'Employee sync completed',
      employee_id: employeeId,
      results,
    };
  }

  async syncFullDevice(companyId: number, deviceId: number) {
    const device = await this.attendanceDeviceRepository.findOne({
      where: { id: deviceId, companyId },
      select: ['id'],
    });

    if (!device) {
      throw new NotFoundException('Attendance device not found');
    }

    const groupIdsRaw = await this.accessGroupDoorRepository
      .createQueryBuilder('groupDoor')
      .innerJoin(AccessDoor, 'door', 'door.id = groupDoor.door_id')
      .innerJoin(AccessGroup, 'group', 'group.id = groupDoor.access_group_id')
      .where('door.device_id = :deviceId', { deviceId })
      .andWhere('door.company_id = :companyId', { companyId })
      .andWhere('group.company_id = :companyId', { companyId })
      .andWhere('group.status = :status', { status: AccessGroupStatusEnum.ACTIVE })
      .select(['group.id as group_id'])
      .getRawMany<{ group_id: number }>();

    const groupIds = [...new Set(groupIdsRaw.map((item) => Number(item.group_id)).filter(Boolean))];
    const results: Array<Record<string, unknown>> = [];

    for (const groupId of groupIds) {
      try {
        const response = await this.syncGroup(companyId, groupId);
        results.push({ group_id: groupId, status: 'SYNCED', response });
      } catch (error) {
        results.push({ group_id: groupId, status: 'FAILED', reason: (error as Error).message });
      }
    }

    return {
      message: 'Full device sync completed',
      device_id: deviceId,
      total_groups: groupIds.length,
      results,
    };
  }

  async syncFullCompany(companyId: number, targetCompanyId: number) {
    if (companyId !== targetCompanyId) {
      throw new BadRequestException('Company mismatch for full-company sync');
    }

    const groups = await this.accessGroupRepository.find({
      where: { companyId, status: AccessGroupStatusEnum.ACTIVE },
      select: ['id'],
    });

    const results: Array<Record<string, unknown>> = [];
    for (const group of groups) {
      try {
        const response = await this.syncGroup(companyId, group.id);
        results.push({ group_id: group.id, status: 'SYNCED', response });
      } catch (error) {
        results.push({ group_id: group.id, status: 'FAILED', reason: (error as Error).message });
      }
    }

    return {
      message: 'Full company sync completed',
      company_id: companyId,
      total_groups: groups.length,
      results,
    };
  }

  private async syncEmployeeToDevice(params: {
    companyId: number;
    group: AccessGroup;
    scheduleTemplate: AccessScheduleTemplate;
    weekPlans: AccessWeekPlan[];
    employee: Employee;
    credentials: EmployeeAccessCredential | null;
    deviceId: number;
    doors: AccessDoor[];
  }): Promise<Record<string, unknown>> {
    const {
      companyId,
      group,
      scheduleTemplate,
      weekPlans,
      employee,
      credentials,
      deviceId,
      doors,
    } = params;

    try {
      const organization = await this.resolveOrganization(companyId, employee, group);
      if (organization) {
        await this.hikvisionAccessControlService.putGroupCfg(
          companyId,
          deviceId,
          organization.hikvisionGroupNo,
          { name: organization.name },
        );
      }

      await this.hikvisionAccessControlService.putUserRightPlanTemplate(
        companyId,
        deviceId,
        scheduleTemplate.hikvisionTemplateNo,
        {
          UserRightPlanTemplate: {
            planTemplateNo: scheduleTemplate.hikvisionTemplateNo,
            planTemplateName: scheduleTemplate.name,
            templateType: scheduleTemplate.scheduleType,
          },
        },
      );

      for (const weekPlan of weekPlans) {
        await this.hikvisionAccessControlService.putUserRightWeekPlanCfg(
          companyId,
          deviceId,
          weekPlan.hikvisionPlanNo,
          {
            UserRightWeekPlanCfg: {
              weekPlanNo: weekPlan.hikvisionPlanNo,
              weekPlan: [
                {
                  dayOfWeek: weekPlan.dayOfWeek,
                  timeSegment: [
                    {
                      startTime: weekPlan.startTime,
                      endTime: weekPlan.endTime,
                    },
                  ],
                },
              ],
            },
          },
        );
      }

      const doorNos = doors.map((door) => door.doorNo).sort((a, b) => a - b);
      const doorRight = doorNos.join(',');
      const rightPlan = doorNos.map((doorNo) => ({
        doorNo,
        planTemplateNo: scheduleTemplate.hikvisionTemplateNo,
      }));

      const employeeNo = employee.employee_no;
      const userName = `${employee.first_name} ${employee.last_name}`.trim();

      const searchResponse = await this.hikvisionAccessControlService.searchUserInfo(companyId, deviceId, {
        UserInfoSearchCond: {
          searchID: `search-${Date.now()}-${employee.id}`,
          searchResultPosition: 0,
          maxResults: 10,
          employeeNoList: [{ employeeNo }],
        },
      });

      const userExists = this.searchResultContainsEmployeeNo(searchResponse.parsed, employeeNo);

      const userInfoPayload = {
        UserInfo: {
          employeeNo,
          name: userName,
          userType: 'normal',
          ...(organization ? { groupNo: organization.hikvisionGroupNo } : {}),
          doorRight,
          RightPlan: rightPlan,
        },
      };

      if (userExists) {
        await this.hikvisionAccessControlService.modifyUserInfo(companyId, deviceId, userInfoPayload);
      } else {
        await this.hikvisionAccessControlService.recordUserInfo(companyId, deviceId, userInfoPayload);
      }

      if (credentials?.cardNo) {
        const cardSearch = await this.hikvisionAccessControlService.searchCardInfo(companyId, deviceId, {
          CardInfoSearchCond: {
            searchID: `card-search-${Date.now()}-${employee.id}`,
            searchResultPosition: 0,
            maxResults: 10,
            cardNo: credentials.cardNo,
          },
        });

        const cardExists = this.searchResultContainsCardNo(cardSearch.parsed, credentials.cardNo);
        const cardPayload = {
          CardInfo: {
            cardNo: credentials.cardNo,
            employeeNo,
            cardType: 'normalCard',
          },
        };

        if (cardExists) {
          await this.hikvisionAccessControlService.modifyCardInfo(companyId, deviceId, cardPayload);
        } else {
          await this.hikvisionAccessControlService.recordCardInfo(companyId, deviceId, cardPayload);
        }
      }

      if (credentials?.hasFingerprint) {
        const metadata = this.toObject(credentials.metadata);
        const fingerprintPayload = this.toObject(metadata.fingerprint_payload);
        if (Object.keys(fingerprintPayload).length) {
          await this.hikvisionAccessControlService.setupFingerprint(
            companyId,
            deviceId,
            fingerprintPayload,
          );
        }
      }

      await this.saveEmployeeDeviceSyncStatus(employee.id, deviceId, {
        syncStatus: EmployeeDeviceAssignmentSyncStatusEnum.SYNCED,
        metadata: {
          last_group_id: group.id,
          last_synced_at: new Date().toISOString(),
          door_right: doorRight,
        },
      });

      return {
        employee_id: employee.id,
        device_id: deviceId,
        status: 'SYNCED',
      };
    } catch (error) {
      await this.saveEmployeeDeviceSyncStatus(employee.id, deviceId, {
        syncStatus: EmployeeDeviceAssignmentSyncStatusEnum.FAILED,
        metadata: {
          last_group_id: group.id,
          last_error: (error as Error).message,
          failed_at: new Date().toISOString(),
        },
      });

      this.logger.warn(
        `Failed syncing employee ${employee.id} to device ${deviceId}: ${(error as Error).message}`,
      );

      return {
        employee_id: employee.id,
        device_id: deviceId,
        status: 'FAILED',
        reason: (error as Error).message,
      };
    }
  }

  private async resolveOrganization(
    companyId: number,
    employee: Employee,
    group: AccessGroup,
  ): Promise<AccessOrganization | null> {
    if (employee.primary_department_id) {
      const byDepartment = await this.accessOrganizationRepository.findOne({
        where: { companyId, departmentId: employee.primary_department_id },
      });
      if (byDepartment) {
        return byDepartment;
      }
    }

    if (group.branchId) {
      const byBranch = await this.accessOrganizationRepository.findOne({
        where: { companyId, branchId: group.branchId },
      });
      if (byBranch) {
        return byBranch;
      }
    }

    return null;
  }

  private searchResultContainsEmployeeNo(payload: unknown, employeeNo: string): boolean {
    const text = JSON.stringify(payload || {});
    return text.includes(`"employeeNo":"${employeeNo}"`) || text.includes(employeeNo);
  }

  private searchResultContainsCardNo(payload: unknown, cardNo: string): boolean {
    const text = JSON.stringify(payload || {});
    return text.includes(`"cardNo":"${cardNo}"`) || text.includes(cardNo);
  }

  private async saveEmployeeDeviceSyncStatus(
    employeeId: number,
    deviceId: number,
    input: {
      syncStatus: EmployeeDeviceAssignmentSyncStatusEnum;
      metadata: Record<string, unknown>;
    },
  ) {
    let item = await this.employeeDeviceAssignmentRepository.findOne({
      where: { employeeId, deviceId },
    });

    if (!item) {
      item = this.employeeDeviceAssignmentRepository.create({
        employeeId,
        deviceId,
      });
    }

    item.syncStatus = input.syncStatus;
    item.lastSyncedAt = new Date();
    item.metadata = {
      ...(item.metadata ?? {}),
      ...input.metadata,
    };

    await this.employeeDeviceAssignmentRepository.save(item);
  }

  private async findEmployeeOrFail(companyId: number, employeeId: number): Promise<Employee> {
    const employee = await this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoinAndSelect(CompanyUser, 'companyUser', 'companyUser.id = employee.company_user_id')
      .where('employee.id = :employeeId', { employeeId })
      .andWhere('companyUser.company_id = :companyId', { companyId })
      .getOne();

    if (!employee) {
      throw new NotFoundException('Employee not found for active company');
    }

    return employee;
  }

  private toObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }
}
