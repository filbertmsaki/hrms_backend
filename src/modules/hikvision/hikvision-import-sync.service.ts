import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { In, Repository } from 'typeorm';
import { AttendanceDevice } from '../access-control/attendance-devices/entities/attendance-device.entity';
import { AttendanceDeviceStatusEnum } from '../access-control/attendance-devices/enums/attendance-device-status.enum';
import { AttendanceDeviceSyncModeEnum } from '../access-control/attendance-devices/enums/attendance-device-sync-mode.enum';
import { EmployeeDeviceAssignment } from '../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { AccessControlSyncService } from '../access-control/service/access-control-sync.service';
import { Employee } from '../hr/employees/entities/employee.entity';
import { HikvisionPeopleCredentialSyncService } from './hikvision-people-credential-sync.service';
import {
  HIKVISION_SYNC_QUEUE,
  HikvisionImportedEmployeePayload,
  HikvisionSyncJobData,
  HikvisionSyncJobName,
} from './hikvision-sync-job.constants';
import { HikvisionAttendanceSyncService } from './hikvision-attendance-sync.service';
import { HikvisionUserManagementService } from './hikvision-user-management.service';

type ImportedEmployeeSyncCandidate = {
  employeeId: number;
  employeeNumber: string | null;
  providedDeviceEmployeeNumber: string | null;
};

type ImportedEmployeeSyncTarget = {
  employeeId: number;
  employeeNumber: string | null;
  deviceEmployeeNumber: string | null;
};

type DeviceSyncTarget = {
  companyId: number;
  deviceCode: string;
  requestedEmployeeNos: string[];
  matchedTargets: ImportedEmployeeSyncTarget[];
};

type ImportedEmployeeSyncJobResult = {
  status: 'COMPLETED' | 'SKIPPED';
  scheduledFor: string | null;
  totals: {
    requestedEmployees: number;
    employeesWithoutDeviceEmployeeNumber: number;
    employeesWithoutAssignments: number;
    deviceUserMismatches: number;
    devicesProcessed: number;
    devicesFailed: number;
  };
};

type ImportSyncSchedule = {
  runAt: Date;
  timeZone: string;
  attendanceStartTime: string | null;
} | null;

@Injectable()
export class HikvisionImportSyncService {
  private readonly logger = new Logger(HikvisionImportSyncService.name);

  constructor(
    @InjectQueue(HIKVISION_SYNC_QUEUE)
    private readonly hikvisionSyncQueue: Queue<HikvisionSyncJobData>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeDeviceAssignment)
    private readonly assignmentRepository: Repository<EmployeeDeviceAssignment>,
    private readonly hikvisionUserManagementService: HikvisionUserManagementService,
    private readonly hikvisionPeopleCredentialSyncService: HikvisionPeopleCredentialSyncService,
    private readonly hikvisionAttendanceSyncService: HikvisionAttendanceSyncService,
    private readonly accessControlSyncService: AccessControlSyncService,
  ) {}

  async scheduleImportedEmployeesSync(input: {
    companyId: number;
    importBatchId: string;
    importFileName: string;
    requestedByUserId: number | null;
    requestedByCompanyUserId: number | null;
    employees: ImportedEmployeeSyncCandidate[];
  }): Promise<{ scheduled: boolean; scheduledFor: string | null }> {
    const uniqueCandidates = this.uniqueImportedEmployees(input.employees);
    if (!uniqueCandidates.length) {
      return { scheduled: false, scheduledFor: null };
    }

    const schedule = this.resolveNextScheduledRun(new Date());
    if (!schedule) {
      this.logger.warn(
        `Hikvision automatic synchronization is disabled for import batch ${input.importBatchId}: HIKVISION_AUTO_SYNC_START_TIME is missing or invalid.`,
      );
      return { scheduled: false, scheduledFor: null };
    }

    const jobData: HikvisionSyncJobData = {
      companyId: input.companyId,
      deviceId: 0,
      requestedByUserId: input.requestedByUserId,
      requestedByCompanyUserId: input.requestedByCompanyUserId,
      requestedAt: new Date().toISOString(),
      importedEmployees: uniqueCandidates.map((employee) =>
        this.toJobPayload(employee),
      ),
      importBatchId: input.importBatchId,
      importFileName: input.importFileName,
      scheduledFor: schedule.runAt.toISOString(),
      timeZone: schedule.timeZone,
      attendanceStartTime: schedule.attendanceStartTime ?? undefined,
    };

    await this.hikvisionSyncQueue.add(
      HikvisionSyncJobName.SYNC_IMPORTED_EMPLOYEES,
      jobData,
      {
        attempts: 1,
        delay: Math.max(schedule.runAt.getTime() - Date.now(), 0),
        jobId: `hikvision-import-sync:${input.companyId}:${input.importBatchId}`,
        removeOnComplete: {
          age: 24 * 60 * 60,
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 60 * 60,
          count: 1000,
        },
      },
    );

    this.logger.log(
      `Queued Hikvision import synchronization for batch ${input.importBatchId} with ${uniqueCandidates.length} employee(s) at ${schedule.runAt.toISOString()} (${schedule.timeZone}).`,
    );

    return {
      scheduled: true,
      scheduledFor: schedule.runAt.toISOString(),
    };
  }

  async runQueuedImportedEmployeesSync(
    jobData: HikvisionSyncJobData,
  ): Promise<ImportedEmployeeSyncJobResult> {
    const candidates = this.uniqueImportedEmployees(
      (jobData.importedEmployees ?? []).map((employee) => ({
        employeeId: employee.employeeId,
        employeeNumber: employee.employeeNumber,
        providedDeviceEmployeeNumber: employee.deviceEmployeeNumber,
      })),
    );
    const totals = {
      requestedEmployees: candidates.length,
      employeesWithoutDeviceEmployeeNumber: 0,
      employeesWithoutAssignments: 0,
      deviceUserMismatches: 0,
      devicesProcessed: 0,
      devicesFailed: 0,
    };

    if (!candidates.length) {
      return {
        status: 'SKIPPED',
        scheduledFor: jobData.scheduledFor ?? null,
        totals,
      };
    }

    const employees = await this.employeeRepository.find({
      where: {
        id: In(candidates.map((candidate) => candidate.employeeId)),
      },
      select: ['id', 'employee_no', 'first_name', 'middle_name', 'last_name'],
    });
    const employeeById = new Map(
      employees.map((employee) => [employee.id, employee]),
    );
    const assignments = await this.assignmentRepository.find({
      where: {
        companyId: jobData.companyId,
        employeeId: In(candidates.map((candidate) => candidate.employeeId)),
      },
      relations: {
        device: true,
      },
    });

    const assignmentsByEmployeeId = new Map<
      number,
      EmployeeDeviceAssignment[]
    >();
    for (const assignment of assignments) {
      if (!assignment.employeeId) {
        continue;
      }
      const current = assignmentsByEmployeeId.get(assignment.employeeId) ?? [];
      current.push(assignment);
      assignmentsByEmployeeId.set(assignment.employeeId, current);
    }

    const deviceTargets = new Map<number, DeviceSyncTarget>();

    for (const candidate of candidates) {
      const employee = employeeById.get(candidate.employeeId) ?? null;
      const employeeNumber =
        candidate.employeeNumber?.trim() ||
        employee?.employee_no?.trim() ||
        null;
      const displayIdentifier =
        employeeNumber ?? `employee:${candidate.employeeId}`;
      const deviceEmployeeNumber =
        candidate.providedDeviceEmployeeNumber?.trim() || null;

      if (!deviceEmployeeNumber) {
        totals.employeesWithoutDeviceEmployeeNumber += 1;
        this.logger.warn(
          `Hikvision synchronization skipped for employee ${displayIdentifier}: device_employee_number was not provided during import.`,
        );
        continue;
      }

      const employeeAssignments =
        assignmentsByEmployeeId
          .get(candidate.employeeId)
          ?.filter((assignment) =>
            this.isEligibleHikvisionDevice(assignment.device),
          ) ?? [];

      if (!employeeAssignments.length) {
        totals.employeesWithoutAssignments += 1;
        this.logger.warn(
          `Hikvision synchronization skipped for employee ${displayIdentifier}: No access device assignment was found.`,
        );
        continue;
      }

      for (const assignment of employeeAssignments) {
        if (!assignment.deviceId) {
          continue;
        }

        const existing = deviceTargets.get(assignment.deviceId) ?? {
          companyId: jobData.companyId,
          deviceCode:
            assignment.device?.deviceCode ?? String(assignment.deviceId),
          requestedEmployeeNos: [],
          matchedTargets: [],
        };
        if (!existing.requestedEmployeeNos.includes(deviceEmployeeNumber)) {
          existing.requestedEmployeeNos.push(deviceEmployeeNumber);
        }
        existing.matchedTargets.push({
          employeeId: candidate.employeeId,
          employeeNumber,
          deviceEmployeeNumber,
        });
        deviceTargets.set(assignment.deviceId, existing);
      }
    }

    for (const [deviceId, deviceTarget] of deviceTargets.entries()) {
      try {
        await this.syncAccessControlStructures(jobData.companyId, deviceId);

        const foundEmployeeNos = new Set<string>();
        const requestedChunks = this.chunk(
          deviceTarget.requestedEmployeeNos,
          100,
        );

        for (const requestedEmployeeNos of requestedChunks) {
          const searchResult =
            await this.hikvisionUserManagementService.searchUsersOnDevice(
              jobData.companyId,
              deviceId,
              {
                employee_nos: requestedEmployeeNos,
                max_results: Math.max(
                  Math.min(requestedEmployeeNos.length, 100),
                  1,
                ),
                search_id: jobData.importBatchId ?? 'import_sync',
              },
            );
          for (const user of searchResult.users) {
            foundEmployeeNos.add(user.employee_no.trim());
          }
        }

        const matchedEmployeeNos = deviceTarget.requestedEmployeeNos.filter(
          (employeeNo) => foundEmployeeNos.has(employeeNo),
        );

        for (const target of deviceTarget.matchedTargets) {
          if (foundEmployeeNos.has(target.deviceEmployeeNumber!)) {
            continue;
          }

          totals.deviceUserMismatches += 1;
          this.logger.warn(
            `Hikvision synchronization skipped for employee ${target.employeeNumber ?? target.employeeId}: Device employee number ${target.deviceEmployeeNumber} was not found on device ${deviceTarget.deviceCode}.`,
          );
        }

        if (!matchedEmployeeNos.length) {
          continue;
        }

        const syncPageSize = Math.max(
          Math.min(matchedEmployeeNos.length, 100),
          1,
        );
        await this.hikvisionUserManagementService.syncUsersFromDeviceToBackend(
          jobData.companyId,
          deviceId,
          {
            employee_nos: matchedEmployeeNos,
            max_results: syncPageSize,
            max_pages: Math.max(
              Math.ceil(matchedEmployeeNos.length / syncPageSize),
              1,
            ),
            continue_on_error: true,
          },
        );
        await this.regenerateAccessGroups(jobData.companyId, deviceId);

        await this.hikvisionPeopleCredentialSyncService.syncAllFingerprintsForSyncedUsers(
          jobData.companyId,
          deviceId,
          matchedEmployeeNos.map((employeeNo) => ({
            assignmentId: 0,
            employeeId: null,
            employeeNo,
          })),
        );
        await this.hikvisionPeopleCredentialSyncService.syncCards(
          jobData.companyId,
          deviceId,
        );

        const attendanceStartTime =
          this.resolveExplicitAttendanceStartTime(jobData);
        if (attendanceStartTime) {
          const attendanceEndTime = new Date().toISOString();

          for (const employeeNo of matchedEmployeeNos) {
            try {
              await this.hikvisionAttendanceSyncService.syncAttendance(
                jobData.companyId,
                deviceId,
                attendanceStartTime,
                attendanceEndTime,
                employeeNo,
                100,
                jobData.requestedByCompanyUserId ?? null,
              );
            } catch (error) {
              this.logger.error(
                `Hikvision attendance synchronization failed for import batch ${jobData.importBatchId ?? 'unknown'}, device ${deviceTarget.deviceCode}, employee ${employeeNo}: ${(error as Error).message}`,
                error instanceof Error ? error.stack : undefined,
              );
            }
          }
        } else {
          await this.hikvisionAttendanceSyncService.syncLatestAttendanceWindow(
            jobData.companyId,
            deviceId,
          );
        }

        totals.devicesProcessed += 1;
      } catch (error) {
        totals.devicesFailed += 1;
        this.logger.error(
          `Hikvision synchronization failed for import batch ${jobData.importBatchId ?? 'unknown'} on device ${deviceTarget.deviceCode}: ${(error as Error).message}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    this.logger.log(
      `Hikvision import synchronization completed for batch ${jobData.importBatchId ?? 'unknown'}: requestedEmployees=${totals.requestedEmployees}, devicesProcessed=${totals.devicesProcessed}, devicesFailed=${totals.devicesFailed}, missingAssignments=${totals.employeesWithoutAssignments}, missingDeviceEmployeeNumbers=${totals.employeesWithoutDeviceEmployeeNumber}, mismatches=${totals.deviceUserMismatches}.`,
    );

    return {
      status: 'COMPLETED',
      scheduledFor: jobData.scheduledFor ?? null,
      totals,
    };
  }

  private uniqueImportedEmployees(
    employees: ImportedEmployeeSyncCandidate[] | undefined,
  ): ImportedEmployeeSyncCandidate[] {
    if (!employees?.length) {
      return [];
    }

    const unique = new Map<number, ImportedEmployeeSyncCandidate>();
    for (const employee of employees) {
      if (!employee || !Number.isInteger(employee.employeeId)) {
        continue;
      }

      unique.set(employee.employeeId, {
        employeeId: employee.employeeId,
        employeeNumber: employee.employeeNumber?.trim() || null,
        providedDeviceEmployeeNumber:
          employee.providedDeviceEmployeeNumber?.trim() || null,
      });
    }

    return [...unique.values()];
  }

  private toJobPayload(
    employee: ImportedEmployeeSyncCandidate,
  ): HikvisionImportedEmployeePayload {
    return {
      employeeId: employee.employeeId,
      employeeNumber: employee.employeeNumber?.trim() || null,
      deviceEmployeeNumber:
        employee.providedDeviceEmployeeNumber?.trim() || null,
    };
  }

  private async syncAccessControlStructures(
    companyId: number,
    deviceId: number,
  ): Promise<void> {
    try {
      await this.accessControlSyncService.syncDeviceDoors(companyId, deviceId);
      await this.accessControlSyncService.syncDeviceWeekPlans(
        companyId,
        deviceId,
      );
      await this.accessControlSyncService.syncDeviceTemplates(
        companyId,
        deviceId,
      );
    } catch (error) {
      this.logger.error(
        `Hikvision access-control metadata synchronization failed for device ${deviceId}: ${(error as Error).message}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async regenerateAccessGroups(
    companyId: number,
    deviceId: number,
  ): Promise<void> {
    try {
      await this.accessControlSyncService.generateVirtualGroups(
        companyId,
        deviceId,
      );
    } catch (error) {
      this.logger.error(
        `Hikvision virtual access-group generation failed for device ${deviceId}: ${(error as Error).message}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private isEligibleHikvisionDevice(
    device: AttendanceDevice | null | undefined,
  ) {
    if (!device) {
      return false;
    }

    const integrationType = device.integrationType?.trim().toLowerCase() ?? '';
    const vendorName = device.vendorName?.trim().toLowerCase() ?? '';

    return (
      device.status === AttendanceDeviceStatusEnum.ACTIVE &&
      device.syncMode === AttendanceDeviceSyncModeEnum.PULL &&
      (integrationType === 'hikvision' || vendorName.includes('hikvision'))
    );
  }

  private chunk(values: string[], size: number): string[][] {
    if (size <= 0 || values.length <= size) {
      return values.length > 0 ? [values] : [];
    }

    const chunks: string[][] = [];
    for (let index = 0; index < values.length; index += size) {
      chunks.push(values.slice(index, index + size));
    }

    return chunks;
  }

  private resolveNextScheduledRun(now: Date): ImportSyncSchedule {
    const startTime = process.env.HIKVISION_AUTO_SYNC_START_TIME?.trim() ?? '';
    if (!startTime) {
      return null;
    }

    const absoluteDateTime = this.parseAbsoluteDateTime(startTime);
    if (absoluteDateTime) {
      return {
        runAt:
          absoluteDateTime.getTime() > now.getTime()
            ? absoluteDateTime
            : new Date(now),
        timeZone:
          process.env.TZ?.trim() ||
          Intl.DateTimeFormat().resolvedOptions().timeZone ||
          'UTC',
        attendanceStartTime: startTime,
      };
    }

    const match = startTime.match(/^(\d{2}):(\d{2})$/);
    if (!match) {
      return null;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (
      !Number.isInteger(hours) ||
      !Number.isInteger(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null;
    }

    const timeZone =
      process.env.TZ?.trim() ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      'UTC';

    try {
      new Intl.DateTimeFormat('en-US', { timeZone }).format(now);
    } catch {
      return null;
    }

    const localParts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const year = localParts.find((part) => part.type === 'year')?.value;
    const month = localParts.find((part) => part.type === 'month')?.value;
    const day = localParts.find((part) => part.type === 'day')?.value;
    const currentHour = Number(
      localParts.find((part) => part.type === 'hour')?.value ?? '0',
    );
    const currentMinute = Number(
      localParts.find((part) => part.type === 'minute')?.value ?? '0',
    );

    if (!year || !month || !day) {
      return null;
    }

    const targetDate = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
    if (
      currentHour > hours ||
      (currentHour === hours && currentMinute >= minutes)
    ) {
      targetDate.setUTCDate(targetDate.getUTCDate() + 1);
    }

    const targetDateOnly = targetDate.toISOString().slice(0, 10);
    const offset = this.resolveOffsetForDate(timeZone, targetDateOnly);
    const runAt = new Date(
      `${targetDateOnly}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00${offset}`,
    );

    if (Number.isNaN(runAt.getTime())) {
      return null;
    }

    return {
      runAt,
      timeZone,
      attendanceStartTime: null,
    };
  }

  private resolveExplicitAttendanceStartTime(
    jobData: HikvisionSyncJobData,
  ): string | null {
    const value = jobData.attendanceStartTime?.trim() ?? '';
    return this.parseAbsoluteDateTime(value) ? value : null;
  }

  private parseAbsoluteDateTime(value: string): Date | null {
    if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private resolveOffsetForDate(timezone: string, date: string): string {
    const probe = new Date(`${date}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
    }).formatToParts(probe);
    const zonePart =
      parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT+00:00';
    const normalized = zonePart.replace('GMT', '').trim() || '+00:00';
    const match = normalized.match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);
    if (!match) {
      return '+00:00';
    }

    const sign = match[1];
    const hours = match[2].padStart(2, '0');
    const minutes = (match[3] || '00').padStart(2, '0');
    return `${sign}${hours}:${minutes}`;
  }
}
