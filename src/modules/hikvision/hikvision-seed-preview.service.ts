import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { ALLIANCE_EMPLOYEES } from '../../database/seeds/company-structure.constants';
import { buildAttendanceDeviceSearchId } from '../access-control/attendance-devices/utils/attendance-device-search-id.util';
import { HikvisionSeedPreviewQueryDto } from './dto/hikvision-seed-preview-query.dto';
import { HikvisionAccessControlService } from './hikvision-access-control.service';
import { HikvisionHelperService } from './helpers/hikvision-helper.service';

// ── Types ──────────────────────────────────────────────────────────────────────

export type SeedPreviewAction = 'EXISTS' | 'CREATE' | 'AMEND' | 'SKIP';

export interface HikvisionUserPreviewItem {
  hikvisionEmployeeNo: string;
  fullName: string | null;
  employeeNo: string;
  name: string | null;
  action: SeedPreviewAction;
  existsInSeeder: boolean;
  department: string | null;
  hasFingerprint: boolean;
  fingerprintCount: number;
  enrolledSlots: number[];
  hasPin: boolean;
  hasCard: boolean;
  cardNo: string | null;
  userVerifyMode: string | null;
  deviceStatus: 'ACTIVE' | 'INACTIVE';
  deviceSyncStatus: 'FOUND_ON_DEVICE';
  suggestedSeedEntry: Record<string, unknown> | null;
}

export interface SyncedEmployeeConstantEntry {
  hikvisionEmployeeNo: string;
  fullName: string;
  email: string;
  phone: string | null;
  departmentCode: string | null;
  positionCode: string | null;
  reportsToEmployeeNo: string | null;
  fingerprintCount: number;
  hasPin: boolean;
}

export interface GenerateConstantsResult {
  deviceId: number;
  generatedAt: string;
  totalEmployees: number;
  alreadyInConstants: number;
  newEntries: number;
  outputFile: string;
  entries: SyncedEmployeeConstantEntry[];
}

export interface WriteToConstantsResult {
  inserted: number;
  skipped: number;
  constantsFilePath: string;
  insertedEmployeeNos: string[];
}

export interface HikvisionSeedPreviewResult {
  deviceId: number;
  queriedAt: string;
  totalFetchedFromDevice: number;
  totalUniqueUsers: number;
  duplicatesSkipped: number;
  totalDeviceUsers: number;
  existingInSeeder: number;
  missingFromSeeder: number;
  toAmend: number;
  skipped: number;
  savedToDatabase: { created: number; amended: number } | null;
  generatedFilePath: string | null;
  users: HikvisionUserPreviewItem[];
}

// Internal shape returned by the raw SQL query in generateConstantsFromSync()
interface SyncedEmployeeRow {
  employeeNo: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  departmentCode: string | null;
  positionCode: string | null;
  reportsToEmployeeNo: string | null;
  fingerprintCount: number;
  hasPin: boolean;
}

interface PaginatedDeviceUsersResult {
  totalFetchedFromDevice: number;
  totalUniqueUsers: number;
  duplicatesSkipped: number;
  rawUsers: Record<string, unknown>[];
  users: Record<string, unknown>[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;
const USER_SEARCH_START_POSITION = 0;
const FP_SLOT_START = 1;
const FP_SLOT_END = 10;
const FP_CARD_READER_NO = 1;
const HIKVISION_SEARCH_ID_LENGTH = 24;
// Max users whose fingerprints are fetched concurrently. Each user fires 10
// parallel slot probes, so effective concurrency = USER_BATCH × 10 requests.
const USER_BATCH_SIZE = 5;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class HikvisionSeedPreviewService {
  private readonly logger = new Logger(HikvisionSeedPreviewService.name);

  constructor(
    private readonly hikvisionHelper: HikvisionHelperService,
    private readonly accessControl: HikvisionAccessControlService,
    private readonly dataSource: DataSource,
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

    await this.hikvisionHelper.findHikvisionDeviceOrFail(
      companyId,
      deviceId,
      true,
    );

    const queriedAt = new Date().toISOString();

    // 1. Fetch all users from device (paginated)
    const paginatedUsers = await this.paginateAllDeviceUsers(
      companyId,
      deviceId,
    );
    const deviceUsers = paginatedUsers.users;

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

    // 5. Fetch fingerprint slots for all filtered users (batched, slots in parallel).
    //    Each user can have up to 10 enrolled fingers; we probe all slots concurrently
    //    per user and process USER_BATCH_SIZE users at a time to avoid flooding device.
    this.logger.log(
      `Fetching fingerprints for ${filtered.length} users (batch=${USER_BATCH_SIZE}, slots=${FP_SLOT_START}-${FP_SLOT_END})`,
    );
    const fingerprintMap = await this.fetchFingerprintsForUsers(
      companyId,
      deviceId,
      filtered.map((u) => this.toSafeString(u.employeeNo ?? '')),
    );

    // 6. Classify each device user
    const users: HikvisionUserPreviewItem[] = [];
    for (const user of filtered) {
      const employeeNo = this.toSafeString(user.employeeNo ?? '');
      const name = user.name ? this.toSafeString(user.name) : null;
      const passwordConfigured = Boolean(user.password);
      const userVerifyMode = user.userVerifyMode
        ? this.toSafeString(user.userVerifyMode)
        : null;
      const validEnable = this.extractValidEnable(user);

      const cardNo = cardMap.get(employeeNo) ?? null;
      const enrolledSlots = fingerprintMap.get(employeeNo) ?? [];

      const seederEntry = seederMap.get(employeeNo);
      const existsInSeeder = seederEntry !== undefined;

      const action = this.classifyAction(existsInSeeder, name, seederEntry);

      const item: HikvisionUserPreviewItem = {
        hikvisionEmployeeNo: employeeNo,
        fullName: name,
        employeeNo,
        name,
        action,
        existsInSeeder,
        department: seederEntry?.primaryDepartmentCode ?? null,
        hasFingerprint: enrolledSlots.length > 0,
        fingerprintCount: enrolledSlots.length,
        enrolledSlots,
        hasPin: passwordConfigured,
        hasCard: cardNo !== null,
        cardNo,
        userVerifyMode,
        deviceStatus: validEnable ? 'ACTIVE' : 'INACTIVE',
        deviceSyncStatus: 'FOUND_ON_DEVICE',
        suggestedSeedEntry:
          action === 'CREATE'
            ? this.buildSuggestedSeedEntry(employeeNo, name)
            : null,
      };

      users.push(item);
    }

    const missing = users.filter((u) => u.action === 'CREATE');
    const toAmendUsers = users.filter((u) => u.action === 'AMEND');
    const existingInSeeder = users.filter((u) => u.action === 'EXISTS').length;
    const skipped = users.filter((u) => u.action === 'SKIP').length;

    // 6. Optionally persist CREATE users to DB
    let savedToDatabase: { created: number; amended: number } | null = null;
    if (query.saveToDatabase === true) {
      savedToDatabase = await this.persistUsers(
        companyId,
        deviceId,
        missing,
        toAmendUsers,
      );
    }

    const generatedFilePath: string | null = null;

    return {
      deviceId,
      queriedAt,
      totalFetchedFromDevice: paginatedUsers.totalFetchedFromDevice,
      totalUniqueUsers: paginatedUsers.totalUniqueUsers,
      duplicatesSkipped: paginatedUsers.duplicatesSkipped,
      totalDeviceUsers: users.length,
      existingInSeeder,
      missingFromSeeder: missing.length,
      toAmend: toAmendUsers.length,
      skipped,
      savedToDatabase,
      generatedFilePath,
      users,
    };
  }

  // ── Generate constants from already-synced DB records ─────────────────────
  //
  // After running POST /hikvision/devices/:id/sync-users-credentials, all device
  // users are stored in the employees/users/company_users tables. This method
  // reads those DB records and writes a ready-to-review constants file so you
  // can copy the missing entries into company-structure.constants.ts.

  async generateConstantsFromSync(
    companyId: number,
    deviceId: number,
  ): Promise<GenerateConstantsResult> {
    if (process.env.NODE_ENV !== 'development') {
      throw new ForbiddenException(
        'generate-constants endpoint is only available in development mode.',
      );
    }

    await this.hikvisionHelper.findHikvisionDeviceOrFail(
      companyId,
      deviceId,
      true,
    );

    // ── 1. Fetch ALL users directly from the device (paginated) ─────────────
    this.logger.log(
      `generateConstantsFromSync: fetching all users from device ${deviceId}`,
    );
    const paginatedUsers = await this.paginateAllDeviceUsers(
      companyId,
      deviceId,
    );
    const deviceUsers = paginatedUsers.users;
    this.logger.log(
      `generateConstantsFromSync: fetched=${paginatedUsers.totalFetchedFromDevice}, unique=${paginatedUsers.totalUniqueUsers}, duplicatesSkipped=${paginatedUsers.duplicatesSkipped}`,
    );

    // ── 2. Fetch DB enrichment data (department / position / credentials) ────
    const rows = await this.dataSource.query<SyncedEmployeeRow[]>(
      `
      SELECT
        e.employee_no                     AS "employeeNo",
        u.first_name                      AS "firstName",
        u.last_name                       AS "lastName",
        u.email                           AS "email",
        u.phone                           AS "phone",
        d.code                            AS "departmentCode",
        p.code                            AS "positionCode",
        mgr.employee_no                   AS "reportsToEmployeeNo",
        COALESCE(fp.fp_count, 0)          AS "fingerprintCount",
        COALESCE(pin.has_pin, false)      AS "hasPin"
      FROM employee_device_identities edi
      JOIN employees          e   ON e.id               = edi.employee_id
      JOIN company_users      cu  ON cu.id              = e.company_user_id
      JOIN users              u   ON u.id               = cu.user_id
      LEFT JOIN departments   d   ON d.id               = e.primary_department_id
      LEFT JOIN positions     p   ON p.id               = e.primary_position_id
      LEFT JOIN employees     mgr ON mgr.id             = e.reports_to
      LEFT JOIN (
        SELECT employee_id, COUNT(*) AS fp_count
        FROM   employee_access_credentials
        WHERE  credential_type = 'FINGERPRINT'
          AND  company_id      = $1
          AND  device_id       = $2
        GROUP BY employee_id
      ) fp  ON fp.employee_id  = e.id
      LEFT JOIN (
        SELECT employee_id, true AS has_pin
        FROM   employee_access_credentials
        WHERE  credential_type = 'PIN'
          AND  company_id      = $1
          AND  device_id       = $2
        GROUP BY employee_id
      ) pin ON pin.employee_id = e.id
      WHERE edi.company_id = $1
        AND edi.device_id  = $2
      ORDER BY e.employee_no
      `,
      [companyId, deviceId],
    );

    // Build a lookup map: employeeNo → DB row
    const dbMap = new Map<string, SyncedEmployeeRow>();
    for (const row of rows) {
      dbMap.set(row.employeeNo, row);
    }

    // ── 3. Merge: device user list + DB enrichment ───────────────────────────
    const existingNos = new Set(
      ALLIANCE_EMPLOYEES.map((e) => e.hikvisionEmployeeNo),
    );

    const entries: SyncedEmployeeConstantEntry[] = deviceUsers.map((u) => {
      const employeeNo = this.toSafeString(u.employeeNo ?? '');
      const deviceName = u.name ? this.toSafeString(u.name) : null;
      const db = dbMap.get(employeeNo);

      // Prefer DB name (more reliable); fall back to device name
      const fullName = db
        ? `${db.firstName} ${db.lastName}`.trim()
        : (deviceName ?? 'Unknown Employee');

      // Auto-generate email from name (same logic as seeder)
      const slug = (s: string) =>
        s
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
      const parts = fullName.trim().split(/\s+/);
      const autoEmail =
        parts.length > 1
          ? `${slug(parts[0])}.${slug(parts.slice(1).join(' ')).replace(/-/g, '.')}@alliance.co.tz`
          : `${slug(parts[0])}@alliance.co.tz`;

      return {
        hikvisionEmployeeNo: employeeNo,
        fullName,
        email: db?.email ?? autoEmail,
        phone: db?.phone ?? null,
        departmentCode: db?.departmentCode ?? null,
        positionCode: db?.positionCode ?? null,
        reportsToEmployeeNo: db?.reportsToEmployeeNo ?? null,
        fingerprintCount: db ? Number(db.fingerprintCount) : 0,
        hasPin: db ? Boolean(db.hasPin) : Boolean(u.password),
      };
    });

    // Sort by employeeNo ascending while preserving leading zeroes
    entries.sort((a, b) =>
      a.hikvisionEmployeeNo.localeCompare(b.hikvisionEmployeeNo),
    );

    const newEntries = entries.filter(
      (entry) => !existingNos.has(entry.hikvisionEmployeeNo),
    );
    const outputFile = this.writeConstantsFile(
      entries,
      newEntries,
      existingNos,
    );

    return {
      deviceId,
      generatedAt: new Date().toISOString(),
      totalEmployees: entries.length,
      alreadyInConstants: entries.length - newEntries.length,
      newEntries: newEntries.length,
      outputFile,
      entries,
    };
  }

  // ── Write missing employees into company-structure.constants.ts ───────────
  //
  // Reads synced employees from DB (via generateConstantsFromSync), finds those
  // absent from ALLIANCE_HIKVISION_EMPLOYEES, and inserts them — both the array
  // entry AND the assign() call — in a single atomic write.  Rolls back to the
  // original file content if the result fails TypeScript compilation.

  async writeToConstantsFile(
    companyId: number,
    deviceId: number,
    defaultDepartmentCode = 'CLAIMS',
    defaultPositionCode = 'CLAIMS_OFFICER',
  ): Promise<WriteToConstantsResult> {
    if (process.env.NODE_ENV !== 'development') {
      throw new ForbiddenException(
        'write-to-constants endpoint is only available in development mode.',
      );
    }

    await this.hikvisionHelper.findHikvisionDeviceOrFail(
      companyId,
      deviceId,
      false,
    );

    const constantsPath = path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      'src',
      'database',
      'seeds',
      'company-structure.constants.ts',
    );

    const original = fs.readFileSync(constantsPath, 'utf-8');

    // Write a safety backup beside the original
    fs.writeFileSync(constantsPath + '.bak', original, 'utf-8');

    // Fetch all DB-synced employees for this device
    const syncResult = await this.generateConstantsFromSync(
      companyId,
      deviceId,
    );

    const existingNos = new Set(
      ALLIANCE_EMPLOYEES.map((employee) => employee.hikvisionEmployeeNo),
    );
    const seenToInsert = new Set<string>();
    const entriesToWrite = syncResult.entries.filter((entry) => {
      const employeeNo = entry.hikvisionEmployeeNo;
      if (existingNos.has(employeeNo)) {
        return false;
      }
      if (seenToInsert.has(employeeNo)) {
        return false;
      }

      seenToInsert.add(employeeNo);
      return true;
    });

    if (entriesToWrite.length === 0) {
      this.logger.log(
        `writeToConstantsFile: no new employees to insert for device ${deviceId}; all ${syncResult.totalEmployees} already exist in ${constantsPath}`,
      );
      return {
        inserted: 0,
        skipped: syncResult.totalEmployees,
        constantsFilePath: constantsPath,
        insertedEmployeeNos: [],
      };
    }

    // Default reportsTo = Claims Manager when falling back to CLAIMS dept
    const DEFAULT_REPORTS_TO = '00000003';

    // ── Build insertion blocks ───────────────────────────────────────────────

    const arrayLines = entriesToWrite
      .map((e) => {
        const fullName = e.fullName || 'Unknown Employee';
        // Only add email field if it differs from the auto-generated one
        const slug = (s: string) =>
          s
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        const parts = fullName.trim().split(/\s+/);
        const autoEmail =
          parts.length > 1
            ? `${slug(parts[0])}.${slug(parts.slice(1).join(' ')).replace(/-/g, '.')}@alliance.co.tz`
            : `${slug(parts[0])}@alliance.co.tz`;
        const emailPart =
          e.email && e.email !== autoEmail ? `, email: '${e.email}'` : '';
        return `  { hikvisionEmployeeNo: '${e.hikvisionEmployeeNo}', fullName: '${fullName}'${emailPart} },`;
      })
      .join('\n');

    const assignLines = entriesToWrite
      .map((e) => {
        const dept = e.departmentCode ?? defaultDepartmentCode;
        const pos = e.positionCode ?? defaultPositionCode;
        const mgr = e.reportsToEmployeeNo
          ? `'${e.reportsToEmployeeNo}'`
          : dept === 'CLAIMS'
            ? `'${DEFAULT_REPORTS_TO}'`
            : 'null';
        return `  assign('${e.hikvisionEmployeeNo}', '${dept}', '${pos}', ${mgr});`;
      })
      .join('\n');

    // ── Find insertion points ────────────────────────────────────────────────

    // Array: prefer inserting before the final known employee block (00000108),
    // but fall back to the closing bracket of ALLIANCE_HIKVISION_EMPLOYEES[] if
    // formatting differs across environments or line endings.
    const ARRAY_MARKER_REGEX =
      /(^\s*\{\s*\r?\n\s*hikvisionEmployeeNo:\s*'00000108')/m;
    const ARRAY_FALLBACK_REGEX =
      /(^\];\s*\r?\n\r?\nconst ALLIANCE_EMPLOYEE_ASSIGNMENTS = buildAllianceEmployeeAssignments\(\);)/m;
    // Assign: insert before the validation block
    const ASSIGN_MARKER = '  const allEmployeeNos = new Set(';

    if (
      !ARRAY_MARKER_REGEX.test(original) &&
      !ARRAY_FALLBACK_REGEX.test(original)
    ) {
      throw new Error(
        `Array insertion marker not found in constants file. ` +
          `Expected either employee 00000108 block or the end of ALLIANCE_HIKVISION_EMPLOYEES array`,
      );
    }
    if (!original.includes(ASSIGN_MARKER)) {
      throw new Error(
        `Assign insertion marker not found in constants file. ` +
          `Expected line: ${ASSIGN_MARKER}`,
      );
    }

    let updated = original;
    if (ARRAY_MARKER_REGEX.test(updated)) {
      updated = updated.replace(ARRAY_MARKER_REGEX, `${arrayLines}\r\n$1`);
    } else {
      updated = updated.replace(ARRAY_FALLBACK_REGEX, `${arrayLines}\r\n$1`);
    }

    updated = updated.replace(
      ASSIGN_MARKER,
      `${assignLines}\n\n${ASSIGN_MARKER}`,
    );

    // ── Write ────────────────────────────────────────────────────────────────
    // Backup is already written above. Write the updated file; the developer
    // can restore from .bak manually if needed.

    fs.writeFileSync(constantsPath, updated, 'utf-8');

    this.logger.log(
      `writeToConstantsFile: inserted ${entriesToWrite.length} employees into ${constantsPath}, skipped=${syncResult.totalEmployees - entriesToWrite.length} existing/duplicate entries`,
    );

    return {
      inserted: entriesToWrite.length,
      skipped: syncResult.totalEmployees - entriesToWrite.length,
      constantsFilePath: constantsPath,
      insertedEmployeeNos: entriesToWrite.map((e) => e.hikvisionEmployeeNo),
    };
  }

  private writeConstantsFile(
    all: SyncedEmployeeConstantEntry[],
    newEntries: SyncedEmployeeConstantEntry[],
    existingNos: Set<string>,
  ): string {
    const seedsDir = path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      'src',
      'database',
      'seeds',
    );
    const outPath = path.join(seedsDir, 'hikvision-device-sync.generated.ts');

    const formatEntry = (e: SyncedEmployeeConstantEntry, isNew: boolean) => {
      const marker = isNew
        ? '// ⚠ NEW — not yet in ALLIANCE_HIKVISION_EMPLOYEES'
        : '// already in constants';
      const fpNote =
        e.fingerprintCount > 0
          ? `fingerprints: ${e.fingerprintCount}`
          : 'no fingerprints';
      const pinNote = e.hasPin ? 'has PIN' : 'no PIN';
      return (
        `  ${marker}\n` +
        `  // ${fpNote}, ${pinNote}\n` +
        `  { hikvisionEmployeeNo: '${e.hikvisionEmployeeNo}', fullName: '${e.fullName}', email: '${e.email}' },`
      );
    };

    const formatAssign = (e: SyncedEmployeeConstantEntry, isNew: boolean) => {
      const dept = e.departmentCode ?? 'REVIEW_REQUIRED';
      const pos = e.positionCode ?? 'REVIEW_REQUIRED';
      const mgr = e.reportsToEmployeeNo ? `'${e.reportsToEmployeeNo}'` : 'null';
      const marker = isNew ? ' // ⚠ NEW' : '';
      return `  assign('${e.hikvisionEmployeeNo}', '${dept}', '${pos}', ${mgr});${marker}`;
    };

    const lines = [
      `// AUTO-GENERATED by HikvisionSeedPreviewService.generateConstantsFromSync()`,
      `// Source: sync-users-credentials result from DB — DO NOT COMMIT without review`,
      `// Generated at: ${new Date().toISOString()}`,
      `// Total employees on device: ${all.length}  |  New (not yet in constants): ${newEntries.length}`,
      ``,
      `// ════════════════════════════════════════════════════════════════════════`,
      `// STEP 1 — Copy NEW entries into ALLIANCE_HIKVISION_EMPLOYEES[]`,
      `//          (skip entries marked "already in constants")`,
      `// ════════════════════════════════════════════════════════════════════════`,
      `// const newEmployees: AllianceHikvisionEmployeeInput[] = [`,
      ...all.flatMap((e) =>
        formatEntry(e, !existingNos.has(e.hikvisionEmployeeNo))
          .split('\n')
          .map((line) => `// ${line}`),
      ),
      `// ];`,
      ``,
      `// ════════════════════════════════════════════════════════════════════════`,
      `// STEP 2 — Copy NEW assign() calls into buildAllianceEmployeeAssignments()`,
      `//          Department/position codes pulled from DB; verify before merging`,
      `// ════════════════════════════════════════════════════════════════════════`,
      `// function body additions:`,
      ...all.map(
        (e) =>
          `//   ${formatAssign(e, !existingNos.has(e.hikvisionEmployeeNo))}`,
      ),
      ``,
      `export {}; // keeps TypeScript happy`,
    ];

    fs.writeFileSync(outPath, lines.join('\n'), 'utf-8');
    this.logger.log(
      `Constants file written: ${outPath} (${all.length} employees, ${newEntries.length} new)`,
    );
    return outPath;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async paginateAllDeviceUsers(
    companyId: number,
    deviceId: number,
  ): Promise<PaginatedDeviceUsersResult> {
    const rawUsers: Record<string, unknown>[] = [];
    const uniqueUsers = new Map<string, Record<string, unknown>>();
    const seenPositions = new Set<number>();
    const searchId = this.buildRandomHikvisionSearchId();
    let totalFetchedFromDevice = 0;
    let duplicatesSkipped = 0;
    let position = USER_SEARCH_START_POSITION;
    let page = 1;

    this.logger.log(
      `Seed preview user query started for device ${deviceId}: searchId=${searchId}, startPosition=${position}, maxResults=${PAGE_SIZE}`,
    );

    for (;;) {
      if (seenPositions.has(position)) {
        this.logger.warn(
          `Seed preview user query detected repeated searchResultPosition=${position} for device ${deviceId}; stopping to prevent an infinite loop`,
        );
        break;
      }
      seenPositions.add(position);

      const payload = {
        UserInfoSearchCond: {
          searchID: searchId,
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
      const userList =
        root.UserInfo ?? root.UserInfoList ?? root.userInfoList ?? [];
      const users = Array.isArray(userList)
        ? userList.map((u) => this.toObject(u))
        : userList && typeof userList === 'object'
          ? [this.toObject(userList)]
          : [];

      rawUsers.push(...users);
      const responseStatusStrg = this.toSafeString(
        root.responseStatusStrg ?? root.responseStatus ?? 'OK',
      ).toUpperCase();
      const currentSearchPosition = this.toSafeNumber(
        root.searchResultPosition,
        position,
      );
      const totalMatches = this.toSafeNumber(root.totalMatches, 0);
      const numOfMatches = this.toSafeNumber(root.numOfMatches, users.length);

      totalFetchedFromDevice += users.length;
      const pageEmployeeNos = users
        .map((user) => this.resolveUserUniqueKey(user))
        .filter((employeeNo): employeeNo is string => Boolean(employeeNo));
      const firstEmployeeNo = pageEmployeeNos[0] ?? 'n/a';
      const lastEmployeeNo =
        pageEmployeeNos[pageEmployeeNos.length - 1] ?? 'n/a';

      for (const user of users) {
        const uniqueKey = this.resolveUserUniqueKey(user);
        if (!uniqueKey) {
          this.logger.warn(
            `Seed preview user query received a device row without employeeNo on page=${page}, position=${position}; skipping unsafe row`,
          );
          continue;
        }

        const existing = uniqueUsers.get(uniqueKey);
        if (!existing) {
          uniqueUsers.set(
            uniqueKey,
            this.normalizeDeviceUserRecord(user, uniqueKey),
          );
          continue;
        }

        duplicatesSkipped += 1;
        uniqueUsers.set(
          uniqueKey,
          this.mergeDeviceUserRecords(existing, user, uniqueKey),
        );
      }

      const effectiveMatches = numOfMatches > 0 ? numOfMatches : users.length;
      const nextPosition = currentSearchPosition + effectiveMatches;
      const hasMoreByStatus = responseStatusStrg === 'MORE';
      const hasMoreByTotal = totalMatches > 0 && nextPosition < totalMatches;

      this.logger.log(
        `Seed preview user page ${page} for device ${deviceId}: position=${currentSearchPosition}, pageUsers=${users.length}, totalFetched=${totalFetchedFromDevice}, uniqueCollected=${uniqueUsers.size}, duplicatesSkipped=${duplicatesSkipped}, totalMatches=${totalMatches}, nextPosition=${nextPosition}, firstEmployeeNo=${firstEmployeeNo}, lastEmployeeNo=${lastEmployeeNo}, responseStatus=${responseStatusStrg || 'OK'}`,
      );

      if (!hasMoreByStatus && !hasMoreByTotal) {
        break;
      }

      if (effectiveMatches <= 0) {
        this.logger.warn(
          `Seed preview user query received a continuation signal without any matches at position=${position} for device ${deviceId}; stopping safely`,
        );
        break;
      }

      position = nextPosition;
      page += 1;
    }

    this.logger.log(
      `Seed preview user query completed for device ${deviceId}: totalFetched=${totalFetchedFromDevice}, totalUniqueUsers=${uniqueUsers.size}, duplicatesSkipped=${duplicatesSkipped}`,
    );

    return {
      totalFetchedFromDevice,
      totalUniqueUsers: uniqueUsers.size,
      duplicatesSkipped,
      rawUsers,
      users: [...uniqueUsers.values()],
    };
  }

  private filterByEmployeeNoRange(
    users: Record<string, unknown>[],
    from?: string,
    to?: string,
  ): Record<string, unknown>[] {
    if (!from && !to) return users;
    return users.filter((u) => {
      const no = this.toSafeString(u.employeeNo ?? '');
      if (from && no < from) return false;
      if (to && no > to) return false;
      return true;
    });
  }

  private buildRandomHikvisionSearchId(
    length = HIKVISION_SEARCH_ID_LENGTH,
  ): string {
    const alphabet =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';

    while (result.length < length) {
      result += alphabet[Math.floor(Math.random() * alphabet.length)];
    }

    return result;
  }

  private async buildCardMap(
    companyId: number,
    deviceId: number,
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();

    try {
      const payload = {
        CardInfoSearchCond: {
          searchID: buildAttendanceDeviceSearchId(
            'seed-preview-cards',
            deviceId,
          ),
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
        const empNo = this.toSafeString(card.employeeNo ?? '');
        const cardNo = this.toSafeString(card.cardNo ?? '');
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

  // Returns a map of employeeNo → enrolled slot numbers (e.g. [1, 2, 5]).
  // All 10 slots are probed in parallel per user; users are processed in
  // batches of USER_BATCH_SIZE to avoid overwhelming the device HTTP server.
  private async fetchFingerprintsForUsers(
    companyId: number,
    deviceId: number,
    employeeNos: string[],
  ): Promise<Map<string, number[]>> {
    const result = new Map<string, number[]>();

    for (let i = 0; i < employeeNos.length; i += USER_BATCH_SIZE) {
      const batch = employeeNos.slice(i, i + USER_BATCH_SIZE);

      await Promise.all(
        batch.map(async (employeeNo) => {
          const slots = await this.fetchEnrolledSlotsForUser(
            companyId,
            deviceId,
            employeeNo,
          );
          result.set(employeeNo, slots);
        }),
      );
    }

    return result;
  }

  // Probes all 10 fingerprint slots for one user in parallel.
  // Returns the list of slot numbers that have an enrolled fingerprint.
  private async fetchEnrolledSlotsForUser(
    companyId: number,
    deviceId: number,
    employeeNo: string,
  ): Promise<number[]> {
    const slots = Array.from(
      { length: FP_SLOT_END - FP_SLOT_START + 1 },
      (_, i) => FP_SLOT_START + i,
    );

    const results = await Promise.all(
      slots.map(async (slot) => {
        const enrolled = await this.probeFingerPrintSlot(
          companyId,
          deviceId,
          employeeNo,
          slot,
        );
        return enrolled ? slot : null;
      }),
    );

    return results.filter((s): s is number => s !== null);
  }

  // Returns true when slot contains an enrolled fingerprint, false otherwise.
  // Treats device errors and "not supported" responses as empty (not enrolled).
  private async probeFingerPrintSlot(
    companyId: number,
    deviceId: number,
    employeeNo: string,
    slot: number,
  ): Promise<boolean> {
    try {
      const payload = {
        FingerPrintCond: {
          searchID: buildAttendanceDeviceSearchId(
            'seed-preview-fp',
            deviceId,
            employeeNo,
            String(slot),
          ),
          employeeNo,
          cardReaderNo: FP_CARD_READER_NO,
          fingerPrintID: slot,
        },
      };

      const response = await this.accessControl.uploadFingerprint(
        companyId,
        deviceId,
        payload,
      );

      const raw = JSON.stringify(
        response?.parsed ?? response ?? {},
      ).toLowerCase();

      const negativeMarkers = [
        'notsupport',
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
      if (negativeMarkers.some((m) => raw.includes(m))) return false;

      // A successful response with fingerprint data includes the FingerPrint key
      return response?.ok === true && raw.includes('fingerprint');
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
      !this.namesMatch(name, `${seederEntry.firstName} ${seederEntry.lastName}`)
    ) {
      return 'AMEND';
    }

    return 'EXISTS';
  }

  private namesMatch(a: string, b: string): boolean {
    const normalize = (s: string) =>
      s.toLowerCase().replace(/\s+/g, ' ').trim();
    return normalize(a) === normalize(b);
  }

  private buildSuggestedSeedEntry(
    employeeNo: string,
    name: string | null,
  ): Record<string, unknown> {
    return {
      hikvisionEmployeeNo: employeeNo,
      fullName: name ?? 'UNKNOWN — update manually',
      _suggestedDepartment: 'REVIEW_REQUIRED',
      _suggestedPositionCode: 'REVIEW_REQUIRED',
      _suggestedReportsToEmployeeNo: null,
      _action:
        'Use WRITE_TO_CONSTANTS action to persist into company-structure.constants.ts',
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

  private resolveUserUniqueKey(user: Record<string, unknown>): string | null {
    const candidates = [
      user.employeeNoString,
      user.employeeNo,
      user.hikvisionEmployeeNo,
    ];

    for (const candidate of candidates) {
      const normalized = this.toNullableString(candidate);
      if (normalized) {
        return normalized;
      }
    }

    return null;
  }

  private normalizeDeviceUserRecord(
    user: Record<string, unknown>,
    employeeNo: string,
  ): Record<string, unknown> {
    return this.mergeDeviceUserRecords({}, user, employeeNo);
  }

  private mergeDeviceUserRecords(
    current: Record<string, unknown>,
    incoming: Record<string, unknown>,
    employeeNo: string,
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = {
      ...current,
      ...incoming,
      employeeNo,
      employeeNoString:
        this.toNullableString(incoming.employeeNoString) ??
        this.toNullableString(current.employeeNoString) ??
        employeeNo,
      hikvisionEmployeeNo:
        this.toNullableString(incoming.hikvisionEmployeeNo) ??
        this.toNullableString(current.hikvisionEmployeeNo) ??
        employeeNo,
    };

    if (!this.toNullableString(merged['name'])) {
      merged['name'] =
        this.toNullableString(current.name) ??
        this.toNullableString(incoming.name) ??
        null;
    }

    if (!this.toNullableString(merged['userVerifyMode'])) {
      merged['userVerifyMode'] =
        this.toNullableString(current.userVerifyMode) ??
        this.toNullableString(incoming.userVerifyMode) ??
        null;
    }

    if (!this.toNullableString(merged['password'])) {
      merged['password'] =
        this.toNullableString(current.password) ??
        this.toNullableString(incoming.password) ??
        null;
    }

    const mergedValid = {
      ...this.toObject(current.Valid ?? current.valid),
      ...this.toObject(incoming.Valid ?? incoming.valid),
    };
    if (Object.keys(mergedValid).length > 0) {
      merged['Valid'] = mergedValid;
    }

    return merged;
  }

  private toObject(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private toSafeString(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value).trim();
    }
    return JSON.stringify(value).trim();
  }

  private toNullableString(value: unknown): string | null {
    const normalized = this.toSafeString(value ?? '');
    return normalized.length > 0 ? normalized : null;
  }

  private toSafeNumber(value: unknown, fallback: number): number {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : fallback;
  }

  // Upserts CREATE users as User→CompanyUser→Employee rows and AMENDs department/
  // position on existing employees.  Runs in a transaction; rolls back fully on error.
  private async persistUsers(
    companyId: number,
    deviceId: number,
    toCreate: HikvisionUserPreviewItem[],
    toAmend: HikvisionUserPreviewItem[],
  ): Promise<{ created: number; amended: number }> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    let created = 0;
    let amended = 0;

    try {
      const em = qr.manager;

      // Look up company
      const company = await em.query<{ id: number }[]>(
        `SELECT id FROM companies WHERE id = (
           SELECT company_id FROM company_users WHERE company_id = $1 LIMIT 1
         ) LIMIT 1`,
        [companyId],
      );
      if (!company.length) throw new Error('Company not found');

      const deptId: number | null = null;

      // Hash a default password once for all new users
      const defaultPassword = await bcrypt.hash('Employee123!', 10);

      // ── CREATE ──────────────────────────────────────────────────────────────
      for (const item of toCreate) {
        const userProfile = this.buildDefaultProfile(item);
        const existing = await this.findExistingPersistedUser(
          em,
          companyId,
          deviceId,
          item.employeeNo,
          userProfile.email,
        );

        let userId = existing?.userId ?? null;
        let companyUserId = existing?.companyUserId ?? null;
        let employeeId = existing?.employeeId ?? null;
        let updatedExisting = false;
        let createdEmployee = false;

        if (userId) {
          updatedExisting = await this.updateUserSafeFields(
            em,
            userId,
            userProfile,
          );
        } else {
          const [insertedUser] = await em.query<{ id: number }[]>(
            `INSERT INTO users (user_no, first_name, last_name, email, phone, password, user_type, status, is_email_verified)
             VALUES ($1, $2, $3, $4, $5, $6, 'COMPANY_USER', 'active', true)
             ON CONFLICT (email) DO UPDATE SET first_name = COALESCE(NULLIF(users.first_name, ''), EXCLUDED.first_name), last_name = COALESCE(NULLIF(users.last_name, ''), EXCLUDED.last_name)
             RETURNING id`,
            [
              userProfile.userNo,
              userProfile.firstName,
              userProfile.lastName,
              userProfile.email,
              userProfile.phone,
              defaultPassword,
            ],
          );
          userId = insertedUser.id;
        }

        if (!companyUserId) {
          const [companyUser] = await em.query<{ id: number }[]>(
            `INSERT INTO company_users (company_id, user_id, status, is_default)
             VALUES ($1, $2, 'active', true)
             ON CONFLICT (company_id, user_id) DO UPDATE SET status = 'active'
             RETURNING id`,
            [companyId, userId],
          );
          companyUserId = companyUser.id;
        }

        if (employeeId) {
          updatedExisting =
            (await this.updateEmployeeSafeFields(
              em,
              employeeId,
              item.employeeNo,
              userProfile,
              deviceId,
              deptId,
            )) || updatedExisting;
        } else {
          const existingEmp = await em.query<{ id: number }[]>(
            `SELECT id FROM employees WHERE company_user_id = $1 LIMIT 1`,
            [companyUserId],
          );
          if (existingEmp.length) {
            employeeId = existingEmp[0].id;
            updatedExisting =
              (await this.updateEmployeeSafeFields(
                em,
                employeeId,
                item.employeeNo,
                userProfile,
                deviceId,
                deptId,
              )) || updatedExisting;
          } else {
            const [insertedEmployee] = await em.query<{ id: number }[]>(
              `INSERT INTO employees (company_user_id, employee_no, first_name, last_name,
                 primary_department_id, employment_status, employment_type, hire_date, nationality, metadata)
               VALUES ($1, $2, $3, $4, $5, 'ACTIVE', 'FULL_TIME', '2025-01-01', 'Tanzanian', $6)
               RETURNING id`,
              [
                companyUserId,
                item.employeeNo,
                userProfile.firstName,
                userProfile.lastName,
                deptId,
                JSON.stringify({
                  seeded: true,
                  source: 'hikvision-seed-preview',
                  deviceId,
                }),
              ],
            );
            employeeId = insertedEmployee.id;
            createdEmployee = true;
            created++;
          }
        }

        await this.hikvisionHelper.upsertDeviceIdentity(
          companyId,
          employeeId,
          item.employeeNo,
          deviceId,
          {
            hikvision: {
              source: 'seed-preview',
              full_name: item.fullName,
            },
          },
          em,
        );

        if (!createdEmployee && updatedExisting) {
          amended++;
        }
      }

      // ── AMEND — update department on existing employees ──────────────────
      if (deptId && toAmend.length > 0) {
        for (const item of toAmend) {
          await em.query(
            `UPDATE employees SET primary_department_id = $1
             WHERE employee_no = $2
               AND company_user_id IN (SELECT id FROM company_users WHERE company_id = $3)`,
            [deptId, item.employeeNo, companyId],
          );
          amended++;
        }
      }

      await qr.commitTransaction();
      this.logger.log(
        `persistUsers: created=${created} amended=${amended} for device ${deviceId}`,
      );
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    return { created, amended };
  }

  private buildDefaultProfile(item: HikvisionUserPreviewItem): {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    userNo: string;
  } {
    const nameParts = (item.fullName ?? item.name ?? 'Unknown Employee')
      .trim()
      .split(/\s+/);
    const firstName = nameParts[0] ?? 'Unknown';
    const lastName = nameParts.slice(1).join(' ') || 'Employee';
    const email = this.buildDefaultEmail(firstName, lastName);
    const phone = `+25571${item.employeeNo.replace(/\D/g, '').slice(-7).padStart(7, '0')}`;
    const userNo = `EMP-${item.employeeNo.padStart(5, '0')}`;

    return {
      firstName,
      lastName,
      email,
      phone,
      userNo,
    };
  }

  private buildDefaultEmail(firstName: string, lastName: string): string {
    const slug = (value: string) =>
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return `${slug(firstName)}.${slug(lastName).replace(/-/g, '.')}@alliance.co.tz`;
  }

  private async findExistingPersistedUser(
    em: DataSource['manager'],
    companyId: number,
    deviceId: number,
    employeeNo: string,
    email: string,
  ): Promise<{
    employeeId: number | null;
    companyUserId: number | null;
    userId: number | null;
  } | null> {
    const [byIdentity] = await em.query<
      {
        employeeId: number | null;
        companyUserId: number | null;
        userId: number | null;
      }[]
    >(
      `SELECT
         e.id AS "employeeId",
         cu.id AS "companyUserId",
         cu.user_id AS "userId"
       FROM employee_device_identities edi
       JOIN employees e ON e.id = edi.employee_id
       JOIN company_users cu ON cu.id = e.company_user_id
       WHERE edi.company_id = $1
         AND edi.device_id = $2
         AND edi.employee_no = $3
       LIMIT 1`,
      [companyId, deviceId, employeeNo],
    );
    if (byIdentity) {
      return byIdentity;
    }

    const [byEmployeeNo] = await em.query<
      {
        employeeId: number | null;
        companyUserId: number | null;
        userId: number | null;
      }[]
    >(
      `SELECT
         e.id AS "employeeId",
         cu.id AS "companyUserId",
         cu.user_id AS "userId"
       FROM employees e
       JOIN company_users cu ON cu.id = e.company_user_id
       WHERE cu.company_id = $1
         AND e.employee_no = $2
       LIMIT 1`,
      [companyId, employeeNo],
    );
    if (byEmployeeNo) {
      return byEmployeeNo;
    }

    const [byEmail] = await em.query<
      {
        employeeId: number | null;
        companyUserId: number | null;
        userId: number | null;
      }[]
    >(
      `SELECT
         e.id AS "employeeId",
         cu.id AS "companyUserId",
         cu.user_id AS "userId"
       FROM company_users cu
       JOIN users u ON u.id = cu.user_id
       LEFT JOIN employees e ON e.company_user_id = cu.id
       WHERE cu.company_id = $1
         AND LOWER(u.email) = LOWER($2)
       LIMIT 1`,
      [companyId, email],
    );

    return byEmail ?? null;
  }

  private async updateUserSafeFields(
    em: DataSource['manager'],
    userId: number,
    profile: {
      firstName: string;
      lastName: string;
      phone: string;
    },
  ): Promise<boolean> {
    const [user] = await em.query<
      {
        firstName: string | null;
        lastName: string | null;
        phone: string | null;
      }[]
    >(
      `SELECT
         first_name AS "firstName",
         last_name AS "lastName",
         phone
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId],
    );

    if (!user) {
      return false;
    }

    const nextFirstName =
      this.toNullableString(user.firstName) ?? profile.firstName;
    const nextLastName =
      this.toNullableString(user.lastName) ?? profile.lastName;
    const nextPhone = this.toNullableString(user.phone) ?? profile.phone;

    const changed =
      nextFirstName !== this.toNullableString(user.firstName) ||
      nextLastName !== this.toNullableString(user.lastName) ||
      nextPhone !== this.toNullableString(user.phone);

    if (!changed) {
      return false;
    }

    await em.query(
      `UPDATE users
       SET first_name = $2,
           last_name = $3,
           phone = $4
       WHERE id = $1`,
      [userId, nextFirstName, nextLastName, nextPhone],
    );

    return true;
  }

  private async updateEmployeeSafeFields(
    em: DataSource['manager'],
    employeeId: number,
    employeeNo: string,
    profile: {
      firstName: string;
      lastName: string;
    },
    deviceId: number,
    deptId: number | null,
  ): Promise<boolean> {
    const [employee] = await em.query<
      {
        employeeNo: string | null;
        firstName: string | null;
        lastName: string | null;
        primaryDepartmentId: number | null;
        metadata: Record<string, unknown> | null;
      }[]
    >(
      `SELECT
         employee_no AS "employeeNo",
         first_name AS "firstName",
         last_name AS "lastName",
         primary_department_id AS "primaryDepartmentId",
         metadata
       FROM employees
       WHERE id = $1
       LIMIT 1`,
      [employeeId],
    );

    if (!employee) {
      return false;
    }

    const nextEmployeeNo =
      this.toNullableString(employee.employeeNo) ?? employeeNo;
    const nextFirstName =
      this.toNullableString(employee.firstName) ?? profile.firstName;
    const nextLastName =
      this.toNullableString(employee.lastName) ?? profile.lastName;
    const nextDepartmentId = employee.primaryDepartmentId ?? deptId;
    const nextMetadata = {
      ...(this.toObject(employee.metadata) ?? {}),
      seeded: true,
      source: 'hikvision-seed-preview',
      deviceId,
    };

    const changed =
      nextEmployeeNo !== this.toNullableString(employee.employeeNo) ||
      nextFirstName !== this.toNullableString(employee.firstName) ||
      nextLastName !== this.toNullableString(employee.lastName) ||
      nextDepartmentId !== employee.primaryDepartmentId ||
      JSON.stringify(nextMetadata) !==
        JSON.stringify(employee.metadata ?? null);

    if (!changed) {
      return false;
    }

    await em.query(
      `UPDATE employees
       SET employee_no = $2,
           first_name = $3,
           last_name = $4,
           primary_department_id = $5,
           metadata = $6
       WHERE id = $1`,
      [
        employeeId,
        nextEmployeeNo,
        nextFirstName,
        nextLastName,
        nextDepartmentId,
        JSON.stringify(nextMetadata),
      ],
    );

    return true;
  }

  private writeGeneratedFile(missing: HikvisionUserPreviewItem[]): string {
    const seedsDir = path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      'src',
      'database',
      'seeds',
    );
    const outPath = path.join(
      seedsDir,
      'hikvision-import-preview.generated.ts',
    );

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
