import { DataSource, In, Repository } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { Branch } from '../../modules/hr/branches/entities/branch.entity';
import { Employee } from '../../modules/hr/employees/entities/employee.entity';
import { AttendanceSetting } from '../../modules/hr/attendance/settings/entities/attendance-setting.entity';
import { AttendancePolicy } from '../../modules/hr/attendance/policies/entities/attendance-policy.entity';
import { AttendanceHolidayPolicyModeEnum } from '../../modules/hr/attendance/policies/enums/attendance-holiday-policy-mode.enum';
import { AttendanceRoundingModeEnum } from '../../modules/hr/attendance/policies/enums/attendance-rounding-mode.enum';
import { HolidayGroup } from '../../modules/hr/attendance/holidays/entities/holiday-group.entity';
import { AttendanceHoliday } from '../../modules/hr/attendance/holidays/entities/holiday.entity';
import { AttendanceHolidayTypeEnum } from '../../modules/hr/attendance/holidays/enums/attendance-holiday-type.enum';
import { AttendanceGeofence } from '../../modules/hr/attendance/geofences/entities/attendance-geofence.entity';
import { AttendanceGeofenceStatusEnum } from '../../modules/hr/attendance/geofences/enums/attendance-geofence-status.enum';
import { AttendanceGeofenceTypeEnum } from '../../modules/hr/attendance/geofences/enums/attendance-geofence-type.enum';
import { AttendanceWifiNetwork } from '../../modules/hr/attendance/wifi-networks/entities/attendance-wifi-network.entity';
import { AttendanceWifiNetworkStatusEnum } from '../../modules/hr/attendance/wifi-networks/enums/attendance-wifi-network-status.enum';
import { AttendanceWifiSecurityTypeEnum } from '../../modules/hr/attendance/wifi-networks/enums/attendance-wifi-security-type.enum';
import { AttendanceCheckpoint } from '../../modules/hr/attendance/checkpoints/entities/attendance-checkpoint.entity';
import { AttendanceCheckpointStatusEnum } from '../../modules/hr/attendance/checkpoints/enums/attendance-checkpoint-status.enum';
import { AttendanceCheckpointTypeEnum } from '../../modules/hr/attendance/checkpoints/enums/attendance-checkpoint-type.enum';
import { AttendanceDevice } from '../../modules/access-control/attendance-devices/entities/attendance-device.entity';
import { AttendanceDeviceStatusEnum } from '../../modules/access-control/attendance-devices/enums/attendance-device-status.enum';
import { Shift } from '../../modules/hr/attendance/shift/shifts/entities/shift.entity';
import { ShiftStatusEnum } from '../../modules/hr/attendance/shift/shifts/enums/shift-status.enum';
import { ShiftTypeEnum } from '../../modules/hr/attendance/shift/shifts/enums/shift-type.enum';
import { ShiftBreak } from '../../modules/hr/attendance/shift/shift-breaks/entities/shift-break.entity';
import { ShiftBreakTypeEnum } from '../../modules/hr/attendance/shift/shift-breaks/enums/shift-break-type.enum';
import { ShiftAttendanceRule } from '../../modules/hr/attendance/shift/shift-attendance-rules/entities/shift-attendance-rule.entity';
import { ShiftOvertimeRule } from '../../modules/hr/attendance/shift/shift-overtime-rules/entities/shift-overtime-rule.entity';
import { ShiftAssignment } from '../../modules/hr/attendance/shift/shift-assignments/entities/shift-assignment.entity';
import { ShiftAssignmentStatusEnum } from '../../modules/hr/attendance/shift/shift-assignments/enums/shift-assignment-status.enum';
import { ShiftSchedule } from '../../modules/hr/attendance/shift/shift-schedules/entities/shift-schedule.entity';
import { AttendanceMobilePunch } from '../../modules/hr/attendance/mobile-punches/entities/attendance-mobile-punch.entity';
import { AttendancePunchSourceEnum } from '../../modules/hr/attendance/mobile-punches/enums/attendance-punch-source.enum';
import { AttendancePunchTypeEnum } from '../../modules/hr/attendance/mobile-punches/enums/attendance-punch-type.enum';
import { AttendancePunchValidationStatusEnum } from '../../modules/hr/attendance/mobile-punches/enums/attendance-punch-validation-status.enum';
import { AttendanceDailySummary } from '../../modules/hr/attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceDailyStatusEnum } from '../../modules/hr/attendance/processing/enums/attendance-daily-status.enum';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_EMPLOYEES,
} from './company-structure.constants';

type ShiftCatalog = {
  standard: Shift;
  support: Shift;
};

type PunchScenario = {
  punchType: AttendancePunchTypeEnum;
  time: string;
  validationStatus: AttendancePunchValidationStatusEnum;
  isOverrideRequested?: boolean;
  validationMessage?: string;
};

type SummaryScenario = {
  shift: Shift;
  branchId: number;
  holidayId?: number | null;
  isOffDay?: boolean;
  remarks?: string | null;
  punches: PunchScenario[];
};

const ATTENDANCE_SETTING_NAME = 'Alliance Default Attendance Settings';
const ATTENDANCE_POLICY_NAME = 'Alliance Standard Attendance Policy';
const HOLIDAY_GROUP_NAME = 'Alliance Shared Holiday Calendar';
const HOLIDAY_NAME = 'Alliance Staff Wellness Day';
const GEOFENCE_NAME = 'Alliance HQ Main Office';
const WIFI_NAME = 'Alliance HQ Staff WiFi';
const WIFI_SSID = 'Alliance-HQ-Staff';
const WIFI_BSSID = '70:4D:7B:AA:11:22';
const STANDARD_SHIFT_CODE = 'ATT_STD_DAY';
const SUPPORT_SHIFT_CODE = 'ATT_SUP_DAY';

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
      const companyRepo = manager.getRepository(Company);
      const branchRepo = manager.getRepository(Branch);
      const employeeRepo = manager.getRepository(Employee);
      const settingRepo = manager.getRepository(AttendanceSetting);
      const policyRepo = manager.getRepository(AttendancePolicy);
      const holidayGroupRepo = manager.getRepository(HolidayGroup);
      const holidayRepo = manager.getRepository(AttendanceHoliday);
      const geofenceRepo = manager.getRepository(AttendanceGeofence);
      const wifiRepo = manager.getRepository(AttendanceWifiNetwork);
      const checkpointRepo = manager.getRepository(AttendanceCheckpoint);
      const deviceRepo = manager.getRepository(AttendanceDevice);
      const shiftRepo = manager.getRepository(Shift);
      const shiftBreakRepo = manager.getRepository(ShiftBreak);
      const shiftAttendanceRuleRepo = manager.getRepository(ShiftAttendanceRule);
      const shiftOvertimeRuleRepo = manager.getRepository(ShiftOvertimeRule);
      const shiftAssignmentRepo = manager.getRepository(ShiftAssignment);
      const shiftScheduleRepo = manager.getRepository(ShiftSchedule);
      const mobilePunchRepo = manager.getRepository(AttendanceMobilePunch);
      const dailySummaryRepo = manager.getRepository(AttendanceDailySummary);

      const company = await this.findCompany(companyRepo);
      const branch = await this.findHeadOfficeBranch(branchRepo, company.id);
      const employees = await this.findAttendanceEmployees(employeeRepo, company.id);
      const primaryApproverCompanyUserId = employees[0].company_user_id;
      const device = await deviceRepo.findOne({
        where: { companyId: company.id, status: AttendanceDeviceStatusEnum.ACTIVE },
        order: { id: 'ASC' },
      });

      await this.ensureAttendanceSetting(settingRepo, company.id);
      const policy = await this.ensureAttendancePolicy(policyRepo, company.id);
      const holidayGroup = await this.ensureHolidayGroup(holidayGroupRepo, company.id);

      const recentWeekdays = this.getRecentWeekdays(5);
      const holidayDate = recentWeekdays[0];
      const workingDates = recentWeekdays.slice(1);
      const offDayDate = this.getMostRecentSaturday();

      const holiday = await this.ensureHoliday(
        holidayRepo,
        company.id,
        holidayGroup.id,
        branch.id,
        holidayDate,
      );
      const geofence = await this.ensureGeofence(geofenceRepo, company.id, branch.id);
      const wifiNetwork = await this.ensureWifiNetwork(wifiRepo, company.id, branch.id);

      await this.ensureCheckpoint(
        checkpointRepo,
        policy.id,
        'HQ GPS Checkpoint',
        AttendanceCheckpointTypeEnum.GPS,
        {
          geofenceId: geofence.id,
          isRequired: true,
          allowOverride: true,
          maxDistanceMeters: 150,
          strictMode: false,
        },
      );
      await this.ensureCheckpoint(
        checkpointRepo,
        policy.id,
        'HQ WiFi Checkpoint',
        AttendanceCheckpointTypeEnum.WIFI,
        {
          wifiNetworkId: wifiNetwork.id,
          isRequired: false,
          allowOverride: true,
          maxDistanceMeters: null,
          strictMode: false,
        },
      );
      if (device) {
        await this.ensureCheckpoint(
          checkpointRepo,
          policy.id,
          'Main Biometric Device',
          AttendanceCheckpointTypeEnum.DEVICE,
          {
            deviceId: device.id,
            isRequired: false,
            allowOverride: false,
            maxDistanceMeters: null,
            strictMode: true,
          },
        );
      }

      const shifts = await this.ensureShifts(
        shiftRepo,
        shiftBreakRepo,
        shiftAttendanceRuleRepo,
        shiftOvertimeRuleRepo,
        company.id,
        branch.id,
        primaryApproverCompanyUserId,
      );

      const employeeShiftMap = new Map<number, Shift>();
      employeeShiftMap.set(employees[0].id, shifts.support);
      for (const employee of employees.slice(1)) {
        employeeShiftMap.set(employee.id, shifts.standard);
      }

      const assignmentStartDate = this.addDays(holidayDate, -7);
      for (const employee of employees) {
        const shift = employeeShiftMap.get(employee.id) ?? shifts.standard;
        await this.ensureShiftAssignment(
          shiftAssignmentRepo,
          company.id,
          employee.id,
          shift.id,
          assignmentStartDate,
          primaryApproverCompanyUserId,
        );
      }

      const employeeScenarios = this.buildEmployeeScenarios(
        employees,
        employeeShiftMap,
        branch.id,
        workingDates,
      );

      for (const employee of employees) {
        const shift = employeeShiftMap.get(employee.id) ?? shifts.standard;

        await this.ensureShiftSchedule(
          shiftScheduleRepo,
          company.id,
          employee.id,
          shift.id,
          holidayDate,
          {
            holidayId: holiday.id,
            isOffDay: false,
            assignedBy: primaryApproverCompanyUserId,
            remarks: 'Seeded company holiday for attendance demo.',
          },
        );

        await this.ensureDailySummary(
          dailySummaryRepo,
          company.id,
          employee.id,
          branch.id,
          holidayDate,
          {
            shift,
            branchId: branch.id,
            holidayId: holiday.id,
            remarks: 'Seeded company holiday for attendance demo.',
            punches: [],
          },
        );
      }

      const offDayEmployee = employees[0];
      await this.ensureShiftSchedule(
        shiftScheduleRepo,
        company.id,
        offDayEmployee.id,
        shifts.support.id,
        offDayDate,
        {
          holidayId: null,
          isOffDay: true,
          assignedBy: primaryApproverCompanyUserId,
          remarks: 'Seeded scheduled off day for attendance demo.',
        },
      );
      await this.ensureDailySummary(
        dailySummaryRepo,
        company.id,
        offDayEmployee.id,
        branch.id,
        offDayDate,
        {
          shift: shifts.support,
          branchId: branch.id,
          holidayId: null,
          isOffDay: true,
          remarks: 'Seeded scheduled off day for attendance demo.',
          punches: [],
        },
      );

      for (const employee of employees) {
        const scenarios = employeeScenarios.get(employee.id) ?? [];

        for (const scenarioEntry of scenarios) {
          await this.ensureShiftSchedule(
            shiftScheduleRepo,
            company.id,
            employee.id,
            scenarioEntry.shift.id,
            scenarioEntry.date,
            {
              holidayId: null,
              isOffDay: false,
              assignedBy: primaryApproverCompanyUserId,
              remarks: scenarioEntry.summary.remarks ?? 'Seeded attendance workday.',
            },
          );

          for (const punch of scenarioEntry.summary.punches) {
            await this.ensureMobilePunch(
              mobilePunchRepo,
              company.id,
              branch.id,
              employee.id,
              policy.id,
              geofence.id,
              wifiNetwork.id,
              employee.employee_no,
              scenarioEntry.date,
              punch,
              primaryApproverCompanyUserId,
            );
          }

          await this.ensureDailySummary(
            dailySummaryRepo,
            company.id,
            employee.id,
            branch.id,
            scenarioEntry.date,
            scenarioEntry.summary,
          );
        }
      }

      await queryRunner.commitTransaction();
      console.log(
        `[Seeder][AttendanceSampleData] Seeded attendance sample records for ${company.name}`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('[Seeder][AttendanceSampleData] Failed:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async findCompany(companyRepo: Repository<Company>): Promise<Company> {
    const company = await companyRepo.findOne({
      where: { name: ALLIANCE_COMPANY_NAME },
    });

    if (!company) {
      throw new Error(
        'Alliance company was not found. Run the base company seeders before attendance sample data.',
      );
    }

    return company;
  }

  private async findHeadOfficeBranch(
    branchRepo: Repository<Branch>,
    companyId: number,
  ): Promise<Branch> {
    const branch = await branchRepo.findOne({
      where: {
        company_id: companyId,
        code: 'HQ',
      },
    });

    if (!branch) {
      throw new Error('HQ branch not found for Alliance sample attendance data.');
    }

    return branch;
  }

  private async findAttendanceEmployees(
    employeeRepo: Repository<Employee>,
    companyId: number,
  ): Promise<Employee[]> {
    const targetEmployeeNos = ALLIANCE_EMPLOYEES.slice(0, 4).map(
      (employee) => employee.employeeNo,
    );

    const employees = await employeeRepo.find({
      where: {
        employee_no: In(targetEmployeeNos),
        company_user: { company_id: companyId },
      },
      relations: ['company_user'],
    });

    const sortedEmployees = targetEmployeeNos
      .map((employeeNo) =>
        employees.find((employee) => employee.employee_no === employeeNo),
      )
      .filter((employee): employee is Employee => !!employee);

    if (sortedEmployees.length !== targetEmployeeNos.length) {
      throw new Error(
        'Expected seeded Alliance employees were not found. Run 002-alliance-company-structure.seed.ts first.',
      );
    }

    return sortedEmployees;
  }

  private async ensureAttendanceSetting(
    settingRepo: Repository<AttendanceSetting>,
    companyId: number,
  ): Promise<AttendanceSetting> {
    let setting = await settingRepo.findOne({
      where: { companyId, name: ATTENDANCE_SETTING_NAME },
    });

    if (!setting) {
      setting = settingRepo.create({ companyId, name: ATTENDANCE_SETTING_NAME });
    }

    setting.overtimeStartAfterMinutes = 30;
    setting.maxOvertimeMinutesPerDay = 180;
    setting.maxOvertimeMinutesPerMonth = 1800;
    setting.overtimeRateMultiplier = '1.50';
    setting.holidayOvertimeMultiplier = '2.00';
    setting.weekendOvertimeMultiplier = '1.75';
    setting.requiresApproval = false;
    setting.autoCalculate = true;

    return settingRepo.save(setting);
  }

  private async ensureAttendancePolicy(
    policyRepo: Repository<AttendancePolicy>,
    companyId: number,
  ): Promise<AttendancePolicy> {
    let policy = await policyRepo.findOne({
      where: { company_id: companyId, name: ATTENDANCE_POLICY_NAME },
    });

    if (!policy) {
      policy = policyRepo.create({
        company_id: companyId,
        name: ATTENDANCE_POLICY_NAME,
      });
    }

    policy.is_active = true;
    policy.late_after_minutes = 10;
    policy.half_day_after_minutes = 240;
    policy.absent_after_minutes = 360;
    policy.allow_early_checkin = true;
    policy.allow_late_checkout = true;
    policy.auto_absent_if_no_checkin = true;
    policy.requires_manager_approval_for_overtime = false;
    policy.rounding_mode = AttendanceRoundingModeEnum.NEAREST;
    policy.max_missing_punch_allowed = 1;
    policy.weekend_days = 'SAT,SUN';
    policy.auto_mark_weekend_as_off = true;
    policy.treat_weekend_as_absent_if_scheduled = false;
    policy.holiday_policy_mode = AttendanceHolidayPolicyModeEnum.OFF;
    policy.authentication_modes = 'MOBILE_APP,WEB,DEVICE';
    policy.require_geo_fencing = true;
    policy.allow_multi_device_login = false;
    policy.auto_calculate_attendance = true;
    policy.calculation_time = '23:30:00';
    policy.grace_period_minutes = 10;
    policy.consider_shift_roster = true;
    policy.ignore_missing_checkout_if_hours_valid = false;

    return policyRepo.save(policy);
  }

  private async ensureHolidayGroup(
    holidayGroupRepo: Repository<HolidayGroup>,
    companyId: number,
  ): Promise<HolidayGroup> {
    let holidayGroup = await holidayGroupRepo.findOne({
      where: { companyId, name: HOLIDAY_GROUP_NAME },
    });

    if (!holidayGroup) {
      holidayGroup = holidayGroupRepo.create({ companyId, name: HOLIDAY_GROUP_NAME });
    }

    holidayGroup.description =
      'Shared holiday sample data used by attendance and leave screens.';

    return holidayGroupRepo.save(holidayGroup);
  }

  private async ensureHoliday(
    holidayRepo: Repository<AttendanceHoliday>,
    companyId: number,
    holidayGroupId: number,
    branchId: number,
    date: string,
  ): Promise<AttendanceHoliday> {
    let holiday = await holidayRepo.findOne({
      where: {
        holidayGroupId,
        name: HOLIDAY_NAME,
        date,
      },
    });

    if (!holiday) {
      holiday = holidayRepo.create({
        companyId,
        holidayGroupId,
        name: HOLIDAY_NAME,
        date,
      });
    }

    holiday.companyId = companyId;
    holiday.holidayGroupId = holidayGroupId;
    holiday.name = HOLIDAY_NAME;
    holiday.date = date;
    holiday.isRecurring = false;
    holiday.type = AttendanceHolidayTypeEnum.COMPANY;
    holiday.isPaid = true;
    holiday.affectsOvertime = false;
    holiday.countsAsWorkingDay = false;
    holiday.branchId = branchId;

    return holidayRepo.save(holiday);
  }

  private async ensureGeofence(
    geofenceRepo: Repository<AttendanceGeofence>,
    companyId: number,
    branchId: number,
  ): Promise<AttendanceGeofence> {
    let geofence = await geofenceRepo.findOne({
      where: { companyId, name: GEOFENCE_NAME },
    });

    if (!geofence) {
      geofence = geofenceRepo.create({ companyId, name: GEOFENCE_NAME });
    }

    geofence.branchId = branchId;
    geofence.description = 'Dar es Salaam head office attendance geofence.';
    geofence.type = AttendanceGeofenceTypeEnum.CIRCLE;
    geofence.latitude = '-6.7923540';
    geofence.longitude = '39.2083280';
    geofence.radiusMeters = 180;
    geofence.allowedAccuracyMeters = 60;
    geofence.strictAccuracy = false;
    geofence.polygonCoordinates = null;
    geofence.status = AttendanceGeofenceStatusEnum.ACTIVE;

    return geofenceRepo.save(geofence);
  }

  private async ensureWifiNetwork(
    wifiRepo: Repository<AttendanceWifiNetwork>,
    companyId: number,
    branchId: number,
  ): Promise<AttendanceWifiNetwork> {
    let wifiNetwork = await wifiRepo.findOne({
      where: {
        companyId,
        ssid: WIFI_SSID,
        bssid: WIFI_BSSID,
      },
    });

    if (!wifiNetwork) {
      wifiNetwork = wifiRepo.create({
        companyId,
        ssid: WIFI_SSID,
        bssid: WIFI_BSSID,
      });
    }

    wifiNetwork.branchId = branchId;
    wifiNetwork.name = WIFI_NAME;
    wifiNetwork.description = 'Primary office WiFi used for attendance check-in demos.';
    wifiNetwork.allowedIpCidrs = ['10.40.10.0/24', '10.40.11.0/24'];
    wifiNetwork.securityType = AttendanceWifiSecurityTypeEnum.WPA2;
    wifiNetwork.requireSsidMatch = true;
    wifiNetwork.requireBssidMatch = false;
    wifiNetwork.requireIpMatch = true;
    wifiNetwork.allowMobileAttendance = true;
    wifiNetwork.metadata = {
      floor: 'Ground Floor',
      vlanId: 40,
      seeded: true,
    };
    wifiNetwork.status = AttendanceWifiNetworkStatusEnum.ACTIVE;

    return wifiRepo.save(wifiNetwork);
  }

  private async ensureCheckpoint(
    checkpointRepo: Repository<AttendanceCheckpoint>,
    policySetId: number,
    name: string,
    type: AttendanceCheckpointTypeEnum,
    input: {
      deviceId?: number | null;
      geofenceId?: number | null;
      wifiNetworkId?: number | null;
      isRequired: boolean;
      allowOverride: boolean;
      maxDistanceMeters: number | null;
      strictMode: boolean;
    },
  ): Promise<AttendanceCheckpoint> {
    let checkpoint = await checkpointRepo.findOne({
      where: { policySetId, name },
    });

    if (!checkpoint) {
      checkpoint = checkpointRepo.create({ policySetId, name });
    }

    checkpoint.type = type;
    checkpoint.deviceId = input.deviceId ?? null;
    checkpoint.geofenceId = input.geofenceId ?? null;
    checkpoint.wifiNetworkId = input.wifiNetworkId ?? null;
    checkpoint.isRequired = input.isRequired;
    checkpoint.allowOverride = input.allowOverride;
    checkpoint.maxDistanceMeters = input.maxDistanceMeters;
    checkpoint.strictMode = input.strictMode;
    checkpoint.status = AttendanceCheckpointStatusEnum.ACTIVE;

    return checkpointRepo.save(checkpoint);
  }

  private async ensureShifts(
    shiftRepo: Repository<Shift>,
    shiftBreakRepo: Repository<ShiftBreak>,
    shiftAttendanceRuleRepo: Repository<ShiftAttendanceRule>,
    shiftOvertimeRuleRepo: Repository<ShiftOvertimeRule>,
    companyId: number,
    branchId: number,
    createdBy: number,
  ): Promise<ShiftCatalog> {
    const standard = await this.ensureShift(
      shiftRepo,
      companyId,
      branchId,
      createdBy,
      {
        name: 'Standard Day Shift',
        code: STANDARD_SHIFT_CODE,
        description: 'Regular 8am to 5pm attendance sample shift.',
        startTime: '08:00:00',
        endTime: '17:00:00',
      },
    );
    const support = await this.ensureShift(
      shiftRepo,
      companyId,
      branchId,
      createdBy,
      {
        name: 'Support Day Shift',
        code: SUPPORT_SHIFT_CODE,
        description: 'Regular 9am to 6pm support attendance sample shift.',
        startTime: '09:00:00',
        endTime: '18:00:00',
      },
    );

    await this.ensureShiftBreak(shiftBreakRepo, standard.id, {
      name: 'Lunch Break',
      breakType: ShiftBreakTypeEnum.LUNCH,
      startTime: '13:00:00',
      endTime: '14:00:00',
      durationMinutes: 60,
    });
    await this.ensureShiftBreak(shiftBreakRepo, support.id, {
      name: 'Lunch Break',
      breakType: ShiftBreakTypeEnum.LUNCH,
      startTime: '13:30:00',
      endTime: '14:30:00',
      durationMinutes: 60,
    });

    await this.ensureShiftAttendanceRule(shiftAttendanceRuleRepo, standard.id);
    await this.ensureShiftAttendanceRule(shiftAttendanceRuleRepo, support.id);
    await this.ensureShiftOvertimeRule(shiftOvertimeRuleRepo, standard.id);
    await this.ensureShiftOvertimeRule(shiftOvertimeRuleRepo, support.id);

    return { standard, support };
  }

  private async ensureShift(
    shiftRepo: Repository<Shift>,
    companyId: number,
    branchId: number,
    createdBy: number,
    input: {
      name: string;
      code: string;
      description: string;
      startTime: string;
      endTime: string;
    },
  ): Promise<Shift> {
    let shift = await shiftRepo.findOne({
      where: { companyId, code: input.code },
    });

    if (!shift) {
      shift = shiftRepo.create({ companyId, code: input.code });
    }

    shift.branchId = branchId;
    shift.departmentId = null;
    shift.name = input.name;
    shift.code = input.code;
    shift.description = input.description;
    shift.shiftType = ShiftTypeEnum.FIXED;
    shift.startTime = input.startTime;
    shift.endTime = input.endTime;
    shift.expectedWorkMinutes = 480;
    shift.minimumWorkMinutes = 420;
    shift.halfDayMinutes = 240;
    shift.graceInMinutes = 10;
    shift.graceOutMinutes = 5;
    shift.lateAfterMinutes = 10;
    shift.earlyLeaveAfterMinutes = 15;
    shift.isNightShift = false;
    shift.crossesMidnight = false;
    shift.allowOvertime = true;
    shift.maxOvertimeMinutes = 180;
    shift.requiresCheckout = true;
    shift.allowEarlyCheckin = true;
    shift.allowLateCheckout = true;
    shift.status = ShiftStatusEnum.ACTIVE;
    shift.createdBy = createdBy;

    return shiftRepo.save(shift);
  }

  private async ensureShiftBreak(
    shiftBreakRepo: Repository<ShiftBreak>,
    shiftId: number,
    input: {
      name: string;
      breakType: ShiftBreakTypeEnum;
      startTime: string;
      endTime: string;
      durationMinutes: number;
    },
  ): Promise<ShiftBreak> {
    let shiftBreak = await shiftBreakRepo.findOne({
      where: { shiftId, name: input.name },
    });

    if (!shiftBreak) {
      shiftBreak = shiftBreakRepo.create({ shiftId, name: input.name });
    }

    shiftBreak.breakType = input.breakType;
    shiftBreak.startTime = input.startTime;
    shiftBreak.endTime = input.endTime;
    shiftBreak.durationMinutes = input.durationMinutes;
    shiftBreak.isPaid = false;
    shiftBreak.isFlexible = false;

    return shiftBreakRepo.save(shiftBreak);
  }

  private async ensureShiftAttendanceRule(
    shiftAttendanceRuleRepo: Repository<ShiftAttendanceRule>,
    shiftId: number,
  ): Promise<ShiftAttendanceRule> {
    let rule = await shiftAttendanceRuleRepo.findOne({ where: { shiftId } });

    if (!rule) {
      rule = shiftAttendanceRuleRepo.create({ shiftId });
    }

    rule.lateAfterMinutes = 10;
    rule.absentAfterMinutes = 360;
    rule.halfDayAfterMinutes = 240;
    rule.allowMultipleCheckin = false;
    rule.autoMarkAbsent = true;
    rule.allowMobileAttendance = true;
    rule.allowRemoteAttendance = false;
    rule.requireGeofence = true;
    rule.requireBiometric = false;

    return shiftAttendanceRuleRepo.save(rule);
  }

  private async ensureShiftOvertimeRule(
    shiftOvertimeRuleRepo: Repository<ShiftOvertimeRule>,
    shiftId: number,
  ): Promise<ShiftOvertimeRule> {
    let rule = await shiftOvertimeRuleRepo.findOne({ where: { shiftId } });

    if (!rule) {
      rule = shiftOvertimeRuleRepo.create({ shiftId });
    }

    rule.overtimeStartAfterMinutes = 30;
    rule.maxDailyOvertimeMinutes = 180;
    rule.overtimeRateMultiplier = '1.50';
    rule.weekendMultiplier = '1.75';
    rule.holidayMultiplier = '2.00';
    rule.requiresApproval = false;
    rule.autoCalculate = true;

    return shiftOvertimeRuleRepo.save(rule);
  }

  private async ensureShiftAssignment(
    shiftAssignmentRepo: Repository<ShiftAssignment>,
    companyId: number,
    employeeId: number,
    shiftId: number,
    effectiveFrom: string,
    assignedBy: number,
  ): Promise<ShiftAssignment> {
    let assignment = await shiftAssignmentRepo.findOne({
      where: {
        companyId,
        employeeId,
        shiftId,
        effectiveFrom,
      },
    });

    if (!assignment) {
      assignment = shiftAssignmentRepo.create({
        companyId,
        employeeId,
        shiftId,
        effectiveFrom,
      });
    }

    assignment.effectiveTo = null;
    assignment.rotationGroupId = null;
    assignment.isPrimary = true;
    assignment.status = ShiftAssignmentStatusEnum.ACTIVE;
    assignment.assignedBy = assignedBy;

    return shiftAssignmentRepo.save(assignment);
  }

  private async ensureShiftSchedule(
    shiftScheduleRepo: Repository<ShiftSchedule>,
    companyId: number,
    employeeId: number,
    shiftId: number,
    scheduleDate: string,
    input: {
      holidayId: number | null;
      isOffDay: boolean;
      assignedBy: number | null;
      remarks: string | null;
    },
  ): Promise<ShiftSchedule> {
    let schedule = await shiftScheduleRepo.findOne({
      where: { companyId, employeeId, scheduleDate },
    });

    if (!schedule) {
      schedule = shiftScheduleRepo.create({
        companyId,
        employeeId,
        shiftId,
        scheduleDate,
      });
    }

    schedule.shiftId = shiftId;
    schedule.generatedFromRotation = false;
    schedule.overrideShiftId = null;
    schedule.holidayId = input.holidayId;
    schedule.isOffDay = input.isOffDay;
    schedule.assignedBy = input.assignedBy;
    schedule.remarks = input.remarks;

    return shiftScheduleRepo.save(schedule);
  }

  private async ensureMobilePunch(
    mobilePunchRepo: Repository<AttendanceMobilePunch>,
    companyId: number,
    branchId: number,
    employeeId: number,
    policySetId: number,
    geofenceId: number,
    wifiNetworkId: number,
    employeeNo: string,
    attendanceDate: string,
    punch: PunchScenario,
    reviewedByCompanyUserId: number,
  ): Promise<AttendanceMobilePunch> {
    const deviceIdentifier = `seed:${employeeNo}:${attendanceDate}:${punch.punchType}`;
    const punchTime = this.combineDateAndTime(attendanceDate, punch.time);
    let mobilePunch = await mobilePunchRepo.findOne({
      where: { companyId, employeeId, deviceIdentifier },
    });

    if (!mobilePunch) {
      mobilePunch = mobilePunchRepo.create({
        companyId,
        employeeId,
        deviceIdentifier,
      });
    }

    const approvedStatuses = new Set([
      AttendancePunchValidationStatusEnum.APPROVED,
      AttendancePunchValidationStatusEnum.OVERRIDE_APPROVED,
    ]);
    const isApproved = approvedStatuses.has(punch.validationStatus);
    const isOverrideFlow = punch.validationStatus !== AttendancePunchValidationStatusEnum.APPROVED;

    mobilePunch.branchId = branchId;
    mobilePunch.policySetId = policySetId;
    mobilePunch.geofenceId = geofenceId;
    mobilePunch.wifiNetworkId = wifiNetworkId;
    mobilePunch.punchType = punch.punchType;
    mobilePunch.source = AttendancePunchSourceEnum.MOBILE;
    mobilePunch.punchTime = punchTime;
    mobilePunch.attendanceDate = attendanceDate;
    mobilePunch.latitude = '-6.7924012';
    mobilePunch.longitude = '39.2082914';
    mobilePunch.accuracyMeters = isApproved ? '12.50' : '85.00';
    mobilePunch.distanceFromGeofenceMeters = isApproved ? '18.00' : '215.00';
    mobilePunch.wifiSsid = WIFI_SSID;
    mobilePunch.wifiBssid = WIFI_BSSID;
    mobilePunch.ipAddress = isApproved ? '10.40.10.24' : '196.41.91.24';
    mobilePunch.userAgent = 'AllianceHRMS/1.0 (Seeded Attendance Sample)';
    mobilePunch.validationStatus = punch.validationStatus;
    mobilePunch.validationMessage =
      punch.validationMessage ??
      (isApproved
        ? 'Seeded approved attendance punch.'
        : 'Seeded punch that requires override review.');
    mobilePunch.geofenceValidationResult = {
      seeded: true,
      withinRange: isApproved,
      distanceMeters: isApproved ? 18 : 215,
    };
    mobilePunch.wifiValidationResult = {
      seeded: true,
      matched: isApproved,
      ipMatched: isApproved,
    };
    mobilePunch.isOverrideRequested =
      punch.isOverrideRequested ?? punch.validationStatus === AttendancePunchValidationStatusEnum.PENDING_OVERRIDE;
    mobilePunch.overrideReason = mobilePunch.isOverrideRequested
      ? 'Employee reported connectivity loss while outside WiFi coverage.'
      : null;
    mobilePunch.overrideReviewedBy =
      punch.validationStatus === AttendancePunchValidationStatusEnum.OVERRIDE_APPROVED
        ? reviewedByCompanyUserId
        : null;
    mobilePunch.overrideReviewedAt =
      punch.validationStatus === AttendancePunchValidationStatusEnum.OVERRIDE_APPROVED
        ? this.combineDateAndTime(attendanceDate, '18:30:00')
        : null;
    mobilePunch.overrideReviewNote =
      punch.validationStatus === AttendancePunchValidationStatusEnum.OVERRIDE_APPROVED
        ? 'Approved by seeded supervisor review.'
        : null;
    mobilePunch.deviceInfo = {
      platform: 'Android',
      deviceModel: 'Samsung Galaxy A55',
      appVersion: '1.0.0-seed',
    };
    mobilePunch.rawPayload = {
      seeded: true,
      employeeNo,
      punchType: punch.punchType,
      validationStatus: punch.validationStatus,
      overrideFlow: isOverrideFlow,
    };
    mobilePunch.isProcessed = false;
    mobilePunch.processedEventId = null;

    return mobilePunchRepo.save(mobilePunch);
  }

  private async ensureDailySummary(
    dailySummaryRepo: Repository<AttendanceDailySummary>,
    companyId: number,
    employeeId: number,
    branchId: number,
    attendanceDate: string,
    scenario: SummaryScenario,
  ): Promise<AttendanceDailySummary> {
    const approvedPunches = scenario.punches
      .filter((punch) =>
        [
          AttendancePunchValidationStatusEnum.APPROVED,
          AttendancePunchValidationStatusEnum.OVERRIDE_APPROVED,
        ].includes(punch.validationStatus),
      )
      .sort((left, right) => left.time.localeCompare(right.time));

    const checkInPunch =
      approvedPunches.find((punch) => punch.punchType === AttendancePunchTypeEnum.CHECK_IN) ??
      null;
    const checkOutPunch =
      [...approvedPunches]
        .reverse()
        .find((punch) => punch.punchType === AttendancePunchTypeEnum.CHECK_OUT) ?? null;

    const scheduleStartAt = this.combineDateAndTime(
      attendanceDate,
      scenario.shift.startTime,
    );
    const scheduleEndAt = this.combineDateAndTime(attendanceDate, scenario.shift.endTime);
    const checkInAt = checkInPunch
      ? this.combineDateAndTime(attendanceDate, checkInPunch.time)
      : null;
    const checkOutAt = checkOutPunch
      ? this.combineDateAndTime(attendanceDate, checkOutPunch.time)
      : null;

    let attendanceStatus = AttendanceDailyStatusEnum.PRESENT;
    let lateMinutes = 0;
    let earlyDepartureMinutes = 0;
    let workMinutes = 0;
    let overtimeMinutes = 0;

    if (scenario.holidayId) {
      attendanceStatus = AttendanceDailyStatusEnum.HOLIDAY;
    } else if (scenario.isOffDay) {
      attendanceStatus = AttendanceDailyStatusEnum.OFF_DAY;
    } else if (!checkInAt) {
      attendanceStatus = AttendanceDailyStatusEnum.ABSENT;
    } else if (scenario.shift.requiresCheckout && !checkOutAt) {
      attendanceStatus = AttendanceDailyStatusEnum.INCOMPLETE;
    }

    if (checkInAt && checkOutAt && checkOutAt.getTime() > checkInAt.getTime()) {
      workMinutes = Math.floor((checkOutAt.getTime() - checkInAt.getTime()) / 60000);
    }

    if (
      !scenario.holidayId &&
      !scenario.isOffDay &&
      checkInAt &&
      attendanceStatus !== AttendanceDailyStatusEnum.INCOMPLETE
    ) {
      const baseline =
        scheduleStartAt.getTime() + scenario.shift.graceInMinutes * 60_000;
      const lateThreshold =
        baseline + scenario.shift.lateAfterMinutes * 60_000;
      const halfDayThreshold =
        baseline + scenario.shift.halfDayMinutes * 60_000;

      if (
        scenario.shift.lateAfterMinutes > 0 &&
        checkInAt.getTime() > lateThreshold
      ) {
        lateMinutes = Math.floor((checkInAt.getTime() - lateThreshold) / 60_000);
      }

      if (checkInAt.getTime() > halfDayThreshold) {
        attendanceStatus = AttendanceDailyStatusEnum.HALF_DAY;
      }
    }

    if (
      !scenario.holidayId &&
      !scenario.isOffDay &&
      checkOutAt &&
      attendanceStatus !== AttendanceDailyStatusEnum.INCOMPLETE
    ) {
      const allowedEarlyLeaveTime =
        scheduleEndAt.getTime() -
        (scenario.shift.graceOutMinutes + scenario.shift.earlyLeaveAfterMinutes) * 60_000;

      if (checkOutAt.getTime() < allowedEarlyLeaveTime) {
        earlyDepartureMinutes = Math.floor(
          (allowedEarlyLeaveTime - checkOutAt.getTime()) / 60_000,
        );
      }

      const overtimeStartTime =
        scheduleEndAt.getTime() + 30 * 60_000;
      if (checkOutAt.getTime() > overtimeStartTime) {
        overtimeMinutes = Math.floor(
          (checkOutAt.getTime() - overtimeStartTime) / 60_000,
        );
      }
    }

    if (scenario.holidayId || scenario.isOffDay) {
      overtimeMinutes = workMinutes;
    } else if (!scenario.shift.allowOvertime) {
      overtimeMinutes = 0;
    } else if (scenario.shift.maxOvertimeMinutes > 0) {
      overtimeMinutes = Math.min(overtimeMinutes, scenario.shift.maxOvertimeMinutes);
    }

    let summary = await dailySummaryRepo.findOne({
      where: { companyId, employeeId, attendanceDate },
    });

    if (!summary) {
      summary = dailySummaryRepo.create({ companyId, employeeId, attendanceDate });
    }

    summary.branchId = branchId;
    summary.scheduleSource = 'SHIFT_SCHEDULE';
    summary.shiftId = scenario.shift.id;
    summary.timetableId = null;
    summary.timezone = 'Africa/Dar_es_Salaam';
    summary.scheduleStartAt = scheduleStartAt;
    summary.scheduleEndAt = scheduleEndAt;
    summary.checkInAt = checkInAt;
    summary.checkOutAt = checkOutAt;
    summary.lateMinutes = lateMinutes;
    summary.earlyDepartureMinutes = earlyDepartureMinutes;
    summary.workMinutes = workMinutes;
    summary.overtimeMinutes = overtimeMinutes;
    summary.attendanceStatus = attendanceStatus;
    summary.flags = {
      seeded: true,
      sample: true,
      holiday: !!scenario.holidayId,
      offDay: !!scenario.isOffDay,
      eventCount: approvedPunches.length,
      remarks: scenario.remarks ?? null,
    };
    summary.sourceFirstRawLogId = null;
    summary.sourceLastRawLogId = null;
    summary.calculationVersion = 1;
    summary.finalizedAt = null;

    return dailySummaryRepo.save(summary);
  }

  private buildEmployeeScenarios(
    employees: Employee[],
    employeeShiftMap: Map<number, Shift>,
    branchId: number,
    workingDates: string[],
  ): Map<number, Array<{ date: string; shift: Shift; summary: SummaryScenario }>> {
    const scenarios = new Map<
      number,
      Array<{ date: string; shift: Shift; summary: SummaryScenario }>
    >();

    const punchPlans: PunchScenario[][][] = [
      [
        this.buildPunchPair('09:02:00', '18:01:00'),
        this.buildPunchPair('09:07:00', '18:10:00'),
        this.buildPunchPair('09:05:00', '18:00:00'),
        this.buildPunchPair('08:58:00', '18:45:00'),
      ],
      [
        this.buildPunchPair('08:24:00', '17:06:00'),
        this.buildPunchPair('07:57:00', '17:01:00'),
        this.buildPunchPair('08:06:00', '19:05:00'),
        this.buildPunchPair('08:11:00', '17:00:00'),
      ],
      [
        this.buildPunchPair('08:10:00', '17:02:00'),
        [
          {
            punchType: AttendancePunchTypeEnum.CHECK_IN,
            time: '08:18:00',
            validationStatus: AttendancePunchValidationStatusEnum.APPROVED,
          },
        ],
        [],
        this.buildPunchPair('12:30:00', '17:15:00'),
      ],
      [
        [],
        [
          {
            punchType: AttendancePunchTypeEnum.CHECK_IN,
            time: '08:42:00',
            validationStatus: AttendancePunchValidationStatusEnum.PENDING_OVERRIDE,
            isOverrideRequested: true,
            validationMessage: 'Seeded punch awaiting manager override.',
          },
        ],
        [
          {
            punchType: AttendancePunchTypeEnum.CHECK_IN,
            time: '08:05:00',
            validationStatus: AttendancePunchValidationStatusEnum.OVERRIDE_APPROVED,
            isOverrideRequested: true,
            validationMessage: 'Seeded punch approved after override review.',
          },
          {
            punchType: AttendancePunchTypeEnum.CHECK_OUT,
            time: '17:20:00',
            validationStatus: AttendancePunchValidationStatusEnum.OVERRIDE_APPROVED,
            isOverrideRequested: true,
            validationMessage: 'Seeded punch approved after override review.',
          },
        ],
        [],
      ],
    ];

    employees.forEach((employee, employeeIndex) => {
      const shift = employeeShiftMap.get(employee.id);
      if (!shift) {
        return;
      }

      const plans = punchPlans[employeeIndex] ?? [];
      const entries = workingDates.map((date, dateIndex) => ({
        date,
        shift,
        summary: {
          shift,
          branchId,
          holidayId: null,
          isOffDay: false,
          remarks: 'Seeded attendance workday.',
          punches: plans[dateIndex] ?? [],
        },
      }));

      scenarios.set(employee.id, entries);
    });

    return scenarios;
  }

  private buildPunchPair(
    checkInTime: string,
    checkOutTime: string,
  ): PunchScenario[] {
    return [
      {
        punchType: AttendancePunchTypeEnum.CHECK_IN,
        time: checkInTime,
        validationStatus: AttendancePunchValidationStatusEnum.APPROVED,
      },
      {
        punchType: AttendancePunchTypeEnum.CHECK_OUT,
        time: checkOutTime,
        validationStatus: AttendancePunchValidationStatusEnum.APPROVED,
      },
    ];
  }

  private getRecentWeekdays(count: number): string[] {
    const dates: string[] = [];
    let cursor = new Date();

    while (dates.length < count) {
      const day = cursor.getDay();
      if (day !== 0 && day !== 6) {
        dates.push(this.toDateOnly(cursor));
      }
      cursor.setDate(cursor.getDate() - 1);
    }

    return dates.reverse();
  }

  private getMostRecentSaturday(): string {
    const cursor = new Date();
    while (cursor.getDay() !== 6) {
      cursor.setDate(cursor.getDate() - 1);
    }

    return this.toDateOnly(cursor);
  }

  private addDays(dateOnly: string, days: number): string {
    const cursor = new Date(`${dateOnly}T00:00:00`);
    cursor.setDate(cursor.getDate() + days);
    return this.toDateOnly(cursor);
  }

  private combineDateAndTime(dateOnly: string, time: string): Date {
    return new Date(`${dateOnly}T${time}+03:00`);
  }

  private toDateOnly(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
