import { readFileSync } from 'fs';
import { resolve } from 'path';
import { DataSource, Repository } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { Branch } from '../../modules/hr/branches/entities/branch.entity';
import { Employee } from '../../modules/hr/employees/entities/employee.entity';
import { AttendanceSetting } from '../../modules/hr/attendance/settings/entities/attendance-setting.entity';
import { AttendancePolicy } from '../../modules/hr/attendance/policies/entities/attendance-policy.entity';
import { HolidayGroup } from '../../modules/hr/attendance/holidays/entities/holiday-group.entity';
import { AttendanceHoliday } from '../../modules/hr/attendance/holidays/entities/holiday.entity';
import { AttendanceGeofence } from '../../modules/hr/attendance/geofences/entities/attendance-geofence.entity';
import { AttendanceWifiNetwork } from '../../modules/hr/attendance/wifi-networks/entities/attendance-wifi-network.entity';
import { AttendanceCheckpoint } from '../../modules/hr/attendance/checkpoints/entities/attendance-checkpoint.entity';
import { AttendanceDevice } from '../../modules/access-control/attendance-devices/entities/attendance-device.entity';
import { Shift } from '../../modules/hr/attendance/shift/shifts/entities/shift.entity';
import { ShiftBreak } from '../../modules/hr/attendance/shift/shift-breaks/entities/shift-break.entity';
import { ShiftAttendanceRule } from '../../modules/hr/attendance/shift/shift-attendance-rules/entities/shift-attendance-rule.entity';
import { ShiftOvertimeRule } from '../../modules/hr/attendance/shift/shift-overtime-rules/entities/shift-overtime-rule.entity';
import { ShiftAssignment } from '../../modules/hr/attendance/shift/shift-assignments/entities/shift-assignment.entity';
import { ShiftRotationGroup } from '../../modules/hr/attendance/shift/shift-rotation-groups/entities/shift-rotation-group.entity';
import { ShiftRotationRule } from '../../modules/hr/attendance/shift/shift-rotation-rules/entities/shift-rotation-rule.entity';
import { ShiftTemplate } from '../../modules/hr/attendance/shift/shift-templates/entities/shift-template.entity';
import { Timetable } from '../../modules/hr/attendance/timetable/timetables/entities/timetable.entity';
import { TimetableDay } from '../../modules/hr/attendance/timetable/timetable-days/entities/timetable-day.entity';
import { TimetableShiftRule } from '../../modules/hr/attendance/timetable/timetable-shift-rules/entities/timetable-shift-rule.entity';
import { TimetableRotation } from '../../modules/hr/attendance/timetable/timetable-rotations/entities/timetable-rotation.entity';
import { TimetableRotationRule } from '../../modules/hr/attendance/timetable/timetable-rotation-rules/entities/timetable-rotation-rule.entity';
import { TimetableHolidayRule } from '../../modules/hr/attendance/timetable/timetable-holiday-rules/entities/timetable-holiday-rule.entity';
import { TimetableAttendanceRule } from '../../modules/hr/attendance/timetable/timetable-attendance-rules/entities/timetable-attendance-rule.entity';

type SeedData = {
  metadata: {
    company_name: string;
    branch_code: string;
  };
  attendance_settings: any[];
  attendance_policies: any[];
  holiday_groups: any[];
  attendance_holidays: any[];
  attendance_geofences: any[];
  attendance_wifi_networks: any[];
  attendance_devices: any[];
  attendance_checkpoints: any[];
  shifts: any[];
  shift_breaks: any[];
  shift_attendance_rules: any[];
  shift_overtime_rules: any[];
  shift_templates: any[];
  shift_rotation_groups: any[];
  shift_rotation_rules: any[];
  employees: any[];
  shift_assignments: any[];
  timetables: any[];
  timetable_days: any[];
  timetable_shift_rules: any[];
  timetable_rotations: any[];
  timetable_rotation_rules: any[];
  timetable_holiday_rules: any[];
  timetable_attendance_rules: any[];
};

export default class AttendanceSampleDataSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void factoryManager;

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const manager = queryRunner.manager;
      const data = this.loadSeedData();

      const companyRepo = manager.getRepository(Company);
      const branchRepo = manager.getRepository(Branch);
      const employeeRepo = manager.getRepository(Employee);
      const settingRepo = manager.getRepository(AttendanceSetting);
      const policyRepo = manager.getRepository(AttendancePolicy);
      const holidayGroupRepo = manager.getRepository(HolidayGroup);
      const holidayRepo = manager.getRepository(AttendanceHoliday);
      const geofenceRepo = manager.getRepository(AttendanceGeofence);
      const wifiRepo = manager.getRepository(AttendanceWifiNetwork);
      const deviceRepo = manager.getRepository(AttendanceDevice);
      const checkpointRepo = manager.getRepository(AttendanceCheckpoint);
      const shiftRepo = manager.getRepository(Shift);
      const shiftBreakRepo = manager.getRepository(ShiftBreak);
      const shiftAttendanceRuleRepo = manager.getRepository(ShiftAttendanceRule);
      const shiftOvertimeRuleRepo = manager.getRepository(ShiftOvertimeRule);
      const shiftTemplateRepo = manager.getRepository(ShiftTemplate);
      const shiftRotationGroupRepo = manager.getRepository(ShiftRotationGroup);
      const shiftRotationRuleRepo = manager.getRepository(ShiftRotationRule);
      const shiftAssignmentRepo = manager.getRepository(ShiftAssignment);
      const timetableRepo = manager.getRepository(Timetable);
      const timetableDayRepo = manager.getRepository(TimetableDay);
      const timetableShiftRuleRepo = manager.getRepository(TimetableShiftRule);
      const timetableRotationRepo = manager.getRepository(TimetableRotation);
      const timetableRotationRuleRepo = manager.getRepository(TimetableRotationRule);
      const timetableHolidayRuleRepo = manager.getRepository(TimetableHolidayRule);
      const timetableAttendanceRuleRepo = manager.getRepository(TimetableAttendanceRule);

      const company = await this.requireCompany(companyRepo, data.metadata.company_name);
      const branch = await this.requireBranch(branchRepo, company.id, data.metadata.branch_code);
      const employeesByNo = await this.loadEmployeesByNo(
        employeeRepo,
        company.id,
        data.employees.map((employee) => employee.employee_no),
      );
      const defaultCompanyUserId =
        employeesByNo.get(data.employees[0]?.employee_no)?.company_user_id ?? null;

      for (const item of data.attendance_settings) {
        await this.upsertAttendanceSetting(settingRepo, company.id, item);
      }

      const policiesByName = new Map<string, AttendancePolicy>();
      for (const item of data.attendance_policies) {
        const policy = await this.upsertAttendancePolicy(policyRepo, company.id, item);
        policiesByName.set(policy.name, policy);
      }

      const holidayGroupsByName = new Map<string, HolidayGroup>();
      for (const item of data.holiday_groups) {
        const holidayGroup = await this.upsertHolidayGroup(holidayGroupRepo, company.id, item);
        holidayGroupsByName.set(holidayGroup.name, holidayGroup);
      }

      const holidaysByName = new Map<string, AttendanceHoliday>();
      for (const item of data.attendance_holidays) {
        const holidayGroup = this.requireMap(holidayGroupsByName, item.holiday_group_name, 'Holiday group');
        const holiday = await this.upsertHoliday(
          holidayRepo,
          company.id,
          holidayGroup.id,
          branch.id,
          item,
        );
        holidaysByName.set(item.name, holiday);
      }

      const geofencesByName = new Map<string, AttendanceGeofence>();
      for (const item of data.attendance_geofences) {
        const geofence = await this.upsertGeofence(geofenceRepo, company.id, branch.id, item);
        geofencesByName.set(geofence.name, geofence);
      }

      const wifiNetworksByName = new Map<string, AttendanceWifiNetwork>();
      for (const item of data.attendance_wifi_networks) {
        const wifiNetwork = await this.upsertWifiNetwork(wifiRepo, company.id, branch.id, item);
        wifiNetworksByName.set(wifiNetwork.name, wifiNetwork);
      }

      const devicesByName = new Map<string, AttendanceDevice>();
      for (const item of data.attendance_devices) {
        const device = await this.upsertAttendanceDevice(deviceRepo, company.id, branch.id, item);
        devicesByName.set(item.name, device);
      }

      for (const item of data.attendance_checkpoints) {
        await this.upsertCheckpoint(
          checkpointRepo,
          this.requireMap(policiesByName, item.policy_name, 'Attendance policy').id,
          geofencesByName.get(item.geofence_name ?? ''),
          wifiNetworksByName.get(item.wifi_network_name ?? ''),
          devicesByName.get(item.device_name ?? ''),
          item,
        );
      }

      const shiftsByCode = new Map<string, Shift>();
      for (const item of data.shifts) {
        const shift = await this.upsertShift(
          shiftRepo,
          company.id,
          branch.id,
          defaultCompanyUserId,
          item,
        );
        shiftsByCode.set(shift.code, shift);
      }

      for (const item of data.shift_breaks) {
        await this.upsertShiftBreak(
          shiftBreakRepo,
          this.requireMap(shiftsByCode, item.shift_code, 'Shift').id,
          item,
        );
      }

      for (const item of data.shift_attendance_rules) {
        await this.upsertShiftAttendanceRule(
          shiftAttendanceRuleRepo,
          this.requireMap(shiftsByCode, item.shift_code, 'Shift').id,
          item,
        );
      }

      for (const item of data.shift_overtime_rules) {
        await this.upsertShiftOvertimeRule(
          shiftOvertimeRuleRepo,
          this.requireMap(shiftsByCode, item.shift_code, 'Shift').id,
          item,
        );
      }

      for (const item of data.shift_templates) {
        await this.upsertShiftTemplate(shiftTemplateRepo, company.id, item);
      }

      const shiftRotationGroupsByCode = new Map<string, ShiftRotationGroup>();
      for (const item of data.shift_rotation_groups) {
        const rotationGroup = await this.upsertShiftRotationGroup(
          shiftRotationGroupRepo,
          company.id,
          item,
        );
        shiftRotationGroupsByCode.set(rotationGroup.code, rotationGroup);
      }

      for (const item of data.shift_rotation_rules) {
        await this.upsertShiftRotationRule(
          shiftRotationRuleRepo,
          this.requireMap(
            shiftRotationGroupsByCode,
            item.rotation_group_code,
            'Shift rotation group',
          ).id,
          shiftsByCode.get(item.shift_code ?? '') ?? null,
          item,
        );
      }

      for (const item of data.shift_assignments) {
        await this.upsertShiftAssignment(
          shiftAssignmentRepo,
          company.id,
          this.requireMap(employeesByNo, item.employee_no, 'Employee').id,
          this.requireMap(shiftsByCode, item.shift_code, 'Shift').id,
          shiftRotationGroupsByCode.get(item.rotation_group_code ?? '') ?? null,
          defaultCompanyUserId,
          item,
        );
      }

      const timetablesByCode = new Map<string, Timetable>();
      for (const item of data.timetables) {
        const timetable = await this.upsertTimetable(
          timetableRepo,
          company.id,
          branch.id,
          employeesByNo.get(item.created_by_employee_no ?? '')?.company_user_id ?? defaultCompanyUserId,
          item,
        );
        timetablesByCode.set(timetable.code, timetable);
      }

      const timetableDaysByKey = new Map<string, TimetableDay>();
      for (const item of data.timetable_days) {
        const timetable = this.requireMap(timetablesByCode, item.timetable_code, 'Timetable');
        const day = await this.upsertTimetableDay(
          timetableDayRepo,
          timetable.id,
          shiftsByCode.get(item.default_shift_code ?? '') ?? null,
          item,
        );
        timetableDaysByKey.set(this.buildTimetableDayKey(item.timetable_code, item.day_of_week), day);
      }

      for (const item of data.timetable_shift_rules) {
        const timetableDay = this.requireMap(
          timetableDaysByKey,
          this.buildTimetableDayKey(item.timetable_code, item.day_of_week),
          'Timetable day',
        );
        await this.upsertTimetableShiftRule(
          timetableShiftRuleRepo,
          timetableDay.id,
          this.requireMap(shiftsByCode, item.shift_code, 'Shift').id,
          item,
        );
      }

      const timetableRotationsByKey = new Map<string, TimetableRotation>();
      for (const item of data.timetable_rotations) {
        const timetable = this.requireMap(timetablesByCode, item.timetable_code, 'Timetable');
        const rotation = await this.upsertTimetableRotation(
          timetableRotationRepo,
          company.id,
          timetable.id,
          item,
        );
        timetableRotationsByKey.set(this.buildTimetableRotationKey(item.timetable_code, item.name), rotation);
      }

      for (const item of data.timetable_rotation_rules) {
        const rotation = this.requireMap(
          timetableRotationsByKey,
          this.buildTimetableRotationKey(item.timetable_code, item.rotation_name),
          'Timetable rotation',
        );
        await this.upsertTimetableRotationRule(
          timetableRotationRuleRepo,
          rotation.id,
          shiftsByCode.get(item.shift_code ?? '') ?? null,
          item,
        );
      }

      for (const item of data.timetable_holiday_rules) {
        await this.upsertTimetableHolidayRule(
          timetableHolidayRuleRepo,
          this.requireMap(timetablesByCode, item.timetable_code, 'Timetable').id,
          this.requireMap(holidayGroupsByName, item.holiday_group_name, 'Holiday group').id,
          item,
        );
      }

      for (const item of data.timetable_attendance_rules) {
        await this.upsertTimetableAttendanceRule(
          timetableAttendanceRuleRepo,
          this.requireMap(timetablesByCode, item.timetable_code, 'Timetable').id,
          item,
        );
      }

      await queryRunner.commitTransaction();
      console.log(
        `[Seeder][AttendanceSampleData] Seeded attendance sample master data for ${company.name}`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('[Seeder][AttendanceSampleData] Failed:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private loadSeedData(): SeedData {
    const filePath = resolve(process.cwd(), 'src/database/seeds/attendance-sample-data.json');
    return JSON.parse(readFileSync(filePath, 'utf8')) as SeedData;
  }

  private async requireCompany(
    companyRepo: Repository<Company>,
    companyName: string,
  ): Promise<Company> {
    const company = await companyRepo.findOne({ where: { name: companyName } });
    if (!company) {
      throw new Error(`Company "${companyName}" not found. Run base seeders first.`);
    }
    return company;
  }

  private async requireBranch(
    branchRepo: Repository<Branch>,
    companyId: number,
    branchCode: string,
  ): Promise<Branch> {
    const branch = await branchRepo.findOne({
      where: { company_id: companyId, code: branchCode },
    });
    if (!branch) {
      throw new Error(`Branch "${branchCode}" not found for the seeded company.`);
    }
    return branch;
  }

  private async loadEmployeesByNo(
    employeeRepo: Repository<Employee>,
    companyId: number,
    employeeNos: string[],
  ): Promise<Map<string, Employee>> {
    const employees = await employeeRepo
      .createQueryBuilder('employee')
      .innerJoinAndSelect('employee.company_user', 'companyUser')
      .where('employee.employee_no IN (:...employeeNos)', { employeeNos })
      .andWhere('companyUser.company_id = :companyId', { companyId })
      .getMany();

    const employeesByNo = new Map<string, Employee>();
    for (const employee of employees) {
      employeesByNo.set(employee.employee_no, employee);
    }

    for (const employeeNo of employeeNos) {
      if (!employeesByNo.has(employeeNo)) {
        throw new Error(`Employee "${employeeNo}" was not found for attendance sample data.`);
      }
    }

    return employeesByNo;
  }

  private requireMap<T>(map: Map<string, T>, key: string, label: string): T {
    const value = map.get(key);
    if (!value) {
      throw new Error(`${label} "${key}" could not be resolved while seeding attendance sample data.`);
    }
    return value;
  }

  private buildTimetableDayKey(timetableCode: string, dayOfWeek: number): string {
    return `${timetableCode}::${dayOfWeek}`;
  }

  private buildTimetableRotationKey(timetableCode: string, rotationName: string): string {
    return `${timetableCode}::${rotationName}`;
  }

  private toDecimalString(value: number): string {
    return Number(value).toFixed(2);
  }

  private toDate(value?: string | null): Date | null {
    return value ? new Date(value) : null;
  }

  private async upsertAttendanceSetting(
    repo: Repository<AttendanceSetting>,
    companyId: number,
    item: any,
  ): Promise<AttendanceSetting> {
    let record = await repo.findOne({ where: { companyId, name: item.name } });
    if (!record) {
      record = repo.create({ companyId, name: item.name });
    }

    record.overtimeStartAfterMinutes = item.overtime_start_after_minutes;
    record.maxOvertimeMinutesPerDay = item.max_overtime_minutes_per_day;
    record.maxOvertimeMinutesPerMonth = item.max_overtime_minutes_per_month;
    record.overtimeRateMultiplier = this.toDecimalString(item.overtime_rate_multiplier);
    record.holidayOvertimeMultiplier = this.toDecimalString(item.holiday_overtime_multiplier);
    record.weekendOvertimeMultiplier = this.toDecimalString(item.weekend_overtime_multiplier);
    record.requiresApproval = item.requires_approval;
    record.autoCalculate = item.auto_calculate;

    return repo.save(record);
  }

  private async upsertAttendancePolicy(
    repo: Repository<AttendancePolicy>,
    companyId: number,
    item: any,
  ): Promise<AttendancePolicy> {
    let record = await repo.findOne({ where: { company_id: companyId, name: item.name } });
    if (!record) {
      record = repo.create({ company_id: companyId, name: item.name });
    }

    record.is_active = item.is_active;
    record.late_after_minutes = item.late_after_minutes;
    record.half_day_after_minutes = item.half_day_after_minutes;
    record.absent_after_minutes = item.absent_after_minutes;
    record.allow_early_checkin = item.allow_early_checkin;
    record.allow_late_checkout = item.allow_late_checkout;
    record.auto_absent_if_no_checkin = item.auto_absent_if_no_checkin;
    record.requires_manager_approval_for_overtime = item.requires_manager_approval_for_overtime;
    record.rounding_mode = item.rounding_mode;
    record.max_missing_punch_allowed = item.max_missing_punch_allowed;
    record.weekend_days = item.weekend_days;
    record.auto_mark_weekend_as_off = item.auto_mark_weekend_as_off;
    record.treat_weekend_as_absent_if_scheduled = item.treat_weekend_as_absent_if_scheduled;
    record.holiday_policy_mode = item.holiday_policy_mode;
    record.authentication_modes = item.authentication_modes;
    record.require_geo_fencing = item.require_geo_fencing;
    record.allow_multi_device_login = item.allow_multi_device_login;
    record.auto_calculate_attendance = item.auto_calculate_attendance;
    record.calculation_time = item.calculation_time;
    record.grace_period_minutes = item.grace_period_minutes;
    record.consider_shift_roster = item.consider_shift_roster;
    record.ignore_missing_checkout_if_hours_valid = item.ignore_missing_checkout_if_hours_valid;

    return repo.save(record);
  }

  private async upsertHolidayGroup(
    repo: Repository<HolidayGroup>,
    companyId: number,
    item: any,
  ): Promise<HolidayGroup> {
    let record = await repo.findOne({ where: { companyId, name: item.name } });
    if (!record) {
      record = repo.create({ companyId, name: item.name });
    }

    record.description = item.description ?? null;
    return repo.save(record);
  }

  private async upsertHoliday(
    repo: Repository<AttendanceHoliday>,
    companyId: number,
    holidayGroupId: number,
    branchId: number | null,
    item: any,
  ): Promise<AttendanceHoliday> {
    let record = await repo.findOne({
      where: {
        holidayGroupId,
        name: item.name,
        date: item.date,
      },
    });
    if (!record) {
      record = repo.create({
        companyId,
        holidayGroupId,
        name: item.name,
        date: item.date,
      });
    }

    record.companyId = companyId;
    record.holidayGroupId = holidayGroupId;
    record.branchId = branchId;
    record.isRecurring = item.is_recurring;
    record.type = item.type;
    record.isPaid = item.is_paid;
    record.affectsOvertime = item.affects_overtime;
    record.countsAsWorkingDay = item.counts_as_working_day;

    return repo.save(record);
  }

  private async upsertGeofence(
    repo: Repository<AttendanceGeofence>,
    companyId: number,
    branchId: number | null,
    item: any,
  ): Promise<AttendanceGeofence> {
    let record = await repo.findOne({ where: { companyId, name: item.name } });
    if (!record) {
      record = repo.create({ companyId, name: item.name });
    }

    record.branchId = branchId;
    record.description = item.description ?? null;
    record.type = item.type;
    record.latitude = String(item.latitude);
    record.longitude = String(item.longitude);
    record.radiusMeters = item.radius_meters;
    record.allowedAccuracyMeters = item.allowed_accuracy_meters;
    record.strictAccuracy = item.strict_accuracy;
    record.polygonCoordinates = item.polygon_coordinates ?? null;
    record.status = item.status;

    return repo.save(record);
  }

  private async upsertWifiNetwork(
    repo: Repository<AttendanceWifiNetwork>,
    companyId: number,
    branchId: number | null,
    item: any,
  ): Promise<AttendanceWifiNetwork> {
    let record = await repo.findOne({ where: { companyId, ssid: item.ssid } });
    if (!record) {
      record = repo.create({ companyId, ssid: item.ssid });
    }

    record.branchId = branchId;
    record.name = item.name;
    record.description = item.description ?? null;
    record.bssid = item.bssid ?? null;
    record.allowedIpCidrs = item.allowed_ip_cidrs ?? null;
    record.securityType = item.security_type;
    record.requireSsidMatch = item.require_ssid_match;
    record.requireBssidMatch = item.require_bssid_match;
    record.requireIpMatch = item.require_ip_match;
    record.allowMobileAttendance = item.allow_mobile_attendance;
    record.metadata = item.metadata ?? null;
    record.status = item.status;

    return repo.save(record);
  }

  private async upsertAttendanceDevice(
    repo: Repository<AttendanceDevice>,
    companyId: number,
    branchId: number | null,
    item: any,
  ): Promise<AttendanceDevice> {
    let record = await repo.findOne({ where: { deviceCode: item.device_code } });
    if (!record) {
      record = repo.create({ companyId, deviceCode: item.device_code });
    }

    record.companyId = companyId;
    record.branchId = branchId;
    record.deviceName = item.name;
    record.deviceSerialNumber = item.device_serial_number ?? null;
    record.deviceModel = item.device_model ?? null;
    record.ipAddress = item.ip_address;
    record.port = item.port ?? null;
    record.protocol = item.protocol ?? null;
    record.vendorName = item.vendor_name ?? null;
    record.integrationType = item.integration_type;
    record.authType = item.auth_type;
    record.apiUsername = item.api_username;
    record.apiPassword = item.api_password;
    record.syncMode = item.sync_mode;
    record.status = item.status;
    record.lastSyncAt = this.toDate(item.last_sync_at);
    record.lastHeartbeatAt = this.toDate(item.last_heartbeat_at);
    record.lastListenerAt = this.toDate(item.last_listener_at);
    record.firmwareVersion = item.firmware_version ?? null;
    record.macAddress = item.mac_address ?? null;
    record.deviceType = item.device_type ?? null;
    record.timezone = item.timezone ?? null;
    record.locationDescription = item.location_description ?? null;
    record.metadata = item.metadata ?? null;

    return repo.save(record);
  }

  private async upsertCheckpoint(
    repo: Repository<AttendanceCheckpoint>,
    policySetId: number,
    geofence: AttendanceGeofence | null | undefined,
    wifiNetwork: AttendanceWifiNetwork | null | undefined,
    device: AttendanceDevice | null | undefined,
    item: any,
  ): Promise<AttendanceCheckpoint> {
    let record = await repo.findOne({ where: { policySetId, name: item.name } });
    if (!record) {
      record = repo.create({ policySetId, name: item.name });
    }

    record.type = item.type;
    record.deviceId = device?.id ?? null;
    record.geofenceId = geofence?.id ?? null;
    record.wifiNetworkId = wifiNetwork?.id ?? null;
    record.isRequired = item.is_required;
    record.allowOverride = item.allow_override;
    record.maxDistanceMeters = item.max_distance_meters ?? null;
    record.strictMode = item.strict_mode;
    record.status = item.status;

    return repo.save(record);
  }

  private async upsertShift(
    repo: Repository<Shift>,
    companyId: number,
    branchId: number | null,
    createdBy: number | null,
    item: any,
  ): Promise<Shift> {
    let record = await repo.findOne({ where: { companyId, code: item.code } });
    if (!record) {
      record = repo.create({ companyId, code: item.code });
    }

    record.branchId = branchId;
    record.departmentId = null;
    record.name = item.name;
    record.description = item.description ?? null;
    record.shiftType = item.shift_type;
    record.startTime = item.start_time;
    record.endTime = item.end_time;
    record.expectedWorkMinutes = item.expected_work_minutes;
    record.minimumWorkMinutes = item.minimum_work_minutes;
    record.halfDayMinutes = item.half_day_minutes;
    record.graceInMinutes = item.grace_in_minutes;
    record.graceOutMinutes = item.grace_out_minutes;
    record.lateAfterMinutes = item.late_after_minutes;
    record.earlyLeaveAfterMinutes = item.early_leave_after_minutes;
    record.isNightShift = item.is_night_shift;
    record.crossesMidnight = item.crosses_midnight;
    record.allowOvertime = item.allow_overtime;
    record.maxOvertimeMinutes = item.max_overtime_minutes;
    record.requiresCheckout = item.requires_checkout;
    record.allowEarlyCheckin = item.allow_early_checkin;
    record.allowLateCheckout = item.allow_late_checkout;
    record.status = item.status;
    record.createdBy = createdBy;

    return repo.save(record);
  }

  private async upsertShiftBreak(
    repo: Repository<ShiftBreak>,
    shiftId: number,
    item: any,
  ): Promise<ShiftBreak> {
    let record = await repo.findOne({ where: { shiftId, name: item.name } });
    if (!record) {
      record = repo.create({ shiftId, name: item.name });
    }

    record.breakType = item.break_type;
    record.startTime = item.start_time;
    record.endTime = item.end_time;
    record.durationMinutes = item.duration_minutes;
    record.isPaid = item.is_paid;
    record.isFlexible = item.is_flexible;

    return repo.save(record);
  }

  private async upsertShiftAttendanceRule(
    repo: Repository<ShiftAttendanceRule>,
    shiftId: number,
    item: any,
  ): Promise<ShiftAttendanceRule> {
    let record = await repo.findOne({ where: { shiftId } });
    if (!record) {
      record = repo.create({ shiftId });
    }

    record.lateAfterMinutes = item.late_after_minutes;
    record.absentAfterMinutes = item.absent_after_minutes;
    record.halfDayAfterMinutes = item.half_day_after_minutes;
    record.allowMultipleCheckin = item.allow_multiple_checkin;
    record.autoMarkAbsent = item.auto_mark_absent;
    record.allowMobileAttendance = item.allow_mobile_attendance;
    record.allowRemoteAttendance = item.allow_remote_attendance;
    record.requireGeofence = item.require_geofence;
    record.requireBiometric = item.require_biometric;

    return repo.save(record);
  }

  private async upsertShiftOvertimeRule(
    repo: Repository<ShiftOvertimeRule>,
    shiftId: number,
    item: any,
  ): Promise<ShiftOvertimeRule> {
    let record = await repo.findOne({ where: { shiftId } });
    if (!record) {
      record = repo.create({ shiftId });
    }

    record.overtimeStartAfterMinutes = item.overtime_start_after_minutes;
    record.maxDailyOvertimeMinutes = item.max_daily_overtime_minutes;
    record.overtimeRateMultiplier = this.toDecimalString(item.overtime_rate_multiplier);
    record.weekendMultiplier = this.toDecimalString(item.weekend_multiplier);
    record.holidayMultiplier = this.toDecimalString(item.holiday_multiplier);
    record.requiresApproval = item.requires_approval;
    record.autoCalculate = item.auto_calculate;

    return repo.save(record);
  }

  private async upsertShiftTemplate(
    repo: Repository<ShiftTemplate>,
    companyId: number,
    item: any,
  ): Promise<ShiftTemplate> {
    let record = await repo.findOne({ where: { companyId, name: item.name } });
    if (!record) {
      record = repo.create({ companyId, name: item.name });
    }

    record.templateType = item.template_type;
    record.configuration = item.configuration;
    record.status = item.status;

    return repo.save(record);
  }

  private async upsertShiftRotationGroup(
    repo: Repository<ShiftRotationGroup>,
    companyId: number,
    item: any,
  ): Promise<ShiftRotationGroup> {
    let record = await repo.findOne({ where: { companyId, code: item.code } });
    if (!record) {
      record = repo.create({ companyId, code: item.code });
    }

    record.name = item.name;
    record.cycleDays = item.cycle_days;
    record.description = item.description ?? null;
    record.status = item.status;

    return repo.save(record);
  }

  private async upsertShiftRotationRule(
    repo: Repository<ShiftRotationRule>,
    rotationGroupId: number,
    shift: Shift | null,
    item: any,
  ): Promise<ShiftRotationRule> {
    let record = await repo.findOne({ where: { rotationGroupId, dayIndex: item.day_index } });
    if (!record) {
      record = repo.create({ rotationGroupId, dayIndex: item.day_index });
    }

    record.shiftId = shift?.id ?? null;
    record.isOffDay = item.is_off_day;

    return repo.save(record);
  }

  private async upsertShiftAssignment(
    repo: Repository<ShiftAssignment>,
    companyId: number,
    employeeId: number,
    shiftId: number,
    rotationGroup: ShiftRotationGroup | null,
    assignedBy: number | null,
    item: any,
  ): Promise<ShiftAssignment> {
    let record = await repo.findOne({
      where: {
        companyId,
        employeeId,
        shiftId,
        effectiveFrom: item.effective_from,
      },
    });
    if (!record) {
      record = repo.create({
        companyId,
        employeeId,
        shiftId,
        effectiveFrom: item.effective_from,
      });
    }

    record.effectiveTo = item.effective_to ?? null;
    record.rotationGroupId = rotationGroup?.id ?? null;
    record.isPrimary = item.is_primary;
    record.status = item.status;
    record.assignedBy = assignedBy;

    return repo.save(record);
  }

  private async upsertTimetable(
    repo: Repository<Timetable>,
    companyId: number,
    branchId: number | null,
    createdBy: number | null,
    item: any,
  ): Promise<Timetable> {
    let record = await repo.findOne({ where: { companyId, code: item.code } });
    if (!record) {
      record = repo.create({ companyId, code: item.code });
    }

    record.branchId = branchId;
    record.name = item.name;
    record.description = item.description ?? null;
    record.timetableType = item.timetable_type;
    record.timezone = item.timezone;
    record.isDefault = item.is_default;
    record.status = item.status;
    record.createdBy = createdBy;

    return repo.save(record);
  }

  private async upsertTimetableDay(
    repo: Repository<TimetableDay>,
    timetableId: number,
    defaultShift: Shift | null,
    item: any,
  ): Promise<TimetableDay> {
    let record = await repo.findOne({ where: { timetableId, dayOfWeek: item.day_of_week } });
    if (!record) {
      record = repo.create({ timetableId, dayOfWeek: item.day_of_week });
    }

    record.isWorkingDay = item.is_working_day;
    record.defaultShiftId = defaultShift?.id ?? null;
    record.minimumWorkMinutes = item.minimum_work_minutes;
    record.expectedCheckInTime = item.expected_check_in_time ?? null;
    record.expectedCheckOutTime = item.expected_check_out_time ?? null;
    record.allowFlexibleTime = item.allow_flexible_time;
    record.flexibleStartFrom = item.flexible_start_from ?? null;
    record.flexibleStartTo = item.flexible_start_to ?? null;
    record.overtimeAllowed = item.overtime_allowed;
    record.breakRequired = item.break_required;
    record.breakMinutes = item.break_minutes;

    return repo.save(record);
  }

  private async upsertTimetableShiftRule(
    repo: Repository<TimetableShiftRule>,
    timetableDayId: number,
    shiftId: number,
    item: any,
  ): Promise<TimetableShiftRule> {
    let record = await repo.findOne({
      where: { timetableDayId, priorityOrder: item.priority_order },
    });
    if (!record) {
      record = repo.create({
        timetableDayId,
        priorityOrder: item.priority_order,
      });
    }

    record.shiftId = shiftId;
    record.isPrimary = item.is_primary;
    record.maxEmployees = item.max_employees ?? null;

    return repo.save(record);
  }

  private async upsertTimetableRotation(
    repo: Repository<TimetableRotation>,
    companyId: number,
    timetableId: number,
    item: any,
  ): Promise<TimetableRotation> {
    let record = await repo.findOne({ where: { timetableId, name: item.name } });
    if (!record) {
      record = repo.create({ companyId, timetableId, name: item.name });
    }

    record.companyId = companyId;
    record.cycleDays = item.cycle_days;
    record.description = item.description ?? null;
    record.status = item.status;

    return repo.save(record);
  }

  private async upsertTimetableRotationRule(
    repo: Repository<TimetableRotationRule>,
    rotationId: number,
    shift: Shift | null,
    item: any,
  ): Promise<TimetableRotationRule> {
    let record = await repo.findOne({ where: { rotationId, dayIndex: item.day_index } });
    if (!record) {
      record = repo.create({ rotationId, dayIndex: item.day_index });
    }

    record.shiftId = shift?.id ?? null;
    record.isOffDay = item.is_off_day;

    return repo.save(record);
  }

  private async upsertTimetableHolidayRule(
    repo: Repository<TimetableHolidayRule>,
    timetableId: number,
    holidayGroupId: number,
    item: any,
  ): Promise<TimetableHolidayRule> {
    let record = await repo.findOne({ where: { timetableId, holidayGroupId } });
    if (!record) {
      record = repo.create({ timetableId, holidayGroupId });
    }

    record.actionType = item.action_type;
    record.applyOvertimeRules = item.apply_overtime_rules;
    record.autoMarkOffday = item.auto_mark_offday;

    return repo.save(record);
  }

  private async upsertTimetableAttendanceRule(
    repo: Repository<TimetableAttendanceRule>,
    timetableId: number,
    item: any,
  ): Promise<TimetableAttendanceRule> {
    let record = await repo.findOne({ where: { timetableId } });
    if (!record) {
      record = repo.create({ timetableId });
    }

    record.lateAfterMinutes = item.late_after_minutes;
    record.halfDayAfterMinutes = item.half_day_after_minutes;
    record.absentAfterMinutes = item.absent_after_minutes;
    record.allowEarlyCheckin = item.allow_early_checkin;
    record.allowLateCheckout = item.allow_late_checkout;
    record.autoAbsentIfNoCheckin = item.auto_absent_if_no_checkin;
    record.maxOvertimeMinutes = item.max_overtime_minutes;

    return repo.save(record);
  }
}
