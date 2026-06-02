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
import { EmployeeDeviceIdentity } from '../../hr/attendance/processing/entities/employee-device-identity.entity';
import { Employee } from '../../hr/employees/entities/employee.entity';
import { HikvisionAccessControlService } from '../../hikvision/hikvision-access-control.service';
import { AccessDoor } from '../access-doors/entity/access-door.entity';
import { AccessDoorSourceEnum } from '../access-doors/enum/access-door-source.enum';
import { AccessDoorSyncStatusEnum } from '../access-doors/enum/access-door-sync-status.enum';
import { AccessGroupDoor } from '../access-group-doors/entity/access-group-door.entity';
import { AccessGroupEmployee } from '../access-group-employees/entity/access-group-employee.entity';
import { AccessGroupEmployeeStatusEnum } from '../access-group-employees/enum/access-group-employee-status.enum';
import { AccessGroupStatusEnum } from '../access-groups/enum/access-group-status.enum';
import { AccessGroup } from '../access-groups/entity/access-group.entity';
import { AccessGroupSourceEnum } from '../access-groups/enum/access-group-source.enum';
import { AccessOrganization } from '../access-organizations/entity/access-organization.entity';
import { AccessScheduleTemplate } from '../access-schedule-templates/entity/access-schedule-template.entity';
import { AccessWeekPlan } from '../access-week-plans/entity/access-week-plan.entity';
import { AccessWeekPlanSegment } from '../access-week-plan-segments/entity/access-week-plan-segment.entity';
import { EmployeeAccessCredential } from '../employee-access-credentials/entity/employee-access-credential.entity';
import { EmployeeAccessCredentialStatusEnum } from '../employee-access-credentials/enum/employee-access-credential-status.enum';
import { EmployeeAccessCredentialTypeEnum } from '../employee-access-credentials/enum/employee-access-credential-type.enum';
import { EmployeeDeviceAssignment } from '../employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeDeviceAssignmentSyncStatusEnum } from '../employee-device-assignments/enum/employee-device-assignment-sync-status.enum';
import { EmployeeDeviceRightPlan } from '../employee-device-right-plans/entity/employee-device-right-plan.entity';
import { EmployeeDeviceAccessActionEnum } from '../employee-device-access-audit-logs/enum/employee-device-access-action.enum';
import { EmployeeDeviceAccessAuditStatusEnum } from '../employee-device-access-audit-logs/enum/employee-device-access-audit-status.enum';
import { EmployeeDeviceAccessAuditLogService } from '../employee-device-access-audit-logs/service/employee-device-access-audit-log.service';
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
    @InjectRepository(EmployeeDeviceIdentity)
    private readonly employeeDeviceIdentityRepository: Repository<EmployeeDeviceIdentity>,
    private readonly hikvisionAccessControlService: HikvisionAccessControlService,
    private readonly employeeDeviceAccessAuditLogService: EmployeeDeviceAccessAuditLogService,
  ) {}

  async syncGroup(companyId: number, groupId: number) {
    const group = await this.accessGroupRepository.findOne({
      where: { id: groupId, companyId },
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

    const doorIds = [...new Set(groupDoorAssignments.map((item) => item.doorId))];
    const templateIds = [...new Set(groupDoorAssignments.map((item) => item.scheduleTemplateId))];

    const [doors, templates] = await Promise.all([
      this.accessDoorRepository.find({
        where: { id: In(doorIds), companyId },
      }),
      this.accessScheduleTemplateRepository.find({
        where: { id: In(templateIds), companyId },
      }),
    ]);

    const doorById = new Map(doors.map((door) => [door.id, door]));
    const templateById = new Map(templates.map((template) => [template.id, template]));

    const weekPlanIds = [...new Set(templates.map((template) => template.weekPlanId))];
    const weekPlans = await this.accessWeekPlanRepository.find({
      where: { id: In(weekPlanIds), companyId },
    });
    const weekPlanById = new Map(weekPlans.map((weekPlan) => [weekPlan.id, weekPlan]));

    const weekPlanSegments = weekPlanIds.length
      ? await this.accessWeekPlanSegmentRepository.find({
          where: { weekPlanId: In(weekPlanIds) },
        })
      : [];
    const weekPlanSegmentsByPlanId = new Map<number, AccessWeekPlanSegment[]>();
    for (const segment of weekPlanSegments) {
      if (!weekPlanSegmentsByPlanId.has(segment.weekPlanId)) {
        weekPlanSegmentsByPlanId.set(segment.weekPlanId, []);
      }
      weekPlanSegmentsByPlanId.get(segment.weekPlanId)!.push(segment);
    }

    const doorTemplateMap = new Map<
      string,
      { deviceId: number; template: AccessScheduleTemplate; doors: AccessDoor[] }
    >();
    for (const assignment of groupDoorAssignments) {
      const door = doorById.get(assignment.doorId);
      const template = templateById.get(assignment.scheduleTemplateId);
      if (!door || !template || door.deviceId === null) {
        continue;
      }

      const key = `${door.deviceId}|${template.id}`;
      if (!doorTemplateMap.has(key)) {
        doorTemplateMap.set(key, {
          deviceId: door.deviceId,
          template,
          doors: [],
        });
      }
      doorTemplateMap.get(key)!.doors.push(door);
    }

    if (!doorTemplateMap.size) {
      throw new NotFoundException('No valid door/template assignments found for group');
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
      const credentials = await this.employeeAccessCredentialRepository.find({
        where: { companyId, employeeId: employee.id },
      });

      const employeeAssignments = await this.employeeDeviceAssignmentRepository.find({
        where: { employeeId: employee.id },
      });
      const assignedDeviceIds = new Set(
        employeeAssignments
          .map((item) => item.deviceId)
          .filter((deviceId): deviceId is number => deviceId !== null),
      );
      const assignmentByDeviceId = new Map(
        employeeAssignments
          .filter((assignment): assignment is EmployeeDeviceAssignment & { deviceId: number } => assignment.deviceId !== null)
          .map((assignment) => [assignment.deviceId, assignment]),
      );

      for (const assignmentEntry of doorTemplateMap.values()) {
        const deviceId = assignmentEntry.deviceId;
        const scheduleTemplate = assignmentEntry.template;
        const weekPlan = weekPlanById.get(scheduleTemplate.weekPlanId) ?? null;
        const deviceDoors = assignmentEntry.doors;

        if (assignedDeviceIds.size > 0 && !assignedDeviceIds.has(deviceId)) {
          results.push({
            employee_id: employee.id,
            device_id: deviceId,
            schedule_template_id: scheduleTemplate.id,
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
          weekPlanSegments: weekPlan
            ? (weekPlanSegmentsByPlanId.get(weekPlan.id) ?? [])
            : [],
          employee,
          credentials,
          deviceId,
          doors: deviceDoors,
          assignment: assignmentByDeviceId.get(deviceId) ?? null,
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
        const groupResults = Array.isArray(response.results) ? response.results : [];
        const hasFailedResult = groupResults.some(
          (result) => this.toObject(result).status === 'FAILED',
        );
        results.push({
          group_id: groupId,
          status: hasFailedResult ? 'FAILED' : 'SYNCED',
          response,
        });
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

  async disableEmployeeAccess(companyId: number, employeeId: number, deviceId: number) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId);
    const assignment = await this.employeeDeviceAssignmentRepository.findOne({
      where: { employeeId: employee.id, deviceId },
    });
    if (!assignment) {
      throw new NotFoundException('Employee is not assigned to the target device');
    }

    try {
      const deviceEmployeeNo = this.resolveDeviceEmployeeNo(employee, assignment);
      const payload = {
        UserInfo: {
          employeeNo: deviceEmployeeNo,
          Valid: {
            enable: false,
          },
        },
      };
      await this.hikvisionAccessControlService.modifyUserInfo(companyId, deviceId, payload);

      assignment.syncStatus = EmployeeDeviceAssignmentSyncStatusEnum.SYNCED;
      assignment.metadata = {
        ...(assignment.metadata ?? {}),
        access_disabled: true,
        disabled_at: new Date().toISOString(),
      };
      assignment.lastSyncedAt = new Date();
      await this.employeeDeviceAssignmentRepository.save(assignment);

      await this.employeeDeviceRightPlanRepository.delete({
        employeeDeviceAssignmentId: assignment.id,
      });

      await this.accessGroupEmployeeRepository
        .createQueryBuilder()
        .update(AccessGroupEmployee)
        .set({
          status: AccessGroupEmployeeStatusEnum.REMOVED,
          removedAt: new Date(),
        })
        .where('employee_id = :employeeId', { employeeId: employee.id })
        .andWhere('device_id = :deviceId', { deviceId })
        .execute();

      await this.employeeDeviceAccessAuditLogService.create({
        company_id: companyId,
        employee_id: employee.id,
        employee_no: employee.employee_no,
        employee_name: `${employee.first_name} ${employee.last_name}`.trim(),
        device_id: deviceId,
        action: EmployeeDeviceAccessActionEnum.DISABLE_ACCESS,
        status: EmployeeDeviceAccessAuditStatusEnum.SUCCESS,
        request_payload: payload,
        new_values: {
          assignment_sync_status: assignment.syncStatus,
          right_plans_removed: true,
        },
      });

      return {
        message: 'Employee access disabled on device',
        employee_id: employeeId,
        device_id: deviceId,
      };
    } catch (error) {
      await this.employeeDeviceAccessAuditLogService.create({
        company_id: companyId,
        employee_id: employee.id,
        employee_no: employee.employee_no,
        employee_name: `${employee.first_name} ${employee.last_name}`.trim(),
        device_id: deviceId,
        action: EmployeeDeviceAccessActionEnum.DISABLE_ACCESS,
        status: EmployeeDeviceAccessAuditStatusEnum.FAILED,
        error_message: (error as Error).message,
      });
      throw error;
    }
  }

  async deleteEmployeeFromDevice(companyId: number, employeeId: number, deviceId: number) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId);
    const assignment = await this.employeeDeviceAssignmentRepository.findOne({
      where: { employeeId: employee.id, deviceId },
    });
    if (!assignment) {
      throw new NotFoundException('Employee is not assigned to the target device');
    }

    const payload = {
      UserInfoDelCond: {
        EmployeeNoList: [
          {
            employeeNo: this.resolveDeviceEmployeeNo(employee, assignment),
          },
        ],
      },
    };

    try {
      await this.hikvisionAccessControlService.deleteUserInfo(companyId, deviceId, payload);

      assignment.syncStatus = EmployeeDeviceAssignmentSyncStatusEnum.REMOVED;
      assignment.lastSyncedAt = new Date();
      assignment.metadata = {
        ...(assignment.metadata ?? {}),
        removed_from_device: true,
        removed_at: new Date().toISOString(),
      };
      await this.employeeDeviceAssignmentRepository.save(assignment);

      await this.employeeDeviceRightPlanRepository.delete({
        employeeDeviceAssignmentId: assignment.id,
      });

      await this.credentialRepositoryMarkRemoved(companyId, employee.id, deviceId);

      await this.accessGroupEmployeeRepository
        .createQueryBuilder()
        .update(AccessGroupEmployee)
        .set({
          status: AccessGroupEmployeeStatusEnum.REMOVED,
          removedAt: new Date(),
        })
        .where('employee_id = :employeeId', { employeeId: employee.id })
        .andWhere('device_id = :deviceId', { deviceId })
        .execute();

      await this.employeeDeviceAccessAuditLogService.create({
        company_id: companyId,
        employee_id: employee.id,
        employee_no: employee.employee_no,
        employee_name: `${employee.first_name} ${employee.last_name}`.trim(),
        device_id: deviceId,
        action: EmployeeDeviceAccessActionEnum.DELETE_USER,
        status: EmployeeDeviceAccessAuditStatusEnum.SUCCESS,
        request_payload: payload,
        new_values: {
          assignment_sync_status: EmployeeDeviceAssignmentSyncStatusEnum.REMOVED,
          credentials_marked: EmployeeAccessCredentialStatusEnum.DELETED,
        },
      });

      return {
        message: 'Employee removed from device',
        employee_id: employeeId,
        device_id: deviceId,
      };
    } catch (error) {
      await this.employeeDeviceAccessAuditLogService.create({
        company_id: companyId,
        employee_id: employee.id,
        employee_no: employee.employee_no,
        employee_name: `${employee.first_name} ${employee.last_name}`.trim(),
        device_id: deviceId,
        action: EmployeeDeviceAccessActionEnum.DELETE_USER,
        status: EmployeeDeviceAccessAuditStatusEnum.FAILED,
        request_payload: payload,
        error_message: (error as Error).message,
      });
      throw error;
    }
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
      const org = await this.resolveOrCreateOrganizationFromUser(companyId, deviceId, user);
      let assignment = await this.employeeDeviceAssignmentRepository.findOne({
        where: { companyId, deviceId, employeeNo },
      });
      const identity = await this.employeeDeviceIdentityRepository.findOne({
        where: { companyId, deviceId, employeeNo, isActive: true },
      });
      const mappedEmployeeId = assignment?.employeeId ?? identity?.employeeId ?? null;
      const employee = mappedEmployeeId
        ? await this.employeeRepository.findOne({ where: { id: mappedEmployeeId } })
        : null;

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
      await this.upsertDeviceIdentity(
        companyId,
        employee?.id ?? null,
        savedAssignment.employeeNo,
        deviceId,
      );
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
        } else {
          let shouldSave = false;
          if (existingEmployee.organizationId !== assignment.organizationId) {
            existingEmployee.organizationId = assignment.organizationId;
            shouldSave = true;
          }
          if (!existingEmployee.employeeId && assignment.employeeId) {
            existingEmployee.employeeId = assignment.employeeId;
            shouldSave = true;
          }
          if (shouldSave) {
            await this.accessGroupEmployeeRepository.save(existingEmployee);
          }
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
    credentials: EmployeeAccessCredential[];
    deviceId: number;
    doors: AccessDoor[];
    assignment: EmployeeDeviceAssignment | null;
  }): Promise<Record<string, unknown>> {
    const {
      companyId,
      group,
      scheduleTemplate,
      weekPlan,
      employee,
      credentials,
      deviceId,
      doors,
      assignment,
    } = params;
    const employeeNo = this.resolveDeviceEmployeeNo(employee, assignment);

    try {
      const doorNos = doors.map((door) => door.doorNo).sort((a, b) => a - b);
      const doorRight = doorNos.join(',');
      const rightPlan = doorNos.map((doorNo) => ({
        doorNo,
        planTemplateNo: scheduleTemplate.hikvisionTemplateNo,
      }));

      const userName = `${employee.first_name} ${employee.last_name}`.trim();
      const credentialBundle = this.buildCredentialBundle(credentials, deviceId);

      const userInfoPayload = {
        UserInfo: {
          employeeNo,
          name: userName,
          userType: 'normal',
          ...(credentialBundle.password ? { password: credentialBundle.password } : {}),
          userVerifyMode: credentialBundle.userVerifyMode,
          Valid: {
            enable: assignment?.validEnabled ?? true,
            beginTime: this.formatHikvisionDateTime(
              assignment?.validBeginTime ?? this.startOfToday(),
            ),
            endTime: this.formatHikvisionDateTime(
              assignment?.validEndTime ?? this.endOfDate(this.addYears(new Date(), 10)),
            ),
            timeType: 'local',
          },
          doorRight,
          RightPlan: rightPlan,
        },
      };

      const setupResponse = await this.hikvisionAccessControlService.setupUserInfo(
        companyId,
        deviceId,
        userInfoPayload,
      );
      this.ensureHikvisionSuccess('SetUpUserInfo', setupResponse);

      await this.saveEmployeeDeviceSyncStatus(companyId, employee.id, employeeNo, deviceId, {
        syncStatus: EmployeeDeviceAssignmentSyncStatusEnum.SYNCED,
        metadata: {
          last_group_id: group.id,
          last_synced_at: new Date().toISOString(),
          door_right: doorRight,
        },
      });

      await this.employeeDeviceAccessAuditLogService.create({
        company_id: companyId,
        branch_id: group.branchId,
        employee_id: employee.id,
        employee_no: employee.employee_no,
        employee_name: `${employee.first_name} ${employee.last_name}`.trim(),
        device_id: deviceId,
        action: EmployeeDeviceAccessActionEnum.SYNC_ACCESS_GROUP,
        status: EmployeeDeviceAccessAuditStatusEnum.SUCCESS,
        request_payload: {
          group_id: group.id,
          schedule_template_id: scheduleTemplate.id,
          week_plan_id: weekPlan?.id ?? null,
          door_nos: doorNos,
          user_info: userInfoPayload,
        },
        response_payload: {
          user_sync: 'OK',
          password_sync: credentialBundle.password ? 'OK' : 'SKIPPED',
          fingerprint_mode: credentialBundle.hasFingerprint ? 'ENABLED' : 'SKIPPED',
          user_verify_mode: credentialBundle.userVerifyMode,
        },
        old_values: null,
        new_values: {
          sync_status: EmployeeDeviceAssignmentSyncStatusEnum.SYNCED,
          door_right: doorRight,
        },
      });

      return {
        employee_id: employee.id,
        device_id: deviceId,
        status: 'SYNCED',
      };
    } catch (error) {
      await this.saveEmployeeDeviceSyncStatus(companyId, employee.id, employeeNo, deviceId, {
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

      await this.employeeDeviceAccessAuditLogService.create({
        company_id: companyId,
        branch_id: group.branchId,
        employee_id: employee.id,
        employee_no: employee.employee_no,
        employee_name: `${employee.first_name} ${employee.last_name}`.trim(),
        device_id: deviceId,
        action: EmployeeDeviceAccessActionEnum.SYNC_ACCESS_GROUP,
        status: EmployeeDeviceAccessAuditStatusEnum.FAILED,
        request_payload: {
          group_id: group.id,
          schedule_template_id: scheduleTemplate.id,
          week_plan_id: weekPlan?.id ?? null,
        },
        error_message: (error as Error).message,
        new_values: {
          sync_status: EmployeeDeviceAssignmentSyncStatusEnum.FAILED,
        },
      });

      return {
        employee_id: employee.id,
        device_id: deviceId,
        status: 'FAILED',
        reason: (error as Error).message,
      };
    }
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
    companyId: number,
    employeeId: number,
    employeeNo: string,
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
        companyId,
        employeeId,
        employeeNo,
        deviceId,
      });
    }

    item.companyId = companyId;
    item.employeeId = employeeId;
    item.employeeNo = employeeNo;
    item.syncStatus = input.syncStatus;
    item.lastSyncedAt = new Date();
    item.metadata = {
      ...(item.metadata ?? {}),
      ...input.metadata,
    };

    await this.employeeDeviceAssignmentRepository.save(item);
  }

  private resolveDeviceEmployeeNo(employee: Employee, assignment: EmployeeDeviceAssignment | null): string {
    const fromAssignment = assignment?.employeeNo?.trim();
    if (fromAssignment) {
      return fromAssignment;
    }

    throw new BadRequestException(
      `Employee ${employee.id} is missing a device-specific Hikvision employee number for this assignment`,
    );
  }

  private async upsertDeviceIdentity(
    companyId: number,
    employeeId: number | null,
    deviceEmployeeNo: string,
    deviceId: number,
  ) {
    if (!employeeId) return;
    const normalizedEmployeeNo = String(deviceEmployeeNo ?? '').trim();
    if (!normalizedEmployeeNo) return;

    let identity = await this.employeeDeviceIdentityRepository.findOne({
      where: { companyId, employeeId, deviceId },
    });

    if (!identity) {
      identity = await this.employeeDeviceIdentityRepository.findOne({
        where: { companyId, deviceId, employeeNo: normalizedEmployeeNo },
      });
    }

    if (!identity) {
      identity = this.employeeDeviceIdentityRepository.create({
        companyId,
        employeeId,
        employeeNo: normalizedEmployeeNo,
        deviceId,
        isActive: true,
      });
    } else {
      identity.companyId = companyId;
      identity.employeeId = employeeId;
      identity.employeeNo = normalizedEmployeeNo;
      identity.deviceId = deviceId;
      identity.isActive = true;
    }

    await this.employeeDeviceIdentityRepository.save(identity);
  }

  private async credentialRepositoryMarkRemoved(companyId: number, employeeId: number, deviceId: number) {
    const rows = await this.employeeAccessCredentialRepository.find({
      where: { companyId, employeeId, deviceId },
    });

    for (const row of rows) {
      row.credentialStatus = EmployeeAccessCredentialStatusEnum.DELETED;
      row.lastSyncedAt = new Date();
      row.metadata = {
        ...(row.metadata ?? {}),
        removed_from_device: true,
        removed_at: new Date().toISOString(),
      };
      await this.employeeAccessCredentialRepository.save(row);
    }
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

  private buildCredentialBundle(credentials: EmployeeAccessCredential[], deviceId: number) {
    const relevantCredentials = credentials.filter(
      (credential) => credential.deviceId === null || credential.deviceId === deviceId,
    );

    const passwordCredential = relevantCredentials.find(
      (credential) =>
        credential.credentialStatus === EmployeeAccessCredentialStatusEnum.ACTIVE &&
        (credential.credentialType === EmployeeAccessCredentialTypeEnum.PASSWORD ||
          credential.credentialType === EmployeeAccessCredentialTypeEnum.PIN) &&
        Boolean(credential.pinPassword),
    );

    const cardCredential = relevantCredentials.find(
      (credential) =>
        credential.credentialStatus === EmployeeAccessCredentialStatusEnum.ACTIVE &&
        credential.credentialType === EmployeeAccessCredentialTypeEnum.CARD &&
        Boolean(credential.cardNo),
    );

    const fingerprintCredential = relevantCredentials.find(
      (credential) =>
        credential.credentialStatus === EmployeeAccessCredentialStatusEnum.ACTIVE &&
        (credential.credentialType === EmployeeAccessCredentialTypeEnum.FINGERPRINT ||
          credential.hasFingerprint),
    );

    const password = passwordCredential?.pinPassword?.trim() || null;
    const cardNo = cardCredential?.cardNo?.trim() || null;
    const hasFingerprint = Boolean(fingerprintCredential?.hasFingerprint || fingerprintCredential);

    return {
      password,
      cardNo,
      hasFingerprint,
      fingerprintCredential: fingerprintCredential ?? null,
      userVerifyMode: this.resolveUserVerifyMode(Boolean(password), hasFingerprint, Boolean(cardNo)),
    };
  }

  private resolveUserVerifyMode(
    hasPassword: boolean,
    hasFingerprint: boolean,
    hasCard: boolean,
  ): string {
    if (hasFingerprint && hasCard && hasPassword) {
      return 'fpAndCardAndPw';
    }

    if (hasFingerprint && hasPassword) {
      return 'fpAndPw';
    }

    if (hasCard && hasPassword) {
      return 'cardAndPw';
    }

    if (hasFingerprint && hasCard) {
      return 'fpAndCard';
    }

    if (hasFingerprint) {
      return 'fp';
    }

    if (hasCard) {
      return 'card';
    }

    return 'cardOrFpOrPw';
  }

  private startOfToday(): Date {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private endOfDate(date: Date): Date {
    const value = new Date(date);
    value.setHours(23, 59, 59, 0);
    return value;
  }

  private addYears(date: Date, years: number): Date {
    const value = new Date(date);
    value.setFullYear(value.getFullYear() + years);
    return value;
  }

  private formatHikvisionDateTime(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
    ].join('-')
      + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  private ensureHikvisionSuccess(
    operation: string,
    response: {
      ok: boolean;
      status: number;
      parsed: Record<string, unknown> | string;
      raw: string;
    },
  ) {
    if (!response.ok) {
      const detail = this.extractHikvisionFailureReason(response.parsed)
        ?? this.formatHikvisionErrorDetail(response.parsed || response.raw);
      throw new BadRequestException(
        `${operation} failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
      );
    }

    const failureReason = this.extractHikvisionFailureReason(response.parsed);
    if (failureReason) {
      throw new BadRequestException(`${operation} failed: ${failureReason}`);
    }
  }

  private formatHikvisionErrorDetail(payload: unknown): string | null {
    if (!payload) {
      return null;
    }

    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return null;
    }

    return normalized.length > 500 ? `${normalized.slice(0, 500)}...` : normalized;
  }

  private extractHikvisionFailureReason(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const root = payload as Record<string, unknown>;
    const statusString = this.findFirstStringDeep(root, ['statusString', 'statusStrg', 'status']);
    const statusCode = this.findFirstStringDeep(root, ['statusCode']);
    const subStatusCode = this.findFirstStringDeep(root, ['subStatusCode']);
    const errorCode = this.findFirstStringDeep(root, ['errorCode']);
    const errorMessage = this.findFirstStringDeep(root, ['errorMsg', 'errorMessage', 'message']);

    const hasStatusEnvelope =
      Boolean(statusString) || Boolean(statusCode) || Boolean(subStatusCode) || Boolean(errorCode);
    if (!hasStatusEnvelope) {
      return null;
    }

    const normalizedStatusString = statusString.toLowerCase();
    const normalizedSubStatus = subStatusCode.toLowerCase();
    const normalizedErrorCode = errorCode.toLowerCase();
    const normalizedStatusCode = statusCode.toLowerCase();

    const successSubStatus = new Set(['ok', 'success', 'none']);
    const successStatusString = new Set(['ok', 'success', 'successful', 'enabled', 'completed']);
    const successStatusCode = new Set(['1', '200']);

    if (normalizedSubStatus && !successSubStatus.has(normalizedSubStatus)) {
      return `${subStatusCode}${errorMessage ? ` (${errorMessage})` : ''}`;
    }

    if (normalizedStatusString && !successStatusString.has(normalizedStatusString)) {
      return `${statusString}${errorMessage ? ` (${errorMessage})` : ''}`;
    }

    if (normalizedErrorCode && normalizedErrorCode !== '0' && normalizedErrorCode !== '1') {
      return `${errorCode}${errorMessage ? ` (${errorMessage})` : ''}`;
    }

    if (normalizedStatusCode && !successStatusCode.has(normalizedStatusCode)) {
      return `${statusCode}${errorMessage ? ` (${errorMessage})` : ''}`;
    }

    return null;
  }

  private findFirstStringDeep(source: Record<string, unknown>, candidateKeys: string[]): string {
    const keySet = new Set(candidateKeys.map((key) => key.toLowerCase()));
    const stack: unknown[] = [source];
    let depth = 0;

    while (stack.length && depth < 8) {
      const node = stack.shift();
      if (Array.isArray(node)) {
        stack.push(...node);
        depth += 1;
        continue;
      }

      if (!node || typeof node !== 'object') {
        depth += 1;
        continue;
      }

      const record = node as Record<string, unknown>;
      for (const [key, value] of Object.entries(record)) {
        if (keySet.has(key.toLowerCase())) {
          const normalized = String(value ?? '').trim();
          if (normalized) {
            return normalized;
          }
        }
      }

      stack.push(...Object.values(record));
      depth += 1;
    }

    return '';
  }
}
