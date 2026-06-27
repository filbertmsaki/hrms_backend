import {
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
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

export interface HikvisionSeedPreviewResult {
  deviceId: number;
  queriedAt: string;
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

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const FP_SLOT_START = 1;
const FP_SLOT_END = 10;
const FP_CARD_READER_NO = 1;
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

    // 5. Fetch fingerprint slots for all filtered users (batched, slots in parallel).
    //    Each user can have up to 10 enrolled fingers; we probe all slots concurrently
    //    per user and process USER_BATCH_SIZE users at a time to avoid flooding device.
    this.logger.log(
      `Fetching fingerprints for ${filtered.length} users (batch=${USER_BATCH_SIZE}, slots=${FP_SLOT_START}-${FP_SLOT_END})`,
    );
    const fingerprintMap = await this.fetchFingerprintsForUsers(
      companyId,
      deviceId,
      filtered.map((u) => String(u.employeeNo ?? '')),
    );

    // 6. Classify each device user
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
      const enrolledSlots = fingerprintMap.get(employeeNo) ?? [];

      const seederEntry = seederMap.get(employeeNo);
      const existsInSeeder = seederEntry !== undefined;

      const action = this.classifyAction(existsInSeeder, name, seederEntry);

      const item: HikvisionUserPreviewItem = {
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

    const missing = users.filter((u) => u.action === 'CREATE');
    const toAmendUsers = users.filter((u) => u.action === 'AMEND');
    const existingInSeeder = users.filter((u) => u.action === 'EXISTS').length;
    const skipped = users.filter((u) => u.action === 'SKIP').length;

    // 6. Optionally persist to DB (only when dryRun is explicitly false)
    let savedToDatabase: { created: number; amended: number } | null = null;
    if (query.saveToDatabase === true && query.dryRun === false) {
      savedToDatabase = await this.persistUsers(
        companyId,
        deviceId,
        missing,
        toAmendUsers,
        query.departmentCode,
      );
    }

    // 7. Optionally write generated file
    let generatedFilePath: string | null = null;
    if (query.writeSeederFile && missing.length > 0) {
      generatedFilePath = await this.writeGeneratedFile(missing);
    }

    return {
      deviceId,
      queriedAt,
      totalDeviceUsers: deviceUsers.length,
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

    await this.hikvisionHelper.findHikvisionDeviceOrFail(companyId, deviceId, false);

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

    const existingNos = new Set(ALLIANCE_EMPLOYEES.map((e) => e.hikvisionEmployeeNo));

    const entries: SyncedEmployeeConstantEntry[] = rows.map((r) => ({
      hikvisionEmployeeNo: r.employeeNo,
      fullName: `${r.firstName} ${r.lastName}`.trim(),
      email: r.email,
      phone: r.phone ?? null,
      departmentCode: r.departmentCode ?? null,
      positionCode: r.positionCode ?? null,
      reportsToEmployeeNo: r.reportsToEmployeeNo ?? null,
      fingerprintCount: Number(r.fingerprintCount),
      hasPin: Boolean(r.hasPin),
    }));

    const newEntries = entries.filter((e) => !existingNos.has(e.hikvisionEmployeeNo));

    const outputFile = await this.writeConstantsFile(entries, newEntries, existingNos);

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

  private async writeConstantsFile(
    all: SyncedEmployeeConstantEntry[],
    newEntries: SyncedEmployeeConstantEntry[],
    existingNos: Set<string>,
  ): Promise<string> {
    const seedsDir = path.resolve(__dirname, '..', '..', '..', 'src', 'database', 'seeds');
    const outPath = path.join(seedsDir, 'hikvision-device-sync.generated.ts');

    const formatEntry = (e: SyncedEmployeeConstantEntry, isNew: boolean) => {
      const marker = isNew ? '// ⚠ NEW — not yet in ALLIANCE_HIKVISION_EMPLOYEES' : '// already in constants';
      const fpNote = e.fingerprintCount > 0
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
      ...all.map((e) => `//   ${formatEntry(e, !existingNos.has(e.hikvisionEmployeeNo))}`),
      `// ];`,
      ``,
      `// ════════════════════════════════════════════════════════════════════════`,
      `// STEP 2 — Copy NEW assign() calls into buildAllianceEmployeeAssignments()`,
      `//          Department/position codes pulled from DB; verify before merging`,
      `// ════════════════════════════════════════════════════════════════════════`,
      `// function body additions:`,
      ...all.map((e) => `//   ${formatAssign(e, !existingNos.has(e.hikvisionEmployeeNo))}`),
      ``,
      `export {}; // keeps TypeScript happy`,
    ];

    fs.writeFileSync(outPath, lines.join('\n'), 'utf-8');
    this.logger.log(`Constants file written: ${outPath} (${all.length} employees, ${newEntries.length} new)`);
    return outPath;
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

      const raw = JSON.stringify(response?.parsed ?? response ?? {}).toLowerCase();

      const negativeMarkers = [
        'notsupport', 'notexist', 'not exist', 'notfound', 'not found',
        'norecord', 'no record', 'nodata', 'no data', 'nomatch', 'no match',
        'no fingerprint', 'fingerprint not found',
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

  // Upserts CREATE users as User→CompanyUser→Employee rows and AMENDs department/
  // position on existing employees.  Runs in a transaction; rolls back fully on error.
  private async persistUsers(
    companyId: number,
    deviceId: number,
    toCreate: HikvisionUserPreviewItem[],
    toAmend: HikvisionUserPreviewItem[],
    departmentCode?: string,
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

      // Look up department if provided
      const deptRows = departmentCode
        ? await em.query<{ id: number }[]>(
            `SELECT id FROM departments WHERE company_id = $1 AND code = $2 LIMIT 1`,
            [companyId, departmentCode],
          )
        : [];
      const deptId = deptRows[0]?.id ?? null;

      // Hash a default password once for all new users
      const defaultPassword = await bcrypt.hash('Employee123!', 10);

      // ── CREATE ──────────────────────────────────────────────────────────────
      for (const item of toCreate) {
        const nameParts = (item.name ?? 'Unknown Employee').trim().split(/\s+/);
        const firstName = nameParts[0] ?? 'Unknown';
        const lastName = nameParts.slice(1).join(' ') || 'Employee';

        const slug = (s: string) =>
          s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const email = `${slug(firstName)}.${slug(lastName).replace(/-/g, '.')}@alliance.co.tz`;
        const phone = `+25571${item.employeeNo.replace(/\D/g, '').slice(-7).padStart(7, '0')}`;
        const userNo = `EMP-${item.employeeNo.padStart(5, '0')}`;

        // Upsert User
        const existingUser = await em.query<{ id: number }[]>(
          `SELECT id FROM users WHERE email = $1 LIMIT 1`,
          [email],
        );
        let userId: number;
        if (existingUser.length) {
          userId = existingUser[0].id;
        } else {
          const [inserted] = await em.query<{ id: number }[]>(
            `INSERT INTO users (user_no, first_name, last_name, email, phone, password, user_type, status, is_email_verified)
             VALUES ($1, $2, $3, $4, $5, $6, 'COMPANY_USER', 'active', true)
             ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name
             RETURNING id`,
            [userNo, firstName, lastName, email, phone, defaultPassword],
          );
          userId = inserted.id;
        }

        // Upsert CompanyUser
        const [cu] = await em.query<{ id: number }[]>(
          `INSERT INTO company_users (company_id, user_id, status, is_default)
           VALUES ($1, $2, 'active', true)
           ON CONFLICT (company_id, user_id) DO UPDATE SET status = 'active'
           RETURNING id`,
          [companyId, userId],
        );

        // Upsert Employee
        const existingEmp = await em.query<{ id: number }[]>(
          `SELECT id FROM employees WHERE company_user_id = $1 LIMIT 1`,
          [cu.id],
        );
        if (existingEmp.length) {
          if (deptId) {
            await em.query(
              `UPDATE employees SET primary_department_id = $1 WHERE id = $2`,
              [deptId, existingEmp[0].id],
            );
          }
        } else {
          await em.query(
            `INSERT INTO employees (company_user_id, employee_no, first_name, last_name,
               primary_department_id, employment_status, employment_type, hire_date, nationality, metadata)
             VALUES ($1, $2, $3, $4, $5, 'ACTIVE', 'FULL_TIME', '2025-01-01', 'Tanzanian', $6)
             ON CONFLICT DO NOTHING`,
            [
              cu.id,
              item.employeeNo,
              firstName,
              lastName,
              deptId,
              JSON.stringify({ seeded: true, source: 'hikvision-seed-preview', deviceId }),
            ],
          );
          created++;
        }

        // Upsert EmployeeDeviceIdentity
        await em.query(
          `INSERT INTO employee_device_identities (company_id, employee_id, employee_no, device_id)
           SELECT $1, e.id, $3, $4
           FROM employees e WHERE e.company_user_id = $2
           ON CONFLICT DO NOTHING`,
          [companyId, cu.id, item.employeeNo, deviceId],
        );
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
