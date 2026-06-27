import {
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { ALLIANCE_EMPLOYEES } from '../../database/seeds/company-structure.constants';
import { buildAttendanceDeviceSearchId } from '../access-control/attendance-devices/utils/attendance-device-search-id.util';
import { HikvisionSeedPreviewQueryDto } from './dto/hikvision-seed-preview-query.dto';
import { HikvisionAccessControlService } from './hikvision-access-control.service';
import { HikvisionHelperService } from './helpers/hikvision-helper.service';

// ── Types ──────────────────────────────────────────────────────────────────────

export type SeedPreviewAction = 'EXISTS' | 'CREATE' | 'AMEND' | 'SKIP';

export interface HikvisionUserPreviewItem {
  employeeNo: string;
  name: string | null;
  action: SeedPreviewAction;
  existsInSeeder: boolean;
  department: string | null;
  hasFingerprint: boolean;
  hasPin: boolean;
  hasCard: boolean;
  cardNo: string | null;
  userVerifyMode: string | null;
  deviceStatus: 'ACTIVE' | 'INACTIVE';
  deviceSyncStatus: 'FOUND_ON_DEVICE';
  fingerprintCheckMethod: 'slot-1-probe';
  suggestedSeedEntry: Record<string, unknown> | null;
}

export interface HikvisionSeedPreviewResult {
  deviceId: number;
  queriedAt: string;
  totalDeviceUsers: number;
  existingInSeeder: number;
  missingFromSeeder: number;
  toAmend: number;
  skipped: number;
  generatedFilePath: string | null;
  users: HikvisionUserPreviewItem[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FINGERPRINT_CARD_READER_NO = 1;
const FINGERPRINT_SLOT = 1;
const PAGE_SIZE = 20;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class HikvisionSeedPreviewService {
  private readonly logger = new Logger(HikvisionSeedPreviewService.name);

  constructor(
    private readonly hikvisionHelper: HikvisionHelperService,
    private readonly accessControl: HikvisionAccessControlService,
  ) {}

  async generateSeedPreview(
    companyId: number,
    deviceId: number,
    query: HikvisionSeedPreviewQueryDto,
  ): Promise<HikvisionSeedPreviewResult> {
    if (process.env.NODE_ENV !== 'development') {
      throw new ForbiddenException(
        'Seed preview endpoint is only available in development mode.',
      );
    }

    await this.hikvisionHelper.findHikvisionDeviceOrFail(companyId, deviceId, true);

    const queriedAt = new Date().toISOString();

    // 1. Fetch all users from device (paginated)
    const deviceUsers = await this.paginateAllDeviceUsers(companyId, deviceId);

    // 2. Filter by employee no range if provided
    const filtered = this.filterByEmployeeNoRange(
      deviceUsers,
      query.fromEmployeeNo,
      query.toEmployeeNo,
    );

    // 3. Build card map: employeeNo → cardNo
    const cardMap = await this.buildCardMap(companyId, deviceId);

    // 4. Build seeder map: hikvisionEmployeeNo → seeder entry
    const seederMap = this.buildSeederMap();

    // 5. Classify each device user
    const users: HikvisionUserPreviewItem[] = [];
    for (const user of filtered) {
      const employeeNo = String(user.employeeNo ?? '');
      const name = user.name ? String(user.name) : null;
      const passwordConfigured = Boolean(user.password);
      const userVerifyMode = user.userVerifyMode
        ? String(user.userVerifyMode)
        : null;
      const validEnable = this.extractValidEnable(user);

      const cardNo = cardMap.get(employeeNo) ?? null;
      const hasFingerprint = await this.probeFingerprint(
        companyId,
        deviceId,
        employeeNo,
      );

      const seederEntry = seederMap.get(employeeNo);
      const existsInSeeder = seederEntry !== undefined;

      const action = this.classifyAction(existsInSeeder, name, seederEntry);

      const item: HikvisionUserPreviewItem = {
        employeeNo,
        name,
        action,
        existsInSeeder,
        department: seederEntry?.primaryDepartmentCode ?? null,
        hasFingerprint,
        hasPin: passwordConfigured,
        hasCard: cardNo !== null,
        cardNo,
        userVerifyMode,
        deviceStatus: validEnable ? 'ACTIVE' : 'INACTIVE',
        deviceSyncStatus: 'FOUND_ON_DEVICE',
        fingerprintCheckMethod: 'slot-1-probe',
        suggestedSeedEntry:
          action === 'CREATE'
            ? this.buildSuggestedSeedEntry(
                employeeNo,
                name,
                query.departmentCode,
                query.managerName,
                query.assistantManagerName,
              )
            : null,
      };

      users.push(item);
    }

    // 6. Optionally write generated file
    let generatedFilePath: string | null = null;
    const missing = users.filter((u) => u.action === 'CREATE');
    if (query.writeSeederFile && missing.length > 0) {
      generatedFilePath = await this.writeGeneratedFile(missing);
    }

    const existingInSeeder = users.filter((u) => u.action === 'EXISTS').length;
    const toAmend = users.filter((u) => u.action === 'AMEND').length;
    const skipped = users.filter((u) => u.action === 'SKIP').length;

    return {
      deviceId,
      queriedAt,
      totalDeviceUsers: deviceUsers.length,
      existingInSeeder,
      missingFromSeeder: missing.length,
      toAmend,
      skipped,
      generatedFilePath,
      users,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async paginateAllDeviceUsers(
    companyId: number,
    deviceId: number,
  ): Promise<Record<string, unknown>[]> {
    const all: Record<string, unknown>[] = [];
    let position = 0;

    do {
      const payload = {
        UserInfoSearchCond: {
          searchID: buildAttendanceDeviceSearchId('seed-preview', deviceId),
          searchResultPosition: position,
          maxResults: PAGE_SIZE,
        },
      };

      const response = await this.accessControl.searchUserInfo(
        companyId,
        deviceId,
        payload,
      );

      const parsed = this.toObject(response?.parsed ?? response);
      const root = this.toObject(
        parsed.UserInfoSearch ?? parsed.UserInfoSearchResult ?? parsed,
      );
      const userList = root.UserInfo ?? root.UserInfoList ?? root.userInfoList ?? [];
      const users = Array.isArray(userList)
        ? userList.map((u) => this.toObject(u))
        : userList && typeof userList === 'object'
          ? [this.toObject(userList)]
          : [];

      all.push(...users);

      const responseStatusStrg = String(
        root.responseStatusStrg ?? root.responseStatus ?? 'OK',
      );
      const numOfMatches = Number(root.numOfMatches ?? users.length);
      position += numOfMatches;

      if (responseStatusStrg.toUpperCase() !== 'MORE') break;
    } while (true);

    return all;
  }

  private filterByEmployeeNoRange(
    users: Record<string, unknown>[],
    from?: string,
    to?: string,
  ): Record<string, unknown>[] {
    if (!from && !to) return users;
    return users.filter((u) => {
      const no = String(u.employeeNo ?? '');
      if (from && no < from) return false;
      if (to && no > to) return false;
      return true;
    });
  }

  private async buildCardMap(
    companyId: number,
    deviceId: number,
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();

    try {
      const payload = {
        CardInfoSearchCond: {
          searchID: buildAttendanceDeviceSearchId('seed-preview-cards', deviceId),
          searchResultPosition: 0,
          maxResults: 1000,
        },
      };

      const response = await this.accessControl.searchCardInfo(
        companyId,
        deviceId,
        payload,
      );

      const parsed = this.toObject(response?.parsed ?? response);
      const root = this.toObject(
        parsed.CardInfoSearch ?? parsed.CardInfoSearchResult ?? parsed,
      );
      const cardList = root.CardInfo ?? root.CardInfoList ?? [];
      const cards = Array.isArray(cardList)
        ? cardList.map((c) => this.toObject(c))
        : [];

      for (const card of cards) {
        const empNo = String(card.employeeNo ?? '');
        const cardNo = String(card.cardNo ?? '');
        if (empNo && cardNo) {
          map.set(empNo, cardNo);
        }
      }
    } catch (err) {
      this.logger.warn(
        `buildCardMap: failed to fetch cards from device ${deviceId}: ${(err as Error).message}`,
      );
    }

    return map;
  }

  private async probeFingerprint(
    companyId: number,
    deviceId: number,
    employeeNo: string,
  ): Promise<boolean> {
    try {
      const payload = {
        FingerPrintCond: {
          searchID: buildAttendanceDeviceSearchId(
            'seed-preview-fp',
            deviceId,
            employeeNo,
            String(FINGERPRINT_SLOT),
          ),
          employeeNo,
          cardReaderNo: FINGERPRINT_CARD_READER_NO,
          fingerPrintID: FINGERPRINT_SLOT,
        },
      };

      const response = await this.accessControl.uploadFingerprint(
        companyId,
        deviceId,
        payload,
      );

      const raw = JSON.stringify(response?.parsed ?? response ?? {}).toLowerCase();

      // Not supported → treat as unknown; assume false
      if (raw.includes('notsupport')) return false;

      // Empty slot markers → no fingerprint
      const emptyMarkers = [
        'notexist', 'not exist', 'notfound', 'not found',
        'norecord', 'no record', 'nodata', 'no data',
        'nomatch', 'no match', 'no fingerprint',
      ];
      if (emptyMarkers.some((m) => raw.includes(m))) return false;

      // Presence of FingerPrint data suggests it exists
      return raw.includes('fingerprint') && (response?.ok ?? false);
    } catch {
      return false;
    }
  }

  private buildSeederMap(): Map<string, (typeof ALLIANCE_EMPLOYEES)[0]> {
    const map = new Map<string, (typeof ALLIANCE_EMPLOYEES)[0]>();
    for (const emp of ALLIANCE_EMPLOYEES) {
      if (emp.hikvisionEmployeeNo) {
        map.set(emp.hikvisionEmployeeNo, emp);
      }
    }
    return map;
  }

  private classifyAction(
    existsInSeeder: boolean,
    name: string | null,
    seederEntry: (typeof ALLIANCE_EMPLOYEES)[0] | undefined,
  ): SeedPreviewAction {
    if (!existsInSeeder) return 'CREATE';

    if (
      seederEntry &&
      name &&
      !this.namesMatch(
        name,
        `${seederEntry.firstName} ${seederEntry.lastName}`,
      )
    ) {
      return 'AMEND';
    }

    return 'EXISTS';
  }

  private namesMatch(a: string, b: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    return normalize(a) === normalize(b);
  }

  private buildSuggestedSeedEntry(
    employeeNo: string,
    name: string | null,
    departmentCode?: string,
    managerName?: string,
    assistantManagerName?: string,
  ): Record<string, unknown> {
    return {
      hikvisionEmployeeNo: employeeNo,
      fullName: name ?? 'UNKNOWN — update manually',
      _suggestedDepartment: departmentCode ?? 'REVIEW_REQUIRED',
      _suggestedPositionCode: 'REVIEW_REQUIRED',
      _suggestedReportsToEmployeeNo: null,
      _hints: {
        managerName: managerName ?? null,
        assistantManagerName: assistantManagerName ?? null,
      },
      _action: 'ADD to ALLIANCE_HIKVISION_EMPLOYEES array then run buildAllianceEmployeeAssignments()',
    };
  }

  private extractValidEnable(user: Record<string, unknown>): boolean {
    const valid = user.Valid ?? user.valid ?? {};
    if (valid && typeof valid === 'object') {
      const enable = (valid as Record<string, unknown>).enable;
      if (enable === true || enable === 'true' || enable === 1) return true;
      if (enable === false || enable === 'false' || enable === 0) return false;
    }
    return true;
  }

  private toObject(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private async writeGeneratedFile(
    missing: HikvisionUserPreviewItem[],
  ): Promise<string> {
    const seedsDir = path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      'src',
      'database',
      'seeds',
    );
    const outPath = path.join(seedsDir, 'hikvision-import-preview.generated.ts');

    const hikvisionLines = missing
      .map(
        (u) =>
          `  // TODO: verify name and assignment before merging\n` +
          `  { hikvisionEmployeeNo: '${u.employeeNo}', fullName: '${u.name ?? 'UNKNOWN'}' },`,
      )
      .join('\n');

    const assignLines = missing
      .map(
        (u) =>
          `  // ${u.name ?? u.employeeNo}\n` +
          `  assign('${u.employeeNo}', 'REVIEW_REQUIRED', 'REVIEW_REQUIRED', null);`,
      )
      .join('\n');

    const content = [
      `// AUTO-GENERATED by HikvisionSeedPreviewService — DO NOT COMMIT without review`,
      `// Copy the entries below into company-structure.constants.ts after manual verification.`,
      `// Generated at: ${new Date().toISOString()}`,
      ``,
      `// ── Step 1: Add to ALLIANCE_HIKVISION_EMPLOYEES array ──────────────────────`,
      `// const newEmployees = [`,
      ...hikvisionLines.split('\n').map((l) => `// ${l}`),
      `// ];`,
      ``,
      `// ── Step 2: Add to buildAllianceEmployeeAssignments() ───────────────────────`,
      `// function assignments:`,
      ...assignLines.split('\n').map((l) => `// ${l}`),
      ``,
      `export {}; // keeps TypeScript happy`,
    ].join('\n');

    fs.writeFileSync(outPath, content, 'utf-8');
    this.logger.log(`Seed preview file written to: ${outPath}`);
    return outPath;
  }
}
