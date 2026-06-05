import { createCipheriv, createHash, randomBytes } from 'crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { buildAttendanceDeviceSearchId } from '../access-control/attendance-devices/utils/attendance-device-search-id.util';
import { AccessDoor } from '../access-control/access-doors/entity/access-door.entity';
import { AccessScheduleTemplate } from '../access-control/access-schedule-templates/entity/access-schedule-template.entity';
import { EmployeeAccessCredential } from '../access-control/employee-access-credentials/entity/employee-access-credential.entity';
import { EmployeeAccessCredentialSourceEnum } from '../access-control/employee-access-credentials/enum/employee-access-credential-source.enum';
import { EmployeeAccessCredentialStatusEnum } from '../access-control/employee-access-credentials/enum/employee-access-credential-status.enum';
import { EmployeeAccessCredentialTypeEnum } from '../access-control/employee-access-credentials/enum/employee-access-credential-type.enum';
import { EmployeeDeviceAssignment } from '../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeDeviceAssignmentSyncStatusEnum } from '../access-control/employee-device-assignments/enum/employee-device-assignment-sync-status.enum';
import { EmployeeDeviceRightPlan } from '../access-control/employee-device-right-plans/entity/employee-device-right-plan.entity';
import { HikvisionSyncLog } from '../access-control/hikvision-sync-logs/entity/hikvision-sync-log.entity';
import { HikvisionSyncLogDirectionEnum } from '../access-control/hikvision-sync-logs/enum/hikvision-sync-log-direction.enum';
import { HikvisionSyncLogStatusEnum } from '../access-control/hikvision-sync-logs/enum/hikvision-sync-log-status.enum';
import { HikvisionSyncLogTypeEnum } from '../access-control/hikvision-sync-logs/enum/hikvision-sync-log-type.enum';
import { AttendanceDevice } from '../access-control/attendance-devices/entities/attendance-device.entity';
import { AttendanceDeviceStatusEnum } from '../access-control/attendance-devices/enums/attendance-device-status.enum';
import { EmployeeDeviceIdentity } from '../hr/attendance/processing/entities/employee-device-identity.entity';
import { Employee } from '../hr/employees/entities/employee.entity';
import { HikvisionAccessControlService } from './hikvision-access-control.service';

type PhaseCounters = {
  received: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

type SyncStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED';

type SyncedUserRef = {
  assignmentId: number;
  employeeId: number | null;
  employeeNo: string;
};

type NormalizedUser = {
  employeeNo: string;
  name: string | null;
  userType: string | null;
  passwordSet: boolean;
  validEnabled: boolean;
  validTimeType: string | null;
  validBeginTime: Date | null;
  validEndTime: Date | null;
  doorRight: string | null;
  localUiRight: boolean;
  closeDelayEnabled: boolean;
  maxOpenDoorTime: number;
  openDoorTime: number;
  userVerifyMode: string | null;
  rightPlans: Array<{ doorNo: number; templateNo: string; raw: Record<string, unknown> }>;
  raw: Record<string, unknown>;
};

type NormalizedCard = {
  employeeNo: string | null;
  cardNo: string;
  cardType: string | null;
  raw: Record<string, unknown>;
};

type NormalizedFingerprint = {
  employeeNo: string;
  fingerprintId: string;
  cardReaderNo: number | null;
  fingerType: string | null;
  leaderCard: string | null;
  fingerprintHash: string | null;
  raw: Record<string, unknown>;
};

type SyncUsersResult = {
  deviceId: number;
  users: PhaseCounters;
  status: SyncStatus;
  totalMatches: number;
  responseStatusStrg: string;
  syncedUsers: SyncedUserRef[];
  errorMessage?: string;
};

type SyncFingerprintsResult = {
  deviceId: number;
  fingerprints: PhaseCounters & { exportSupported: boolean };
  status: SyncStatus;
};

type SyncCardsResult = {
  deviceId: number;
  cards: PhaseCounters;
  status: SyncStatus;
  totalMatches: number;
  responseStatusStrg: string;
};

const DEFAULT_DEVICE_SYNC_PAGE_SIZE = 10;
const DEFAULT_DEVICE_SYNC_MAX_PAGES = 100;
const DEFAULT_CONTINUE_ON_ERROR = true;
const DEFAULT_FINGERPRINT_SLOT_START = 1;
const DEFAULT_FINGERPRINT_SLOT_END = 10;
const DEFAULT_FINGERPRINT_CARD_READER_NO = 1;

@Injectable()
export class HikvisionPeopleCredentialSyncService {
  private readonly logger = new Logger(HikvisionPeopleCredentialSyncService.name);

  constructor(
    @InjectRepository(AttendanceDevice)
    private readonly attendanceDeviceRepository: Repository<AttendanceDevice>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeDeviceIdentity)
    private readonly employeeDeviceIdentityRepository: Repository<EmployeeDeviceIdentity>,
    @InjectRepository(EmployeeDeviceAssignment)
    private readonly employeeDeviceAssignmentRepository: Repository<EmployeeDeviceAssignment>,
    @InjectRepository(EmployeeDeviceRightPlan)
    private readonly employeeDeviceRightPlanRepository: Repository<EmployeeDeviceRightPlan>,
    @InjectRepository(EmployeeAccessCredential)
    private readonly employeeAccessCredentialRepository: Repository<EmployeeAccessCredential>,
    @InjectRepository(AccessDoor)
    private readonly accessDoorRepository: Repository<AccessDoor>,
    @InjectRepository(AccessScheduleTemplate)
    private readonly accessScheduleTemplateRepository: Repository<AccessScheduleTemplate>,
    @InjectRepository(HikvisionSyncLog)
    private readonly hikvisionSyncLogRepository: Repository<HikvisionSyncLog>,
    private readonly hikvisionAccessControlService: HikvisionAccessControlService,
  ) {}

  async syncUsers(companyId: number, deviceId: number): Promise<SyncUsersResult> {
    const device = await this.findHikvisionDeviceOrFail(companyId, deviceId);
    const startedAt = new Date();
    const counters = this.createCounters();
    const syncedUsers: SyncedUserRef[] = [];
    const pageSize = DEFAULT_DEVICE_SYNC_PAGE_SIZE;
    const maxPages = DEFAULT_DEVICE_SYNC_MAX_PAGES;
    const continueOnError = DEFAULT_CONTINUE_ON_ERROR;
    const searchId = buildAttendanceDeviceSearchId('sync_users', device.id);
    let cursor = 0;
    let page = 0;
    let totalMatches = 0;
    let responseStatusStrg = 'OK';

    try {
      while (page < maxPages) {
        const payload = {
          UserInfoSearchCond: {
            searchID: searchId,
            searchResultPosition: cursor,
            maxResults: pageSize,
          },
        };
        const response = await this.requestWithRetry(`sync-users:${device.id}:${cursor}`, () =>
          this.hikvisionAccessControlService.searchUsers(companyId, device.id, payload),
        );
        this.ensureHikvisionSuccess('SyncUsers', response.parsed, response.status, response.ok);

        const parsedPage = this.parseUserSearchPage(response.parsed);
        responseStatusStrg = parsedPage.responseStatusStrg;
        totalMatches = Math.max(totalMatches, parsedPage.totalMatches);
        counters.received += parsedPage.rawUsers.length;

        for (const rawUser of parsedPage.rawUsers) {
          try {
            const user = this.normalizeUser(rawUser);
            const persisted = await this.persistUserFromDevice(companyId, device, user);
            syncedUsers.push(persisted);
            counters[persisted.status.toLowerCase() as 'created' | 'updated' | 'skipped'] += 1;
          } catch (error) {
            counters.failed += 1;
            const employeeNoForLog = this.toNullableString(rawUser.employeeNo) ?? 'unknown';
            this.logger.warn(
              `Failed to sync device user ${employeeNoForLog} from device ${device.id}: ${(error as Error).message}`,
            );
            if (!continueOnError) {
              throw error;
            }
          }
        }

        const nextCursor = cursor + parsedPage.numOfMatches;
        const shouldContinue = this.shouldContinuePagination(
          parsedPage.responseStatusStrg,
          cursor,
          parsedPage.numOfMatches,
          parsedPage.totalMatches,
        );

        if (!shouldContinue) {
          break;
        }

        if (parsedPage.numOfMatches <= 0) {
          throw new BadRequestException(
            'Hikvision returned more user pages but numOfMatches was 0',
          );
        }

        cursor = nextCursor;
        page += 1;
      }

      const status = this.derivePhaseStatus(counters);
      await this.persistSyncLogSafe({
        companyId,
        deviceId: device.id,
        syncType: HikvisionSyncLogTypeEnum.USERS,
        status,
        startedAt,
        counters,
        metadata: {
          total_matches: totalMatches,
          response_status: responseStatusStrg,
          synced_users: syncedUsers.map((user) => user.employeeNo),
        },
      });

      return {
        deviceId: device.id,
        users: counters,
        status,
        totalMatches,
        responseStatusStrg,
        syncedUsers,
      };
    } catch (error) {
      await this.persistSyncLogSafe({
        companyId,
        deviceId: device.id,
        syncType: HikvisionSyncLogTypeEnum.USERS,
        status: counters.received > 0 ? 'PARTIAL' : 'FAILED',
        startedAt,
        counters,
        errorMessage: (error as Error).message,
        metadata: {
          total_matches: totalMatches,
          response_status: responseStatusStrg,
        },
      });

      return {
        deviceId: device.id,
        users: counters,
        status: counters.received > 0 ? 'PARTIAL' : 'FAILED',
        totalMatches,
        responseStatusStrg,
        syncedUsers,
        errorMessage: (error as Error).message,
      };
    }
  }

  async syncUserRightPlans(
    companyId: number,
    deviceId: number,
    assignment: EmployeeDeviceAssignment,
    userInfo: NormalizedUser,
  ) {
    let changed = false;
    const existingPlans = await this.employeeDeviceRightPlanRepository.find({
      where: { employeeDeviceAssignmentId: assignment.id },
    });
    const existingMap = new Map(
      existingPlans.map((plan) => [
        this.buildRightPlanKey(plan.doorNo, plan.hikvisionTemplateNo),
        {
          current: plan,
          snapshot: this.cloneRightPlan(plan),
        },
      ]),
    );
    const activeKeys = new Set<string>();

    for (const plan of userInfo.rightPlans) {
      const key = this.buildRightPlanKey(plan.doorNo, plan.templateNo);
      activeKeys.add(key);

      const door = await this.accessDoorRepository.findOne({
        where: { companyId, deviceId, doorNo: plan.doorNo },
      });
      const scheduleTemplate = await this.accessScheduleTemplateRepository.findOne({
        where: { companyId, deviceId, hikvisionTemplateNo: plan.templateNo },
      });

      const existingEntry = existingMap.get(key) ?? null;
      const existing = existingEntry?.current ?? null;
      const metadata = this.mergeMetadata(existing?.metadata ?? null, {
        hikvision: {
          source: 'DEVICE_SYNC',
          raw_right_plan: this.maskSensitivePayload(plan.raw),
        },
      });

      const draft = existing
        ? existing
        : this.employeeDeviceRightPlanRepository.create({
            employeeDeviceAssignmentId: assignment.id,
            employeeNo: assignment.employeeNo,
            deviceId,
            doorNo: plan.doorNo,
            hikvisionTemplateNo: plan.templateNo,
          });

      draft.employeeDeviceAssignmentId = assignment.id;
      draft.employeeNo = assignment.employeeNo;
      draft.deviceId = deviceId;
      draft.doorId = door?.id ?? null;
      draft.doorNo = plan.doorNo;
      draft.scheduleTemplateId = scheduleTemplate?.id ?? null;
      draft.hikvisionTemplateNo = plan.templateNo;
      draft.isActive = true;
      draft.metadata = metadata;

      if (!existing || this.hasRightPlanChanged(existingEntry!.snapshot, draft)) {
        await this.employeeDeviceRightPlanRepository.save(draft);
        changed = true;
      }
    }

    for (const existing of existingPlans) {
      const key = this.buildRightPlanKey(existing.doorNo, existing.hikvisionTemplateNo);
      if (activeKeys.has(key) || !existing.isActive) {
        continue;
      }

      existing.isActive = false;
      existing.metadata = this.mergeMetadata(existing.metadata, {
        hikvision: {
          source: 'DEVICE_SYNC',
          sync_status: 'REMOVED',
        },
      });
      await this.employeeDeviceRightPlanRepository.save(existing);
      changed = true;
    }

    return changed;
  }

  async syncUserFingerprints(
    companyId: number,
    deviceId: number,
    employeeNo: string,
  ): Promise<SyncFingerprintsResult> {
    const device = await this.findHikvisionDeviceOrFail(companyId, deviceId);
    const counters = this.createCounters();
    const startedAt = new Date();
    const normalizedEmployeeNo = this.normalizeEmployeeNo(employeeNo);
    let exportSupported = true;

    try {
      const fingerprintsByKey = new Map<string, NormalizedFingerprint>();

      for (
        let fingerprintSlot = DEFAULT_FINGERPRINT_SLOT_START;
        fingerprintSlot <= DEFAULT_FINGERPRINT_SLOT_END;
        fingerprintSlot += 1
      ) {
        const payload = {
          FingerPrintCond: {
            searchID: buildAttendanceDeviceSearchId(
              'fp',
              device.id,
              normalizedEmployeeNo,
              String(fingerprintSlot),
            ),
            employeeNo: normalizedEmployeeNo,
            cardReaderNo: DEFAULT_FINGERPRINT_CARD_READER_NO,
            fingerPrintID: fingerprintSlot,
          },
        };
        try {
          const response = await this.requestWithRetry(
            `sync-fingerprint:${device.id}:${normalizedEmployeeNo}:${fingerprintSlot}`,
            () => this.hikvisionAccessControlService.uploadFingerprint(companyId, device.id, payload),
          );

          const failureReason = this.extractHikvisionFailureReason(response.parsed);
          if (!response.ok || failureReason) {
            if (this.isNotSupportFailure(response.parsed, failureReason)) {
              exportSupported = false;
              await this.persistSyncLogSafe({
                companyId,
                deviceId: device.id,
                syncType: HikvisionSyncLogTypeEnum.FINGERPRINTS,
                status: 'SUCCESS',
                startedAt,
                counters,
                metadata: {
                  employee_no: normalizedEmployeeNo,
                  fingerprint_export_supported: false,
                },
              });
              return {
                deviceId: device.id,
                fingerprints: {
                  ...counters,
                  exportSupported: false,
                },
                status: 'SUCCESS',
              };
            }

            if (this.isFingerprintSlotEmptyFailure(response.parsed, failureReason)) {
              continue;
            }

            throw new BadRequestException(
              `SyncUserFingerprints failed for slot ${fingerprintSlot} with HTTP ${response.status}${failureReason ? `: ${failureReason}` : ''}`,
            );
          }

          const slotFingerprints = this.parseFingerprintResponse(
            response.parsed,
            normalizedEmployeeNo,
            DEFAULT_FINGERPRINT_CARD_READER_NO,
          );
          for (const fingerprint of slotFingerprints) {
            fingerprintsByKey.set(
              this.buildFingerprintCredentialKey(
                fingerprint.employeeNo,
                fingerprint.fingerprintId,
                fingerprint.cardReaderNo,
              ),
              fingerprint,
            );
          }
        } catch (error) {
          counters.failed += 1;
          this.logger.warn(
            `Failed to sync fingerprint slot ${fingerprintSlot} for ${normalizedEmployeeNo} on device ${device.id}: ${(error as Error).message}`,
          );
        }
      }

      const fingerprints = [...fingerprintsByKey.values()];
      counters.received = fingerprints.length;

      for (const fingerprint of fingerprints) {
        try {
          const status = await this.upsertFingerprintCredential(companyId, device.id, fingerprint);
          counters[status.toLowerCase() as 'created' | 'updated' | 'skipped'] += 1;
        } catch (error) {
          counters.failed += 1;
          this.logger.warn(
            `Failed to sync fingerprint ${fingerprint.fingerprintId} for ${fingerprint.employeeNo} on device ${device.id}: ${(error as Error).message}`,
          );
        }
      }

      const status = this.derivePhaseStatus(counters);
      await this.persistSyncLogSafe({
        companyId,
        deviceId: device.id,
        syncType: HikvisionSyncLogTypeEnum.FINGERPRINTS,
        status,
        startedAt,
        counters,
        metadata: {
          employee_no: normalizedEmployeeNo,
          fingerprint_export_supported: exportSupported,
        },
      });

      return {
        deviceId: device.id,
        fingerprints: {
          ...counters,
          exportSupported,
        },
        status,
      };
    } catch (error) {
      await this.persistSyncLogSafe({
        companyId,
        deviceId: device.id,
        syncType: HikvisionSyncLogTypeEnum.FINGERPRINTS,
        status: counters.received > 0 ? 'PARTIAL' : 'FAILED',
        startedAt,
        counters,
        errorMessage: (error as Error).message,
        metadata: {
          employee_no: normalizedEmployeeNo,
          fingerprint_export_supported: exportSupported,
        },
      });

      return {
        deviceId: device.id,
        fingerprints: {
          ...counters,
          exportSupported,
        },
        status: counters.received > 0 ? 'PARTIAL' : 'FAILED',
      };
    }
  }

  async syncAllFingerprintsForSyncedUsers(
    companyId: number,
    deviceId: number,
    users?: SyncedUserRef[],
  ): Promise<SyncFingerprintsResult> {
    const candidates = users?.length
      ? users
      : await this.employeeDeviceAssignmentRepository.find({
          where: {
            companyId,
            deviceId,
            syncStatus: EmployeeDeviceAssignmentSyncStatusEnum.SYNCED,
          },
          select: ['id', 'employeeId', 'employeeNo'],
        }).then((rows) =>
          rows.map((row) => ({
            assignmentId: row.id,
            employeeId: row.employeeId,
            employeeNo: row.employeeNo,
          })),
        );

    const aggregate = this.createCounters();
    let exportSupported = true;
    for (const user of candidates) {
      const result = await this.syncUserFingerprints(companyId, deviceId, user.employeeNo);
      aggregate.received += result.fingerprints.received;
      aggregate.created += result.fingerprints.created;
      aggregate.updated += result.fingerprints.updated;
      aggregate.skipped += result.fingerprints.skipped;
      aggregate.failed += result.fingerprints.failed;
      exportSupported = exportSupported && result.fingerprints.exportSupported;
    }

    return {
      deviceId,
      fingerprints: {
        ...aggregate,
        exportSupported,
      },
      status: this.derivePhaseStatus(aggregate),
    };
  }

  async syncCards(companyId: number, deviceId: number): Promise<SyncCardsResult> {
    const device = await this.findHikvisionDeviceOrFail(companyId, deviceId);
    const startedAt = new Date();
    const counters = this.createCounters();
    const pageSize = DEFAULT_DEVICE_SYNC_PAGE_SIZE;
    const maxPages = DEFAULT_DEVICE_SYNC_MAX_PAGES;
    const searchId = buildAttendanceDeviceSearchId('sync_cards', device.id);
    let cursor = 0;
    let page = 0;
    let totalMatches = 0;
    let responseStatusStrg = 'OK';

    try {
      while (page < maxPages) {
        const payload = {
          CardInfoSearchCond: {
            searchID: searchId,
            searchResultPosition: cursor,
            maxResults: pageSize,
          },
        };
        const response = await this.requestWithRetry(`sync-cards:${device.id}:${cursor}`, () =>
          this.hikvisionAccessControlService.searchCards(companyId, device.id, payload),
        );
        this.ensureHikvisionSuccess('SyncCards', response.parsed, response.status, response.ok);

        const parsedPage = this.parseCardSearchPage(response.parsed);
        responseStatusStrg = parsedPage.responseStatusStrg;
        totalMatches = Math.max(totalMatches, parsedPage.totalMatches);
        counters.received += parsedPage.cards.length;

        for (const card of parsedPage.cards) {
          try {
            const status = await this.upsertCardCredential(companyId, device.id, card);
            counters[status.toLowerCase() as 'created' | 'updated' | 'skipped'] += 1;
          } catch (error) {
            counters.failed += 1;
            this.logger.warn(
              `Failed to sync card ${this.maskValue(card.cardNo)} on device ${device.id}: ${(error as Error).message}`,
            );
          }
        }

        const nextCursor = cursor + parsedPage.numOfMatches;
        const shouldContinue = this.shouldContinuePagination(
          parsedPage.responseStatusStrg,
          cursor,
          parsedPage.numOfMatches,
          parsedPage.totalMatches,
        );

        if (!shouldContinue) {
          break;
        }

        if (parsedPage.numOfMatches <= 0) {
          throw new BadRequestException(
            'Hikvision returned more card pages but numOfMatches was 0',
          );
        }

        cursor = nextCursor;
        page += 1;
      }

      const status = this.derivePhaseStatus(counters);
      await this.persistSyncLogSafe({
        companyId,
        deviceId: device.id,
        syncType: HikvisionSyncLogTypeEnum.CARDS,
        status,
        startedAt,
        counters,
        metadata: {
          total_matches: totalMatches,
          response_status: responseStatusStrg,
        },
      });

      return {
        deviceId: device.id,
        cards: counters,
        status,
        totalMatches,
        responseStatusStrg,
      };
    } catch (error) {
      await this.persistSyncLogSafe({
        companyId,
        deviceId: device.id,
        syncType: HikvisionSyncLogTypeEnum.CARDS,
        status: counters.received > 0 ? 'PARTIAL' : 'FAILED',
        startedAt,
        counters,
        errorMessage: (error as Error).message,
        metadata: {
          total_matches: totalMatches,
          response_status: responseStatusStrg,
        },
      });

      return {
        deviceId: device.id,
        cards: counters,
        status: counters.received > 0 ? 'PARTIAL' : 'FAILED',
        totalMatches,
        responseStatusStrg,
      };
    }
  }

  async syncUsersFingerprintsAndCards(
    companyId: number,
    deviceId: number,
  ) {
    const startedAt = new Date();
    const device = await this.findHikvisionDeviceOrFail(companyId, deviceId);
    const users = await this.syncUsers(companyId, device.id);
    const zeroFingerprints: SyncFingerprintsResult = {
      deviceId: device.id,
      fingerprints: {
        ...this.createCounters(),
        exportSupported: true,
      },
      status: users.status === 'FAILED' ? 'FAILED' : 'SUCCESS',
    };
    const zeroCards: SyncCardsResult = {
      deviceId: device.id,
      cards: this.createCounters(),
      status: users.status === 'FAILED' ? 'FAILED' : 'SUCCESS',
      totalMatches: 0,
      responseStatusStrg: 'OK',
    };

    let fingerprints = zeroFingerprints;
    let cards = zeroCards;
    if (users.status !== 'FAILED') {
      fingerprints = await this.syncAllFingerprintsForSyncedUsers(
        companyId,
        device.id,
        users.syncedUsers,
      );
      cards = await this.syncCards(companyId, device.id);
    }

    const overallStatus = this.deriveOverallStatus([users.status, fingerprints.status, cards.status]);
    await this.persistSyncLogSafe({
      companyId,
      deviceId: device.id,
      syncType: HikvisionSyncLogTypeEnum.FULL,
      status: overallStatus,
      startedAt,
      counters: {
        received: users.users.received + fingerprints.fingerprints.received + cards.cards.received,
        created: users.users.created + fingerprints.fingerprints.created + cards.cards.created,
        updated: users.users.updated + fingerprints.fingerprints.updated + cards.cards.updated,
        skipped: users.users.skipped + fingerprints.fingerprints.skipped + cards.cards.skipped,
        failed: users.users.failed + fingerprints.fingerprints.failed + cards.cards.failed,
      },
      metadata: {
        users: users.users,
        fingerprints: fingerprints.fingerprints,
        cards: cards.cards,
      },
    });

    return {
      deviceId: device.id,
      users: users.users,
      fingerprints: fingerprints.fingerprints,
      cards: cards.cards,
      status: overallStatus,
    };
  }

  private async persistUserFromDevice(
    companyId: number,
    device: AttendanceDevice,
    user: NormalizedUser,
  ): Promise<SyncedUserRef & { status: 'CREATED' | 'UPDATED' | 'SKIPPED' }> {
    const employee = await this.findEmployeeByDeviceEmployeeNo(companyId, device.id, user.employeeNo);
    const existingByEmployee = employee?.id
      ? await this.employeeDeviceAssignmentRepository.findOne({
          where: { companyId, deviceId: device.id, employeeId: employee.id },
        })
      : null;
    const existing =
      existingByEmployee
      ?? (await this.employeeDeviceAssignmentRepository.findOne({
        where: { companyId, deviceId: device.id, employeeNo: user.employeeNo },
      }));
    const existingSnapshot = existing ? this.cloneAssignment(existing) : null;

    const sanitizedRawUser = this.sanitizeUserInfo(user.raw);
    const draft = existing
      ? existing
      : this.employeeDeviceAssignmentRepository.create({
          companyId,
          employeeId: employee?.id ?? null,
          employeeNo: user.employeeNo,
          employeeName: user.name,
          deviceId: device.id,
        });
    draft.companyId = companyId;
    draft.employeeId = employee?.id ?? existing?.employeeId ?? null;
    draft.employeeNo = user.employeeNo;
    draft.employeeName = user.name ?? existing?.employeeName ?? null;
    draft.deviceId = device.id;
    draft.hikvisionUserType = user.userType;
    draft.userVerifyMode = user.userVerifyMode;
    draft.validEnabled = user.validEnabled;
    draft.validBeginTime = user.validBeginTime;
    draft.validEndTime = user.validEndTime;
    draft.doorRight = user.doorRight;
    draft.localUiRight = user.localUiRight;
    draft.closeDelayEnabled = user.closeDelayEnabled;
    draft.maxOpenDoorTime = user.maxOpenDoorTime;
    draft.openDoorTime = user.openDoorTime;
    draft.syncStatus = EmployeeDeviceAssignmentSyncStatusEnum.SYNCED;
    draft.metadata = this.mergeMetadata(existing?.metadata ?? null, {
      hikvision: {
        source: 'DEVICE_SYNC',
        device_name: user.name,
        valid_time_type: user.validTimeType,
        password_set: user.passwordSet,
        raw_user_info: sanitizedRawUser,
      },
    });

    let status: 'CREATED' | 'UPDATED' | 'SKIPPED' = 'SKIPPED';
    if (!existing) {
      draft.lastSyncedAt = new Date();
      await this.employeeDeviceAssignmentRepository.save(draft);
      status = 'CREATED';
    } else if (this.hasAssignmentChanged(existingSnapshot!, draft)) {
      draft.lastSyncedAt = new Date();
      await this.employeeDeviceAssignmentRepository.save(draft);
      status = 'UPDATED';
    }

    const rightPlanChanged = await this.syncUserRightPlans(companyId, device.id, draft, user);
    const passwordChanged = await this.upsertPasswordCredential(
      companyId,
      device.id,
      user,
      employee?.id ?? null,
    );
    if (status === 'SKIPPED' && (rightPlanChanged || passwordChanged)) {
      status = 'UPDATED';
    }
    if (employee?.id) {
      await this.upsertDeviceIdentity(companyId, employee.id, user.employeeNo, device.id);
    }

    return {
      assignmentId: draft.id,
      employeeId: draft.employeeId ?? null,
      employeeNo: draft.employeeNo,
      status,
    };
  }

  private async upsertPasswordCredential(
    companyId: number,
    deviceId: number,
    user: NormalizedUser,
    employeeId: number | null,
  ) {
    const existing = await this.employeeAccessCredentialRepository.findOne({
      where: {
        companyId,
        deviceId,
        employeeNo: user.employeeNo,
        credentialType: EmployeeAccessCredentialTypeEnum.PASSWORD,
      },
    });
    const existingSnapshot = existing ? this.cloneCredential(existing) : null;

    if (!existing && !user.passwordSet) {
      return false;
    }

    const draft = existing
      ? existing
      : this.employeeAccessCredentialRepository.create({
          companyId,
          employeeNo: user.employeeNo,
          deviceId,
          credentialType: EmployeeAccessCredentialTypeEnum.PASSWORD,
          credentialNo: user.employeeNo,
        });

    draft.companyId = companyId;
    draft.employeeId = employeeId;
    draft.employeeNo = user.employeeNo;
    draft.deviceId = deviceId;
    draft.credentialType = EmployeeAccessCredentialTypeEnum.PASSWORD;
    draft.credentialNo = user.employeeNo;
    draft.passwordSet = user.passwordSet;
    draft.pinPassword = null;
    draft.source = EmployeeAccessCredentialSourceEnum.DEVICE_SYNC;
    draft.credentialStatus = user.passwordSet
      ? EmployeeAccessCredentialStatusEnum.ACTIVE
      : EmployeeAccessCredentialStatusEnum.INACTIVE;
    draft.lastSyncedAt = user.passwordSet || existing ? new Date() : null;
    draft.metadata = this.mergeMetadata(existing?.metadata ?? null, {
      source: 'USER_INFO',
      hikvision: {
        password_set: user.passwordSet,
      },
    });

    if (!existing || this.hasCredentialChanged(existingSnapshot!, draft)) {
      await this.employeeAccessCredentialRepository.save(draft);
      return true;
    }

    return false;
  }

  private async upsertFingerprintCredential(
    companyId: number,
    deviceId: number,
    fingerprint: NormalizedFingerprint,
  ): Promise<'CREATED' | 'UPDATED' | 'SKIPPED'> {
    const employee = await this.findEmployeeByDeviceEmployeeNo(
      companyId,
      deviceId,
      fingerprint.employeeNo,
    );
    const fingerprintQuery = this.employeeAccessCredentialRepository
      .createQueryBuilder('credential')
      .where('credential.company_id = :companyId', { companyId })
      .andWhere('credential.device_id = :deviceId', { deviceId })
      .andWhere('credential.employee_no = :employeeNo', {
        employeeNo: fingerprint.employeeNo,
      })
      .andWhere('credential.credential_type = :credentialType', {
        credentialType: EmployeeAccessCredentialTypeEnum.FINGERPRINT,
      })
      .andWhere('credential.fingerprint_id = :fingerprintId', {
        fingerprintId: fingerprint.fingerprintId,
      });

    if (fingerprint.cardReaderNo === null) {
      fingerprintQuery.andWhere('credential.card_reader_no IS NULL');
    } else {
      fingerprintQuery.andWhere('credential.card_reader_no = :cardReaderNo', {
        cardReaderNo: fingerprint.cardReaderNo,
      });
    }

    const existing = await fingerprintQuery.getOne();
    const existingSnapshot = existing ? this.cloneCredential(existing) : null;
    const existingMetadata = this.toObject(existing?.metadata);
    const existingHikvisionMetadata = this.toObject(existingMetadata.hikvision);
    const encryptedFingerprintTemplate = this.buildStoredEncryptedFingerprintTemplate(
      this.toNullableString(fingerprint.raw.fingerData ?? fingerprint.raw.fingerprintData),
      this.toNullableString(existingHikvisionMetadata.fingerprint_hash) === fingerprint.fingerprintHash
        ? existingHikvisionMetadata.encrypted_fingerprint_template
        : null,
    );
    const draft = existing
      ? existing
      : this.employeeAccessCredentialRepository.create({
          companyId,
          employeeNo: fingerprint.employeeNo,
          deviceId,
          credentialType: EmployeeAccessCredentialTypeEnum.FINGERPRINT,
        });

    draft.companyId = companyId;
    draft.employeeId = employee?.id ?? existing?.employeeId ?? null;
    draft.employeeNo = fingerprint.employeeNo;
    draft.deviceId = deviceId;
    draft.credentialType = EmployeeAccessCredentialTypeEnum.FINGERPRINT;
    draft.credentialNo = `${fingerprint.fingerprintId}:${fingerprint.cardReaderNo ?? 0}`;
    draft.cardNo = null;
    draft.fingerprintId = fingerprint.fingerprintId;
    draft.cardReaderNo = fingerprint.cardReaderNo;
    draft.passwordSet = false;
    draft.hasFingerprint = true;
    draft.fingerprintCount = 1;
    draft.source = EmployeeAccessCredentialSourceEnum.DEVICE_SYNC;
    draft.credentialStatus = EmployeeAccessCredentialStatusEnum.ACTIVE;
    draft.lastSyncedAt = new Date();
    draft.metadata = this.mergeMetadata(existing?.metadata ?? null, {
      hikvision: {
        source: 'DEVICE_SYNC',
        finger_type: fingerprint.fingerType,
        leader_card: fingerprint.leaderCard,
        fingerprint_hash: fingerprint.fingerprintHash,
        encrypted_fingerprint_template: encryptedFingerprintTemplate,
        raw_fingerprint: this.sanitizeFingerprintRawPayload(fingerprint.raw),
        fingerprint_export_supported: true,
        fingerprint_storage: this.resolveFingerprintStorageMode(fingerprint.raw, encryptedFingerprintTemplate),
      },
    });

    if (!existing) {
      await this.employeeAccessCredentialRepository.save(draft);
      return 'CREATED';
    }

    if (this.hasCredentialChanged(existingSnapshot!, draft)) {
      await this.employeeAccessCredentialRepository.save(draft);
      return 'UPDATED';
    }

    return 'SKIPPED';
  }

  private async upsertCardCredential(
    companyId: number,
    deviceId: number,
    card: NormalizedCard,
  ): Promise<'CREATED' | 'UPDATED' | 'SKIPPED'> {
    const employee = card.employeeNo
      ? await this.findEmployeeByDeviceEmployeeNo(companyId, deviceId, card.employeeNo)
      : null;
    const existing = await this.employeeAccessCredentialRepository.findOne({
      where: {
        companyId,
        deviceId,
        credentialType: EmployeeAccessCredentialTypeEnum.CARD,
        cardNo: card.cardNo,
      },
    });
    const existingSnapshot = existing ? this.cloneCredential(existing) : null;
    const draft = existing
      ? existing
      : this.employeeAccessCredentialRepository.create({
          companyId,
          employeeNo: card.employeeNo ?? `card:${card.cardNo}`,
          deviceId,
          credentialType: EmployeeAccessCredentialTypeEnum.CARD,
        });

    draft.companyId = companyId;
    draft.employeeId = employee?.id ?? null;
    draft.employeeNo = card.employeeNo ?? existing?.employeeNo ?? `card:${card.cardNo}`;
    draft.deviceId = deviceId;
    draft.credentialType = EmployeeAccessCredentialTypeEnum.CARD;
    draft.credentialNo = card.cardNo;
    draft.cardNo = card.cardNo;
    draft.source = EmployeeAccessCredentialSourceEnum.DEVICE_SYNC;
    draft.credentialStatus = EmployeeAccessCredentialStatusEnum.ACTIVE;
    draft.lastSyncedAt = new Date();
    draft.metadata = this.mergeMetadata(existing?.metadata ?? null, {
      hikvision: {
        source: 'DEVICE_SYNC',
        card_type: card.cardType,
        raw_card: this.maskSensitivePayload(card.raw),
      },
    });

    if (!existing) {
      await this.employeeAccessCredentialRepository.save(draft);
      return 'CREATED';
    }

    if (this.hasCredentialChanged(existingSnapshot!, draft)) {
      await this.employeeAccessCredentialRepository.save(draft);
      return 'UPDATED';
    }

    return 'SKIPPED';
  }

  private parseUserSearchPage(payload: Record<string, unknown> | string) {
    const root = this.toObject(
      this.toObject(payload).UserInfoSearch
      ?? this.toObject(payload).UserInfoSearchResult
      ?? payload,
    );
    const rawUsers = root.UserInfo ?? root.UserInfoList ?? root.userInfoList ?? [];
    const normalizedRawUsers = this.toObjectArray(rawUsers);

    return {
      responseStatusStrg: this.toNullableString(root.responseStatusStrg)
        ?? this.toNullableString(root.responseStatus)
        ?? 'OK',
      totalMatches: this.toNullableNumber(root.totalMatches) ?? normalizedRawUsers.length,
      numOfMatches: this.toNullableNumber(root.numOfMatches) ?? normalizedRawUsers.length,
      rawUsers: normalizedRawUsers,
    };
  }

  private parseCardSearchPage(payload: Record<string, unknown> | string) {
    const root = this.toObject(
      this.toObject(payload).CardInfoSearch
      ?? this.toObject(payload).CardInfoSearchResult
      ?? payload,
    );
    const rawCards = root.CardInfo ?? root.CardInfoList ?? root.cardInfoList ?? [];
    const cards = this.toObjectArray(rawCards).map((card) => this.normalizeCard(card));

    return {
      responseStatusStrg: this.toNullableString(root.responseStatusStrg)
        ?? this.toNullableString(root.responseStatus)
        ?? 'OK',
      totalMatches: this.toNullableNumber(root.totalMatches) ?? cards.length,
      numOfMatches: this.toNullableNumber(root.numOfMatches) ?? cards.length,
      cards,
    };
  }

  private parseFingerprintResponse(
    payload: Record<string, unknown> | string,
    employeeNo: string,
    defaultCardReaderNo: number | null = null,
  ): NormalizedFingerprint[] {
    const root = this.toObject(
      this.toObject(payload).FingerPrintInfoSearch
      ?? this.toObject(payload).FingerPrintUpload
      ?? this.toObject(payload).FingerPrintInfo
      ?? payload,
    );
    const directList = this.toObjectArray(root.FingerPrintList ?? root.FingerPrintInfoList ?? []);
    const rawItems =
      directList.length > 0
        ? directList
        : this.toObjectArray(root.FingerPrintInfo ?? root.FingerPrintList ?? []);

    return rawItems
      .map((item) => this.normalizeFingerprint(item, employeeNo, defaultCardReaderNo))
      .filter((item): item is NormalizedFingerprint => Boolean(item));
  }

  private normalizeUser(raw: Record<string, unknown>): NormalizedUser {
    const valid = this.toObject(raw.Valid ?? raw.valid);
    const rightPlanList: Array<{ doorNo: number; templateNo: string; raw: Record<string, unknown> }> = [];
    for (const plan of this.toObjectArray(raw.RightPlan ?? raw.rightPlan)) {
      const doorNo = this.toNullableNumber(plan.doorNo);
      const templateNo = this.toNullableString(plan.planTemplateNo);
      if (doorNo === null || !templateNo) {
        this.logger.warn(
          `Skipping invalid Hikvision RightPlan payload for user ${this.toNullableString(raw.employeeNo) ?? 'unknown'}`,
        );
        continue;
      }

      rightPlanList.push({
        doorNo,
        templateNo,
        raw: this.toObject(plan),
      });
    }

    return {
      employeeNo: this.normalizeEmployeeNo(raw.employeeNo),
      name: this.toNullableString(raw.name),
      userType: this.toNullableString(raw.userType),
      passwordSet: this.toNullableString(raw.password) !== null,
      validEnabled: this.toBoolean(rawOr(valid.enable, true)),
      validTimeType: this.toNullableString(valid.timeType),
      validBeginTime: this.toNullableDate(valid.beginTime),
      validEndTime: this.toNullableDate(valid.endTime),
      doorRight: this.normalizeDoorRight(raw.doorRight),
      localUiRight: this.toBoolean(raw.localUIRight),
      closeDelayEnabled: this.toBoolean(raw.closeDelayEnabled),
      maxOpenDoorTime: this.toNullableNumber(raw.maxOpenDoorTime) ?? 0,
      openDoorTime: this.toNullableNumber(raw.openDoorTime) ?? 0,
      userVerifyMode: this.toNullableString(raw.userVerifyMode),
      rightPlans: rightPlanList,
      raw: this.toObject(raw),
    };
  }

  private normalizeCard(raw: Record<string, unknown>): NormalizedCard {
    const cardNo = this.toNullableString(raw.cardNo);
    if (!cardNo) {
      throw new BadRequestException('Hikvision card payload is missing cardNo');
    }

    return {
      employeeNo: this.toNullableString(raw.employeeNo),
      cardNo,
      cardType: this.toNullableString(raw.cardType),
      raw: this.toObject(raw),
    };
  }

  private normalizeFingerprint(
    raw: Record<string, unknown>,
    fallbackEmployeeNo: string,
    fallbackCardReaderNo: number | null = null,
  ): NormalizedFingerprint | null {
    const fingerprintId = this.toNullableString(raw.fingerPrintID ?? raw.fingerprintId);
    if (!fingerprintId) {
      return null;
    }

    const employeeNo = this.normalizeEmployeeNo(raw.employeeNo ?? fallbackEmployeeNo);
    const fingerData = this.toNullableString(raw.fingerData ?? raw.fingerprintData);
    return {
      employeeNo,
      fingerprintId,
      cardReaderNo: this.toNullableNumber(raw.cardReaderNo) ?? fallbackCardReaderNo,
      fingerType: this.toNullableString(raw.fingerType),
      leaderCard: this.toNullableString(raw.leaderCard),
      fingerprintHash: fingerData ? createHash('sha256').update(fingerData).digest('hex') : null,
      raw: this.toObject(raw),
    };
  }

  private async findEmployeeByDeviceEmployeeNo(
    companyId: number,
    deviceId: number,
    employeeNo: string,
  ): Promise<Employee | null> {
    const normalizedEmployeeNo = this.normalizeEmployeeNo(employeeNo);
    const identity = await this.employeeDeviceIdentityRepository.findOne({
      where: {
        companyId,
        deviceId,
        employeeNo: normalizedEmployeeNo,
        isActive: true,
      },
      relations: {
        employee: true,
      },
    });
    if (identity?.employee) {
      return identity.employee;
    }

    const assignment = await this.employeeDeviceAssignmentRepository.findOne({
      where: {
        companyId,
        deviceId,
        employeeNo: normalizedEmployeeNo,
      },
      relations: {
        employee: true,
      },
    });
    if (assignment?.employee) {
      return assignment.employee;
    }

    return null;
  }

  private async upsertDeviceIdentity(
    companyId: number,
    employeeId: number,
    employeeNo: string,
    deviceId: number,
  ) {
    const normalizedEmployeeNo = this.normalizeEmployeeNo(employeeNo);
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

    identity.metadata = this.mergeMetadata(identity.metadata, {
      hikvision: {
        source: 'DEVICE_SYNC',
      },
    });
    await this.employeeDeviceIdentityRepository.save(identity);
  }

  private cloneAssignment(
    assignment: EmployeeDeviceAssignment,
  ): EmployeeDeviceAssignment {
    return this.employeeDeviceAssignmentRepository.create({
      ...assignment,
      validBeginTime: assignment.validBeginTime ? new Date(assignment.validBeginTime) : null,
      validEndTime: assignment.validEndTime ? new Date(assignment.validEndTime) : null,
      lastSyncedAt: assignment.lastSyncedAt ? new Date(assignment.lastSyncedAt) : null,
      metadata: assignment.metadata ? JSON.parse(JSON.stringify(assignment.metadata)) : null,
    });
  }

  private cloneRightPlan(plan: EmployeeDeviceRightPlan): EmployeeDeviceRightPlan {
    return this.employeeDeviceRightPlanRepository.create({
      ...plan,
      metadata: plan.metadata ? JSON.parse(JSON.stringify(plan.metadata)) : null,
    });
  }

  private cloneCredential(
    credential: EmployeeAccessCredential,
  ): EmployeeAccessCredential {
    return this.employeeAccessCredentialRepository.create({
      ...credential,
      lastSyncedAt: credential.lastSyncedAt ? new Date(credential.lastSyncedAt) : null,
      metadata: credential.metadata ? JSON.parse(JSON.stringify(credential.metadata)) : null,
    });
  }

  private hasAssignmentChanged(existing: EmployeeDeviceAssignment, next: EmployeeDeviceAssignment): boolean {
    return (
      existing.companyId !== next.companyId
      || existing.employeeId !== next.employeeId
      || existing.employeeNo !== next.employeeNo
      || existing.employeeName !== next.employeeName
      || existing.deviceId !== next.deviceId
      || existing.hikvisionUserType !== next.hikvisionUserType
      || existing.userVerifyMode !== next.userVerifyMode
      || !this.sameDate(existing.validBeginTime, next.validBeginTime)
      || !this.sameDate(existing.validEndTime, next.validEndTime)
      || existing.validEnabled !== next.validEnabled
      || existing.doorRight !== next.doorRight
      || existing.localUiRight !== next.localUiRight
      || existing.closeDelayEnabled !== next.closeDelayEnabled
      || existing.maxOpenDoorTime !== next.maxOpenDoorTime
      || existing.openDoorTime !== next.openDoorTime
      || existing.syncStatus !== next.syncStatus
      || !this.sameJson(existing.metadata, next.metadata)
    );
  }

  private hasRightPlanChanged(existing: EmployeeDeviceRightPlan, next: EmployeeDeviceRightPlan): boolean {
    return (
      existing.employeeDeviceAssignmentId !== next.employeeDeviceAssignmentId
      || existing.employeeNo !== next.employeeNo
      || existing.deviceId !== next.deviceId
      || existing.doorId !== next.doorId
      || existing.doorNo !== next.doorNo
      || existing.scheduleTemplateId !== next.scheduleTemplateId
      || existing.hikvisionTemplateNo !== next.hikvisionTemplateNo
      || existing.isActive !== next.isActive
      || !this.sameJson(existing.metadata, next.metadata)
    );
  }

  private hasCredentialChanged(existing: EmployeeAccessCredential, next: EmployeeAccessCredential): boolean {
    return (
      existing.companyId !== next.companyId
      || existing.employeeId !== next.employeeId
      || existing.employeeNo !== next.employeeNo
      || existing.deviceId !== next.deviceId
      || existing.credentialType !== next.credentialType
      || existing.credentialNo !== next.credentialNo
      || existing.pinPassword !== next.pinPassword
      || existing.cardNo !== next.cardNo
      || existing.fingerprintId !== next.fingerprintId
      || existing.cardReaderNo !== next.cardReaderNo
      || existing.faceId !== next.faceId
      || existing.fingerprintCount !== next.fingerprintCount
      || existing.faceCount !== next.faceCount
      || existing.hasFingerprint !== next.hasFingerprint
      || existing.hasFace !== next.hasFace
      || existing.passwordSet !== next.passwordSet
      || existing.credentialStatus !== next.credentialStatus
      || existing.source !== next.source
      || !this.sameJson(existing.metadata, next.metadata)
    );
  }

  private async requestWithRetry<T>(
    operation: string,
    runner: () => Promise<T>,
    retries = 2,
  ): Promise<T> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= retries) {
      try {
        return await runner();
      } catch (error) {
        lastError = error;
        if (!this.shouldRetryError(error) || attempt >= retries) {
          throw error;
        }

        this.logger.warn(
          `Retrying Hikvision sync operation ${operation} after error: ${(error as Error).message}`,
        );
      }

      await this.sleep((attempt + 1) * 250);
      attempt += 1;
    }

    throw lastError;
  }

  private shouldRetryError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();
    return (
      message.includes('timeout')
      || message.includes('offline')
      || message.includes('unreachable')
      || message.includes('connection reset')
      || message.includes('service unavailable')
    );
  }

  private ensureHikvisionSuccess(
    operation: string,
    payload: Record<string, unknown> | string,
    statusCode: number,
    httpOk: boolean,
  ) {
    const failureReason = this.extractHikvisionFailureReason(payload);
    if (!httpOk || failureReason) {
      throw new BadRequestException(
        `${operation} failed with HTTP ${statusCode}${failureReason ? `: ${failureReason}` : ''}`,
      );
    }
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
    const successStatusString = new Set(['ok', 'success', 'successful', 'enabled', 'completed', 'more']);
    const successSubStatus = new Set(['ok', 'success', 'none']);
    const successStatusCode = new Set(['1', '200']);

    if (subStatusCode && !successSubStatus.has(subStatusCode.toLowerCase())) {
      return `${subStatusCode}${errorMessage ? ` (${errorMessage})` : ''}`;
    }
    if (statusString && !successStatusString.has(statusString.toLowerCase())) {
      return `${statusString}${errorMessage ? ` (${errorMessage})` : ''}`;
    }
    if (errorCode && errorCode !== '0' && errorCode !== '1') {
      return `${errorCode}${errorMessage ? ` (${errorMessage})` : ''}`;
    }
    if (statusCode && !successStatusCode.has(statusCode.toLowerCase())) {
      return `${statusCode}${errorMessage ? ` (${errorMessage})` : ''}`;
    }

    return null;
  }

  private isNotSupportFailure(payload: unknown, failureReason: string | null): boolean {
    const normalizedReason = String(failureReason ?? '').toLowerCase();
    if (normalizedReason.includes('notsupport') || normalizedReason.includes('notsupport')) {
      return true;
    }

    const raw = JSON.stringify(payload ?? {}).toLowerCase();
    return raw.includes('notsupport') || raw.includes('notsupport');
  }

  private isFingerprintSlotEmptyFailure(payload: unknown, failureReason: string | null): boolean {
    const normalizedReason = String(failureReason ?? '').toLowerCase();
    const normalizedPayload = JSON.stringify(payload ?? {}).toLowerCase();
    const candidates = [
      normalizedReason,
      normalizedPayload,
    ];
    const emptyMarkers = [
      'notexist',
      'not exist',
      'notfound',
      'not found',
      'norecord',
      'no record',
      'nodata',
      'no data',
      'nomatch',
      'no match',
      'no fingerprint',
      'fingerprint not found',
    ];

    return candidates.some((candidate) =>
      emptyMarkers.some((marker) => candidate.includes(marker)),
    );
  }

  private findFirstStringDeep(source: Record<string, unknown>, keys: string[]): string {
    const wanted = new Set(keys.map((key) => key.toLowerCase()));
    const queue: unknown[] = [source];

    while (queue.length > 0) {
      const current = queue.shift();
      if (Array.isArray(current)) {
        queue.push(...current);
        continue;
      }
      if (!current || typeof current !== 'object') {
        continue;
      }

      const record = current as Record<string, unknown>;
      for (const [key, value] of Object.entries(record)) {
        if (wanted.has(key.toLowerCase())) {
          const normalized = String(value ?? '').trim();
          if (normalized) {
            return normalized;
          }
        }
      }

      queue.push(...Object.values(record));
    }

    return '';
  }

  private async persistSyncLogSafe(input: {
    companyId: number;
    deviceId: number;
    syncType: HikvisionSyncLogTypeEnum;
    status: SyncStatus;
    startedAt: Date;
    counters: PhaseCounters;
    metadata?: Record<string, unknown>;
    errorMessage?: string;
  }) {
    try {
      await this.hikvisionSyncLogRepository.save(
        this.hikvisionSyncLogRepository.create({
          companyId: input.companyId,
          deviceId: input.deviceId,
          syncType: input.syncType,
          direction: HikvisionSyncLogDirectionEnum.PULL,
          status:
            input.status === 'FAILED'
              ? HikvisionSyncLogStatusEnum.FAILED
              : input.status === 'PARTIAL'
                ? HikvisionSyncLogStatusEnum.PARTIAL
                : HikvisionSyncLogStatusEnum.SUCCESS,
          startedAt: input.startedAt,
          completedAt: new Date(),
          recordsReceived: input.counters.received,
          recordsProcessed:
            input.counters.created
            + input.counters.updated
            + input.counters.skipped
            + input.counters.failed,
          recordsCreated: input.counters.created,
          recordsUpdated: input.counters.updated,
          recordsFailed: input.counters.failed,
          errorMessage: input.errorMessage ?? null,
          metadata: input.metadata ? this.maskSensitivePayload(input.metadata) : null,
        }),
      );
    } catch (error) {
      this.logger.warn(`Skipping Hikvision sync log insert: ${(error as Error).message}`);
    }
  }

  private async findHikvisionDeviceOrFail(companyId: number, deviceId: number): Promise<AttendanceDevice> {
    const device = await this.attendanceDeviceRepository.findOne({
      where: { id: deviceId, companyId },
    });

    if (!device) {
      throw new NotFoundException('Hikvision device not found');
    }

    const isHikvision =
      (device.integrationType || '').toLowerCase() === 'hikvision'
      || (device.vendorName || '').toLowerCase().includes('hikvision');
    if (!isHikvision) {
      throw new BadRequestException('Requested device is not configured as Hikvision');
    }

    if (device.status !== AttendanceDeviceStatusEnum.ACTIVE) {
      throw new BadRequestException('Hikvision device is inactive');
    }

    return device;
  }

  private buildRightPlanKey(doorNo: number, templateNo: string): string {
    return `${doorNo}:${templateNo}`;
  }

  private buildFingerprintCredentialKey(
    employeeNo: string,
    fingerprintId: string,
    cardReaderNo: number | null,
  ): string {
    return `${employeeNo}:${fingerprintId}:${cardReaderNo ?? 'null'}`;
  }

  private sanitizeFingerprintRawPayload(payload: Record<string, unknown>): Record<string, unknown> {
    const sanitized = this.toObject(payload);
    delete sanitized.fingerData;
    delete sanitized.fingerprintData;
    delete sanitized.fingerPrintData;

    return {
      ...sanitized,
      hasFingerData: Boolean(
        this.toNullableString(payload.fingerData ?? payload.fingerprintData ?? payload.fingerPrintData),
      ),
    };
  }

  private resolveFingerprintStorageMode(
    payload: Record<string, unknown>,
    encryptedFingerprintTemplate: Record<string, string> | null,
  ): string {
    const fingerData = this.toNullableString(
      payload.fingerData ?? payload.fingerprintData ?? payload.fingerPrintData,
    );
    if (!fingerData) {
      return 'no_template_data';
    }

    return encryptedFingerprintTemplate
      ? 'encrypted_device_payload'
      : 'hash_only';
  }

  private buildStoredEncryptedFingerprintTemplate(
    fingerData: string | null,
    existingEncryptedTemplate: unknown,
  ): Record<string, string> | null {
    if (existingEncryptedTemplate && typeof existingEncryptedTemplate === 'object') {
      return this.toObject(existingEncryptedTemplate) as Record<string, string>;
    }

    return this.encryptFingerprintTemplate(fingerData);
  }

  private encryptFingerprintTemplate(fingerData: string | null): Record<string, string> | null {
    const normalizedFingerData = String(fingerData ?? '').trim();
    if (!normalizedFingerData) {
      return null;
    }

    const secret = String(process.env.BIOMETRIC_ENCRYPTION_KEY ?? process.env.APP_KEY ?? '').trim();
    if (!secret) {
      return null;
    }

    const key = createHash('sha256').update(secret).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(normalizedFingerData, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      algorithm: 'aes-256-gcm',
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      ciphertext: encrypted.toString('base64'),
    };
  }

  private shouldContinuePagination(
    responseStatusStrg: string,
    currentPosition: number,
    matchesThisPage: number,
    totalMatches: number,
  ): boolean {
    const normalizedStatus = String(responseStatusStrg ?? '').trim().toUpperCase();
    if (normalizedStatus === 'MORE') {
      return true;
    }

    if (totalMatches <= 0) {
      return false;
    }

    return currentPosition + matchesThisPage < totalMatches;
  }

  private createCounters(): PhaseCounters {
    return {
      received: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
    };
  }

  private derivePhaseStatus(counters: PhaseCounters): SyncStatus {
    if (counters.failed > 0) {
      if (counters.created > 0 || counters.updated > 0 || counters.skipped > 0) {
        return 'PARTIAL';
      }
      return 'FAILED';
    }

    return 'SUCCESS';
  }

  private deriveOverallStatus(statuses: SyncStatus[]): SyncStatus {
    if (statuses.every((status) => status === 'SUCCESS')) {
      return 'SUCCESS';
    }
    if (statuses.some((status) => status === 'PARTIAL') || statuses.some((status) => status === 'SUCCESS')) {
      return 'PARTIAL';
    }
    return 'FAILED';
  }

  private mergeMetadata(
    existing: Record<string, unknown> | null,
    patch: Record<string, unknown>,
  ): Record<string, unknown> {
    const current = this.toObject(existing);
    const next = this.toObject(patch);
    const currentHikvision = this.toObject(current.hikvision);
    const nextHikvision = this.toObject(next.hikvision);

    return {
      ...current,
      ...next,
      hikvision: {
        ...currentHikvision,
        ...nextHikvision,
      },
    };
  }

  private sanitizeUserInfo(payload: Record<string, unknown>): Record<string, unknown> {
    return this.maskSensitivePayload({
      ...payload,
      password: this.toNullableString(payload.password) ? '***MASKED***' : undefined,
    });
  }

  private maskSensitivePayload<T>(payload: T): T {
    if (payload === null || payload === undefined) {
      return payload;
    }

    const sensitiveKeys = new Set([
      'api_password',
      'password',
      'pin_password',
      'fingerprint',
      'encrypted_fingerprint_template',
      'fingerprintdata',
      'fingerdata',
      'finger_print_data',
      'biometricdata',
      'face_data',
      'raw_biometric_data',
      'fingertemplate',
      'capturedfingerprint',
    ]);

    const recurse = (value: unknown): unknown => {
      if (Array.isArray(value)) {
        return value.map((item) => recurse(item));
      }
      if (!value || typeof value !== 'object') {
        return value;
      }

      const output: Record<string, unknown> = {};
      for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        if (sensitiveKeys.has(key.toLowerCase())) {
          output[key] = '***MASKED***';
          continue;
        }
        output[key] = recurse(raw);
      }
      return output;
    };

    return recurse(payload) as T;
  }

  private sameJson(left: unknown, right: unknown): boolean {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  }

  private sameDate(left: Date | null | undefined, right: Date | null | undefined): boolean {
    const leftValue = left ? new Date(left).toISOString() : null;
    const rightValue = right ? new Date(right).toISOString() : null;
    return leftValue === rightValue;
  }

  private toObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private toObjectArray(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) {
      return value.map((item) => this.toObject(item));
    }
    if (value && typeof value === 'object') {
      return [this.toObject(value)];
    }
    return [];
  }

  private toNullableString(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    const normalized = String(value).trim();
    return normalized || null;
  }

  private toNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : null;
  }

  private toNullableDate(value: unknown): Date | null {
    const normalized = this.toNullableString(value);
    if (!normalized) {
      return null;
    }

    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private toBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  }

  private normalizeDoorRight(value: unknown): string | null {
    if (Array.isArray(value)) {
      const normalized = value
        .map((item) => this.toNullableString(item))
        .filter((item): item is string => Boolean(item));
      return normalized.length ? normalized.join(',') : null;
    }

    return this.toNullableString(value);
  }

  private normalizeEmployeeNo(value: unknown): string {
    const normalized = this.toNullableString(value);
    if (!normalized) {
      throw new BadRequestException('employeeNo is required');
    }
    return normalized;
  }

  private ensurePositiveInteger(value: unknown, fieldName: string): number {
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized < 1) {
      throw new BadRequestException(`${fieldName} must be a positive integer`);
    }
    return normalized;
  }

  private maskValue(value: string): string {
    if (value.length <= 4) {
      return '*'.repeat(value.length);
    }
    return `${'*'.repeat(Math.max(value.length - 4, 0))}${value.slice(-4)}`;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

const rawOr = <T>(value: T | null | undefined, fallback: T): T => (value ?? fallback);

