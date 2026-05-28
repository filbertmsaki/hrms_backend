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
import { AccessDoorSourceEnum } from '../access-doors/enum/access-door-source.enum';
import { AccessDoorSyncStatusEnum } from '../access-doors/enum/access-door-sync-status.enum';
import { AccessGroupDoor } from '../access-group-doors/entity/access-group-door.entity';
import { AccessGroupEmployee } from '../access-group-employees/entity/access-group-employee.entity';
import { AccessGroupStatusEnum } from '../access-groups/enum/access-group-status.enum';
import { AccessGroup } from '../access-groups/entity/access-group.entity';
import { AccessGroupSourceEnum } from '../access-groups/enum/access-group-source.enum';
import { AccessOrganization } from '../access-organizations/entity/access-organization.entity';
import { AccessScheduleTemplate } from '../access-schedule-templates/entity/access-schedule-template.entity';
import { AccessWeekPlan } from '../access-week-plans/entity/access-week-plan.entity';
import { AccessWeekPlanSegment } from '../access-week-plan-segments/entity/access-week-plan-segment.entity';
import { EmployeeAccessCredential } from '../employee-access-credentials/entity/employee-access-credential.entity';
import { EmployeeDeviceAssignment } from '../employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeDeviceAssignmentSyncStatusEnum } from '../employee-device-assignments/enum/employee-device-assignment-sync-status.enum';
import { EmployeeDeviceRightPlan } from '../employee-device-right-plans/entity/employee-device-right-plan.entity';
import { HikvisionSyncLog } from '../hikvision-sync-logs/entity/hikvision-sync-log.entity';
import { HikvisionSyncLogDirectionEnum } from '../hikvision-sync-logs/enum/hikvision-sync-log-direction.enum';
import { HikvisionSyncLogStatusEnum } from '../hikvision-sync-logs/enum/hikvision-sync-log-status.enum';
import { HikvisionSyncLogTypeEnum } from '../hikvision-sync-logs/enum/hikvision-sync-log-type.enum';

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
    @InjectRepository(AccessWeekPlanSegment)
    private readonly accessWeekPlanSegmentRepository: Repository<AccessWeekPlanSegment>,
    @InjectRepository(AccessOrganization)
    private readonly accessOrganizationRepository: Repository<AccessOrganization>,
    @InjectRepository(EmployeeAccessCredential)
    private readonly employeeAccessCredentialRepository: Repository<EmployeeAccessCredential>,
    @InjectRepository(EmployeeDeviceAssignment)
    private readonly employeeDeviceAssignmentRepository: Repository<EmployeeDeviceAssignment>,
    @InjectRepository(EmployeeDeviceRightPlan)
    private readonly employeeDeviceRightPlanRepository: Repository<EmployeeDeviceRightPlan>,
    @InjectRepository(HikvisionSyncLog)
    private readonly hikvisionSyncLogRepository: Repository<HikvisionSyncLog>,
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
      where: { id: group.scheduleTemplateId ?? -1, companyId },
    });

    if (!scheduleTemplate) {
      throw new NotFoundException('Schedule template not found for group');
    }

    const weekPlan = await this.accessWeekPlanRepository.findOne({
      where: { id: scheduleTemplate.weekPlanId, companyId },
    });
    const weekPlanSegments = weekPlan
      ? await this.accessWeekPlanSegmentRepository.find({
          where: { weekPlanId: weekPlan.id },
        })
      : [];

    const doorMapByDevice = new Map<number, AccessDoor[]>();
    for (const door of doors) {
      if (!doorMapByDevice.has(door.deviceId)) {
        doorMapByDevice.set(door.deviceId, []);
      }
      doorMapByDevice.get(door.deviceId)!.push(door);
    }

    const results: Array<Record<string, unknown>> = [];

    for (const groupEmployee of groupEmployeeAssignments) {
      if (!groupEmployee.employeeId) {
        results.push({
          employee_id: null,
          status: 'SKIPPED',
          reason: 'group employee does not have employee_id',
        });
        continue;
      }

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
          weekPlan,
          weekPlanSegments,
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

  async syncDevice(companyId: number, deviceId: number) {
    const startedAt = new Date();
    const results = {
      doors: await this.syncDeviceDoors(companyId, deviceId),
      week_plans: await this.syncDeviceWeekPlans(companyId, deviceId),
      templates: await this.syncDeviceTemplates(companyId, deviceId),
      users: await this.syncDeviceUsers(companyId, deviceId),
      virtual_groups: await this.generateVirtualGroups(companyId, deviceId),
    };

    await this.hikvisionSyncLogRepository.save(
      this.hikvisionSyncLogRepository.create({
        companyId,
        deviceId,
        syncType: HikvisionSyncLogTypeEnum.FULL,
        direction: HikvisionSyncLogDirectionEnum.PULL,
        status: HikvisionSyncLogStatusEnum.SUCCESS,
        startedAt,
        completedAt: new Date(),
        recordsReceived: 0,
        recordsProcessed: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        recordsFailed: 0,
        metadata: results as Record<string, unknown>,
      }),
    );

    return {
      message: 'Full device sync workflow completed',
      device_id: deviceId,
      results,
    };
  }

  async syncDeviceDoors(companyId: number, deviceId: number) {
    let synced = 0;
    for (let doorNo = 1; doorNo <= 32; doorNo += 1) {
      const response = await this.hikvisionAccessControlService.getDoorConfiguration(
        companyId,
        deviceId,
        doorNo,
      );

      if (!response.ok) {
        continue;
      }

      const parsed = this.toObject(response.parsed);
      const doorParam = this.toObject(parsed.DoorParam ?? parsed);
      const doorName =
        String(doorParam.doorName ?? doorParam.name ?? `Door ${doorNo}`).trim() || `Door ${doorNo}`;

      let door = await this.accessDoorRepository.findOne({
        where: { companyId, deviceId, doorNo },
      });

      if (!door) {
        door = this.accessDoorRepository.create({
          companyId,
          deviceId,
          doorNo,
          doorName,
          source: AccessDoorSourceEnum.DEVICE_SYNC,
          syncStatus: AccessDoorSyncStatusEnum.SYNCED,
        });
      } else {
        door.doorName = doorName;
      }

      door.lastSyncedAt = new Date();
      door.metadata = {
        ...(door.metadata ?? {}),
        hikvision: {
          ...(this.toObject((door.metadata ?? {}).hikvision)),
          pulled_at: new Date().toISOString(),
          raw: parsed,
        },
      };

      await this.accessDoorRepository.save(door);
      synced += 1;
    }

    return {
      message: 'Door pull completed',
      device_id: deviceId,
      synced,
    };
  }

  async syncDeviceWeekPlans(companyId: number, deviceId: number) {
    const syncedPlanNos: string[] = [];
    for (let planNo = 1; planNo <= 64; planNo += 1) {
      const planNoText = String(planNo);
      const response = await this.hikvisionAccessControlService.getUserRightWeekPlanCfg(
        companyId,
        deviceId,
        planNoText,
      );
      if (!response.ok) {
        continue;
      }

      const parsed = this.toObject(response.parsed);
      const cfg = this.toObject(parsed.UserRightWeekPlanCfg ?? parsed);
      const resolvedPlanNo = String(cfg.weekPlanNo ?? planNoText);

      let weekPlan = await this.accessWeekPlanRepository.findOne({
        where: { companyId, deviceId, hikvisionPlanNo: resolvedPlanNo },
      });

      if (!weekPlan) {
        weekPlan = this.accessWeekPlanRepository.create({
          companyId,
          deviceId,
          hikvisionPlanNo: resolvedPlanNo,
          source: 'DEVICE_SYNC' as any,
          enable: true,
          isSystemDefault: false,
        });
      }

      weekPlan.lastSyncedAt = new Date();
      weekPlan.metadata = {
        ...(weekPlan.metadata ?? {}),
        hikvision: {
          pulled_at: new Date().toISOString(),
          raw: parsed,
        },
      };

      await this.accessWeekPlanRepository.save(weekPlan);
      syncedPlanNos.push(resolvedPlanNo);
    }

    return {
      message: 'Week plan pull completed',
      device_id: deviceId,
      synced: syncedPlanNos.length,
      plan_nos: syncedPlanNos,
    };
  }

  async syncDeviceTemplates(companyId: number, deviceId: number) {
    const syncedTemplateNos: string[] = [];
    for (let templateNo = 1; templateNo <= 64; templateNo += 1) {
      const templateNoText = String(templateNo);
      const response = await this.hikvisionAccessControlService.getUserRightPlanTemplate(
        companyId,
        deviceId,
        templateNoText,
      );
      if (!response.ok) {
        continue;
      }

      const parsed = this.toObject(response.parsed);
      const cfg = this.toObject(parsed.UserRightPlanTemplate ?? parsed);
      const hikvisionTemplateNo = String(cfg.planTemplateNo ?? templateNoText);
      const templateName = String(cfg.planTemplateName ?? `Template ${hikvisionTemplateNo}`);
      const hikvisionWeekPlanNo = String(cfg.weekPlanNo ?? '1');

      let weekPlan = await this.accessWeekPlanRepository.findOne({
        where: { companyId, deviceId, hikvisionPlanNo: hikvisionWeekPlanNo },
      });
      if (!weekPlan) {
        weekPlan = await this.accessWeekPlanRepository.save(
          this.accessWeekPlanRepository.create({
            companyId,
            deviceId,
            hikvisionPlanNo: hikvisionWeekPlanNo,
            enable: true,
            source: 'DEVICE_SYNC' as any,
            isSystemDefault: false,
          }),
        );
      }

      let template = await this.accessScheduleTemplateRepository.findOne({
        where: { companyId, deviceId, hikvisionTemplateNo },
      });
      if (!template) {
        template = this.accessScheduleTemplateRepository.create({
          companyId,
          deviceId,
          hikvisionTemplateNo,
          templateName,
          weekPlanId: weekPlan.id,
          hikvisionWeekPlanNo,
          source: 'DEVICE_SYNC' as any,
          enable: true,
          name: templateName,
        });
      }

      template.name = templateName;
      template.templateName = templateName;
      template.weekPlanId = weekPlan.id;
      template.hikvisionWeekPlanNo = hikvisionWeekPlanNo;
      template.lastSyncedAt = new Date();
      template.metadata = {
        ...(template.metadata ?? {}),
        hikvision: {
          pulled_at: new Date().toISOString(),
          raw: parsed,
        },
      };

      await this.accessScheduleTemplateRepository.save(template);
      syncedTemplateNos.push(hikvisionTemplateNo);
    }

    return {
      message: 'Template pull completed',
      device_id: deviceId,
      synced: syncedTemplateNos.length,
      template_nos: syncedTemplateNos,
    };
  }

  async syncDeviceUsers(companyId: number, deviceId: number) {
    const payload = {
      UserInfoSearchCond: {
        searchID: `full-user-sync-${Date.now()}`,
        searchResultPosition: 0,
        maxResults: 500,
      },
    };

    const response = await this.hikvisionAccessControlService.searchUserInfo(companyId, deviceId, payload);
    const users = this.extractUsersFromSearch(response.parsed);

    let processed = 0;
    for (const user of users) {
      const employeeNo = String(user.employeeNo ?? '').trim();
      if (!employeeNo) {
        continue;
      }

      const employee = await this.employeeRepository
        .createQueryBuilder('employee')
        .where('employee.employee_no = :employeeNo', { employeeNo })
        .getOne();

      const org = await this.resolveOrCreateOrganizationFromUser(companyId, deviceId, user);

      let assignment = await this.employeeDeviceAssignmentRepository.findOne({
        where: { deviceId, employeeNo },
      });

      if (!assignment) {
        assignment = this.employeeDeviceAssignmentRepository.create({
          companyId,
          employeeId: employee?.id ?? null,
          employeeNo,
          deviceId,
          organizationId: org?.id ?? null,
          syncStatus: EmployeeDeviceAssignmentSyncStatusEnum.SYNCED,
        });
      }

      assignment.employeeId = employee?.id ?? assignment.employeeId ?? null;
      assignment.organizationId = org?.id ?? assignment.organizationId ?? null;
      assignment.hikvisionUserType = String(user.userType ?? assignment.hikvisionUserType ?? '');
      assignment.userVerifyMode = String(user.userVerifyMode ?? assignment.userVerifyMode ?? '');
      assignment.doorRight = String(user.doorRight ?? assignment.doorRight ?? '');
      assignment.lastSyncedAt = new Date();
      assignment.syncStatus = EmployeeDeviceAssignmentSyncStatusEnum.SYNCED;
      assignment.metadata = {
        ...(assignment.metadata ?? {}),
        hikvision_raw_user: user,
      };

      const savedAssignment = await this.employeeDeviceAssignmentRepository.save(assignment);
      await this.syncAssignmentRightPlans(companyId, deviceId, savedAssignment, user);
      processed += 1;
    }

    return {
      message: 'User pull completed',
      device_id: deviceId,
      processed,
    };
  }

  async generateVirtualGroups(companyId: number, deviceId: number) {
    const rightPlans = await this.employeeDeviceRightPlanRepository.find({
      where: { deviceId },
      relations: ['assignment'],
    });

    const grouped = new Map<string, EmployeeDeviceRightPlan[]>();
    for (const plan of rightPlans) {
      const key = `device:${deviceId}|door:${plan.doorNo}|template:${plan.hikvisionTemplateNo}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(plan);
    }

    const results: Array<Record<string, unknown>> = [];
    for (const [key, plans] of grouped.entries()) {
      const sample = plans[0];
      let group = await this.accessGroupRepository.findOne({
        where: { companyId, groupingKey: key },
      });

      if (!group) {
        group = await this.accessGroupRepository.save(
          this.accessGroupRepository.create({
            companyId,
            deviceId,
            name: `ALL ACCESS D${sample.doorNo} T${sample.hikvisionTemplateNo}`,
            source: AccessGroupSourceEnum.IVMS_VIRTUAL,
            groupingKey: key,
            isVirtual: true,
            isActive: true,
            status: AccessGroupStatusEnum.ACTIVE,
          }),
        );
      }

      for (const plan of plans) {
        const assignment = plan.assignment;
        if (!assignment) {
          continue;
        }

        const door = await this.accessDoorRepository.findOne({
          where: { companyId, deviceId, doorNo: plan.doorNo },
        });
        const template = await this.accessScheduleTemplateRepository.findOne({
          where: { companyId, deviceId, hikvisionTemplateNo: plan.hikvisionTemplateNo },
        });

        if (door && template) {
          const existingDoor = await this.accessGroupDoorRepository.findOne({
            where: {
              accessGroupId: group.id,
              deviceId,
              doorNo: plan.doorNo,
              hikvisionTemplateNo: plan.hikvisionTemplateNo,
            },
          });

          if (!existingDoor) {
            await this.accessGroupDoorRepository.save(
              this.accessGroupDoorRepository.create({
                accessGroupId: group.id,
                deviceId,
                doorId: door.id,
                doorNo: plan.doorNo,
                scheduleTemplateId: template.id,
                hikvisionTemplateNo: plan.hikvisionTemplateNo,
              }),
            );
          }
        }

        const existingEmployee = await this.accessGroupEmployeeRepository.findOne({
          where: {
            accessGroupId: group.id,
            employeeNo: assignment.employeeNo,
            deviceId,
          },
        });

        if (!existingEmployee) {
          await this.accessGroupEmployeeRepository.save(
            this.accessGroupEmployeeRepository.create({
              accessGroupId: group.id,
              employeeId: assignment.employeeId,
              employeeNo: assignment.employeeNo,
              employeeName: assignment.employeeNo,
              deviceId,
              organizationId: assignment.organizationId,
              source: 'DEVICE_SYNC' as any,
              assignedAt: new Date(),
            }),
          );
        }
      }

      results.push({
        grouping_key: key,
        members: plans.length,
      });
    }

    return {
      message: 'Virtual access groups generated',
      device_id: deviceId,
      groups: results,
    };
  }

  private async syncEmployeeToDevice(params: {
    companyId: number;
    group: AccessGroup;
    scheduleTemplate: AccessScheduleTemplate;
    weekPlan: AccessWeekPlan | null;
    weekPlanSegments: AccessWeekPlanSegment[];
    employee: Employee;
    credentials: EmployeeAccessCredential | null;
    deviceId: number;
    doors: AccessDoor[];
  }): Promise<Record<string, unknown>> {
    const {
      companyId,
      group,
      scheduleTemplate,
      weekPlan,
      weekPlanSegments,
      employee,
      credentials,
      deviceId,
      doors,
    } = params;

    try {
      const organization = await this.resolveOrganization(companyId, employee, group);
      if (organization?.hikvisionGroupNo) {
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

      if (weekPlan) {
        const weekPlanCfg = weekPlanSegments.map((segment) => ({
          week: this.formatWeekDay(segment.weekDay),
          id: segment.segmentNo,
          enable: segment.enable,
          TimeSegment: {
            beginTime: segment.beginTime,
            endTime: segment.endTime,
          },
        }));

        await this.hikvisionAccessControlService.putUserRightWeekPlanCfg(
          companyId,
          deviceId,
          weekPlan.hikvisionPlanNo,
          {
            UserRightWeekPlanCfg: {
              weekPlanNo: weekPlan.hikvisionPlanNo,
              WeekPlanCfg: weekPlanCfg,
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

  private extractUsersFromSearch(payload: unknown): Array<Record<string, unknown>> {
    const data = this.toObject(payload);
    const search = this.toObject(data.UserInfoSearch ?? data.UserInfoSearchResult ?? data);
    const list = search.UserInfo ?? search.UserInfoList ?? search.userInfoList ?? [];
    if (Array.isArray(list)) {
      return list.map((item) => this.toObject(item));
    }

    if (list && typeof list === 'object') {
      return [this.toObject(list)];
    }

    return [];
  }

  private async resolveOrCreateOrganizationFromUser(
    companyId: number,
    deviceId: number,
    user: Record<string, unknown>,
  ): Promise<AccessOrganization | null> {
    const orgIndex = String(user.orgIndex ?? user.groupNo ?? '').trim() || null;
    const orgName = String(user.orgName ?? '').trim() || null;

    if (!orgIndex && !orgName) {
      return null;
    }

    const fallbackName = orgName ?? 'Default Organization';
    let organization = await this.accessOrganizationRepository.findOne({
      where: orgIndex
        ? { companyId, hikvisionOrgIndex: orgIndex }
        : { companyId, orgName: fallbackName },
    });

    if (!organization) {
      organization = this.accessOrganizationRepository.create({
        companyId,
        deviceId,
        orgName: fallbackName,
        name: fallbackName,
        hikvisionOrgIndex: orgIndex,
        hikvisionGroupNo: orgIndex,
        source: 'DEVICE_SYNC' as any,
      });
    } else {
      organization.deviceId = organization.deviceId ?? deviceId;
      organization.orgName = organization.orgName || fallbackName;
      organization.name = organization.name || fallbackName;
      organization.hikvisionOrgIndex = organization.hikvisionOrgIndex ?? orgIndex;
      organization.hikvisionGroupNo = organization.hikvisionGroupNo ?? orgIndex;
    }

    return this.accessOrganizationRepository.save(organization);
  }

  private async syncAssignmentRightPlans(
    companyId: number,
    deviceId: number,
    assignment: EmployeeDeviceAssignment,
    user: Record<string, unknown>,
  ) {
    const rawRightPlan = user.RightPlan ?? user.rightPlan ?? [];
    const rightPlans = Array.isArray(rawRightPlan) ? rawRightPlan : [rawRightPlan];

    await this.employeeDeviceRightPlanRepository.delete({
      employeeDeviceAssignmentId: assignment.id,
    });

    for (const entry of rightPlans) {
      const row = this.toObject(entry);
      const doorNo = Number(row.doorNo ?? row.doorID ?? 0);
      const hikvisionTemplateNo = String(row.planTemplateNo ?? row.templateNo ?? '').trim();
      if (!doorNo || !hikvisionTemplateNo) {
        continue;
      }

      const door = await this.accessDoorRepository.findOne({
        where: { companyId, deviceId, doorNo },
      });
      const template = await this.accessScheduleTemplateRepository.findOne({
        where: { companyId, deviceId, hikvisionTemplateNo },
      });

      await this.employeeDeviceRightPlanRepository.save(
        this.employeeDeviceRightPlanRepository.create({
          employeeDeviceAssignmentId: assignment.id,
          employeeNo: assignment.employeeNo,
          deviceId,
          doorId: door?.id ?? null,
          doorNo,
          scheduleTemplateId: template?.id ?? null,
          hikvisionTemplateNo,
          metadata: row,
        }),
      );
    }
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

  private formatWeekDay(value: string): string {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : 'Monday';
  }
}
