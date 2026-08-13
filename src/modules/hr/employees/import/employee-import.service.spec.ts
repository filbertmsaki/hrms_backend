import { BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import ExcelJS from 'exceljs';
jest.mock('digest-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));
import { EmployeeImportService } from './employee-import.service';
import { EmployeeImportJobData } from './employee-import-job.constants';
import { EmployeeImportBatch } from './entities/employee-import-batch.entity';
import { EmployeeImportOutboxEvent } from './entities/employee-import-outbox-event.entity';
import { EmployeeImportRow } from './entities/employee-import-row.entity';
import { EmployeeImportExecutionModeEnum } from './dto/employee-import-confirm.dto';
import { Employee } from '../entities/employee.entity';
import { EmployeeNumberSequence } from '../entities/employee-number-sequence.entity';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { User } from '../../../users/entities/user.entity';
import { Branch } from '../../branches/entities/branch.entity';
import { Department } from '../../departments/entities/department.entity';
import { DepartmentPosition } from '../../departments/entities/department-position.entity';
import { Position } from '../../positions/entities/position.entity';
import { Shift } from '../../attendance/shift/shifts/entities/shift.entity';
import { Timetable } from '../../attendance/timetable/timetables/entities/timetable.entity';
import { AttendanceDevice } from '../../../access-control/attendance-devices/entities/attendance-device.entity';
import { Role } from '../../../roles/entities/role.entity';
import { EmployeeIdentification } from '../entities/employee-identification.entity';
import { EmployeeDeviceAssignment } from '../../../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeAccessCredential } from '../../../access-control/employee-access-credentials/entity/employee-access-credential.entity';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { EmployeeImportBatchStatusEnum } from './enums/employee-import-batch-status.enum';
import { EmployeeImportModeEnum } from './enums/employee-import-mode.enum';
import { EmployeeImportRowStatusEnum } from './enums/employee-import-row-status.enum';
import { EmploymentStatusEnum } from '../enums/employment-status.enum';

type MockRepo = Record<string, jest.Mock>;

const createRepositoryMock = (): MockRepo => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  create: jest.fn((value: unknown) => value),
  save: jest.fn((value: unknown) => value),
  createQueryBuilder: jest.fn(),
});

async function createMappedImportWorkbookBuffer() {
  const workbook = new ExcelJS.Workbook();

  const employeeSheet = workbook.addWorksheet('Employees');
  employeeSheet.addRow([
    'first_name',
    'middle_name',
    'last_name',
    'employee_number',
    'email',
    'gender',
    'employment_date',
    'branch_code',
    'department_code',
    'position_code',
    'employment_type',
    'access_device_codes',
    'device_employee_number',
  ]);

  for (let index = 1; index <= 119; index += 1) {
    const rowNumber = index + 1;
    const firstName = `Employee${index}`;
    const lastName = 'Imported';
    const row = [
      firstName,
      '',
      lastName,
      `AICL-${String(index).padStart(5, '0')}`,
      `employee${index}@example.com`,
      index % 2 === 0 ? 'female' : 'male',
      '2026-07-01',
      'HQ',
      'HR',
      'HRO',
      'full_time',
      '',
      '',
    ];

    if (rowNumber === 59) {
      row[0] = 'Jayman';
      row[1] = 'Hiten';
      row[2] = 'Chohan';
      row[6] = '2026-08-15';
    }

    if (rowNumber === 68) {
      row[0] = 'KVA';
      row[1] = '';
      row[2] = 'Krishnan';
      row[11] = 'DEVICE-DSM-01';
      row[12] = '';
    }

    employeeSheet.addRow(row);
  }

  const branchesSheet = workbook.addWorksheet('Branches');
  branchesSheet.addRow(['Code', 'Name', 'Status']);
  branchesSheet.addRow(['HQ', 'Head Office', 'active']);

  const departmentsSheet = workbook.addWorksheet('Departments');
  departmentsSheet.addRow(['Code', 'Name', 'Branch Code', 'Status']);
  departmentsSheet.addRow(['HR', 'Human Resources', 'HQ', 'active']);

  const positionsSheet = workbook.addWorksheet('Positions');
  positionsSheet.addRow([
    'Code',
    'Name',
    'Branch Code',
    'Department Code',
    'Status',
  ]);
  positionsSheet.addRow(['HRO', 'HR Officer', 'HQ', 'HR', 'active']);

  const devicesSheet = workbook.addWorksheet('Access Devices');
  devicesSheet.addRow(['Device Code', 'Device Name', 'Status']);
  devicesSheet.addRow(['DEVICE-DSM-01', 'Main Gate', 'active']);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('EmployeeImportService', () => {
  let service: EmployeeImportService;
  let configService: {
    get: jest.Mock;
  };
  let branchesService: {
    grantAccess: jest.Mock;
  };
  let filesService: {
    savePrivateBufferFile: jest.Mock;
  };
  let shiftAssignmentsService: {
    create: jest.Mock;
  };
  let employeeTimetablesService: {
    create: jest.Mock;
  };
  let hikvisionImportSyncService: {
    scheduleImportedEmployeesSync: jest.Mock;
  };

  const actor: AuthenticatedUser = {
    id: 9,
    email: 'hr@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: 10,
    companyMembershipId: 33,
    roles: [],
    permissions: ['employees:change-status'],
  };

  beforeEach(() => {
    jest.useRealTimers();
    configService = {
      get: jest
        .fn()
        .mockImplementation(
          (key: string, defaultValue?: unknown) => defaultValue,
        ),
    };
    branchesService = {
      grantAccess: jest.fn().mockResolvedValue(undefined),
    };
    filesService = {
      savePrivateBufferFile: jest.fn().mockResolvedValue({
        publicPath: '/private-uploads/employee-imports/test/source.xlsx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    };
    shiftAssignmentsService = {
      create: jest.fn().mockResolvedValue(undefined),
    };
    employeeTimetablesService = {
      create: jest.fn().mockResolvedValue(undefined),
    };
    hikvisionImportSyncService = {
      scheduleImportedEmployeesSync: jest
        .fn()
        .mockResolvedValue({ scheduled: false, scheduledFor: null }),
    };
    service = new EmployeeImportService(
      {} as DataSource,
      createRepositoryMock() as unknown as Repository<EmployeeImportBatch>,
      createRepositoryMock() as unknown as Repository<EmployeeImportRow>,
      createRepositoryMock() as unknown as Repository<EmployeeImportOutboxEvent>,
      createRepositoryMock() as unknown as Repository<Employee>,
      createRepositoryMock() as unknown as Repository<CompanyUser>,
      createRepositoryMock() as unknown as Repository<User>,
      createRepositoryMock() as unknown as Repository<Branch>,
      createRepositoryMock() as unknown as Repository<Department>,
      createRepositoryMock() as unknown as Repository<DepartmentPosition>,
      createRepositoryMock() as unknown as Repository<Position>,
      createRepositoryMock() as unknown as Repository<Shift>,
      createRepositoryMock() as unknown as Repository<Timetable>,
      createRepositoryMock() as unknown as Repository<AttendanceDevice>,
      createRepositoryMock() as unknown as Repository<Role>,
      createRepositoryMock() as unknown as Repository<EmployeeIdentification>,
      createRepositoryMock() as unknown as Repository<EmployeeDeviceAssignment>,
      createRepositoryMock() as unknown as Repository<EmployeeAccessCredential>,
      {} as never,
      {} as never,
      {} as never,
      filesService as never,
      shiftAssignmentsService as never,
      employeeTimetablesService as never,
      {} as never,
      configService as never,
      branchesService as never,
      hikvisionImportSyncService as never,
    );
    jest.spyOn(service as any, 'findDefaultEmployeeRole').mockReturnValue({
      id: 7,
      name: 'EMPLOYEE',
      display_name: 'Employee',
      company_id: 10,
    });
  });

  it('generates an import template workbook with employee and reference sheets', async () => {
    jest.spyOn(service as any, 'loadReferenceData').mockResolvedValue({
      branches: [{ id: 1, code: 'HQ', name: 'Head Office', status: 'active' }],
      departments: [
        {
          id: 2,
          code: 'HR',
          name: 'Human Resources',
          branch_id: 1,
          status: 'active',
        },
      ],
      positions: [
        {
          id: 3,
          code: 'HRO',
          name: 'HR Officer',
          branch_id: 1,
          department_id: 2,
          status: 'active',
        },
      ],
      departmentPositionMappings: [],
      shifts: [{ id: 4, code: 'DAY', name: 'Day Shift', status: 'active' }],
      timetables: [
        { id: 5, code: 'STD', name: 'Standard Week', status: 'active' },
      ],
      devices: [
        {
          id: 6,
          deviceCode: 'GATE-01',
          deviceName: 'Main Gate',
          status: 'active',
        },
      ],
      roles: [{ id: 7, name: 'EMPLOYEE', display_name: 'Employee' }],
      employees: [],
      companyUsers: [],
      users: [],
      identifications: [],
      deviceAssignments: [],
      credentials: [],
    });
    jest
      .spyOn(service as any, 'applyActorBranchValidation')
      .mockResolvedValue(undefined);

    const result = await service.downloadTemplate(10, actor);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      result.buffer.buffer.slice(
        result.buffer.byteOffset,
        result.buffer.byteOffset + result.buffer.byteLength,
      ) as ArrayBuffer,
    );

    expect(result.fileName).toBe('employee-import-template-10.xlsx');
    expect(workbook.getWorksheet('Employees')).toBeDefined();
    expect(workbook.getWorksheet('Instructions')).toBeDefined();
    expect(workbook.getWorksheet('Branches')).toBeDefined();
    expect(workbook.getWorksheet('Import Review')).toBeUndefined();

    const employeeSheet = workbook.getWorksheet('Employees');
    const headers = Array.from(
      { length: employeeSheet?.columnCount ?? 0 },
      (_, index) =>
        employeeSheet
          ?.getRow(1)
          .getCell(index + 1)
          .text.trim() ?? '',
    );

    expect(headers).toEqual([
      'first_name',
      'middle_name',
      'last_name',
      'employee_number',
      'email',
      'gender',
      'employment_date',
      'branch_code',
      'department_code',
      'position_code',
      'employment_type',
      'access_device_codes',
      'device_employee_number',
    ]);
    expect(employeeSheet?.views).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          state: 'frozen',
          xSplit: 1,
          ySplit: 1,
          topLeftCell: 'B2',
        }),
      ]),
    );
    expect(employeeSheet?.autoFilter).toBe('A1:M1');
    expect(employeeSheet?.getColumn(1).width).toBe(16);
    expect(employeeSheet?.getColumn(5).width).toBe(31);
    expect(employeeSheet?.getCell('A2').value).toBeNull();
    expect(employeeSheet?.getCell('F2').dataValidation.type).toBe('list');
    expect(employeeSheet?.getCell('F2').dataValidation.formulae).toEqual([
      '=GenderValues',
    ]);
    expect(employeeSheet?.getCell('H10').dataValidation.type).toBe('list');
    expect(employeeSheet?.getCell('H10').dataValidation.formulae).toEqual([
      '=BranchCodes',
    ]);
    expect(employeeSheet?.getCell('I10').dataValidation.type).toBe('list');
    expect(employeeSheet?.getCell('I10').dataValidation.formulae).toEqual([
      '=DepartmentCodes',
    ]);
    expect(employeeSheet?.getCell('J10').dataValidation.type).toBe('list');
    expect(employeeSheet?.getCell('J10').dataValidation.formulae).toEqual([
      '=PositionCodes',
    ]);
    expect(employeeSheet?.getCell('K10').dataValidation.type).toBe('list');
    expect(employeeSheet?.getCell('K10').dataValidation.formulae).toEqual([
      '=EmploymentTypes',
    ]);
    expect(employeeSheet?.getCell('F10').dataValidation.type).toBe('list');
    expect(employeeSheet?.getCell('F10').dataValidation.formulae).toEqual([
      '=GenderValues',
    ]);
    expect(employeeSheet?.getCell('L10').dataValidation.type).toBe('list');
    expect(employeeSheet?.getCell('L10').dataValidation.formulae).toEqual([
      '=AccessDeviceCodes',
    ]);
    expect(employeeSheet?.getCell('L10').dataValidation.errorTitle).toBe(
      'Use device codes',
    );
    expect(workbook.definedNames.model).toEqual(
      expect.arrayContaining([
        { name: 'BranchCodes', ranges: ['Branches!$A$2'] },
        { name: 'DepartmentCodes', ranges: ['Departments!$A$2'] },
        { name: 'PositionCodes', ranges: ['Positions!$A$2'] },
        { name: 'EmploymentTypes', ranges: ["'Employment Types'!$A$2:$A$7"] },
        { name: 'GenderValues', ranges: ['Genders!$A$2:$A$3'] },
        { name: 'AccessDeviceCodes', ranges: ["'Access Devices'!$A$2"] },
      ]),
    );

    const instructionsSheet = workbook.getWorksheet('Instructions');
    expect(instructionsSheet?.getCell('A2').text).toBe('Required columns');
    expect(instructionsSheet?.getCell('B8').text).toContain(
      'Select a single device code from the dropdown',
    );
  });

  it('rejects unsupported file extensions before previewing', async () => {
    await expect(
      service.previewImport(
        10,
        {
          originalname: 'employees.csv',
          mimetype: 'text/csv',
          size: 12,
          buffer: Buffer.from('test'),
        },
        {},
        actor,
      ),
    ).rejects.toThrow('Only .xlsx employee import files are supported');
  });

  it('rejects workbooks with no employee worksheet', async () => {
    const workbook = new ExcelJS.Workbook();
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(
      service.previewImport(
        10,
        {
          originalname: 'employees.xlsx',
          mimetype:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: buffer.length,
          buffer,
        },
        {},
        actor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('reports duplicate and unsupported headers during preview', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Employees');
    sheet.addRow([
      'first_name',
      'first_name',
      'last_name',
      'email',
      'gender',
      'phone_extension',
    ]);
    sheet.addRow(['Jane', 'Jane', 'Doe', 'jane@example.com', 'female', '101']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    jest.spyOn(service as any, 'loadReferenceData').mockResolvedValue({
      branches: [],
      departments: [],
      positions: [],
      departmentPositionMappings: [],
      shifts: [],
      timetables: [],
      devices: [],
      roles: [],
      employees: [],
      companyUsers: [],
      users: [],
      identifications: [],
      deviceAssignments: [],
      credentials: [],
    });
    jest
      .spyOn(service as any, 'applyActorBranchValidation')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'applyManagerValidation')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'applyBatchDuplicateValidation')
      .mockImplementation(() => undefined);
    jest
      .spyOn(service as any, 'validatePreviewRow')
      .mockImplementation(
        (_: number, rowNumber: number, values: Record<string, unknown>) => ({
          rowNumber,
          rawData: values,
          normalizedData: values,
          errors: [],
          warnings: [],
          importAction: 'CREATE',
          matchedEmployeeId: null,
          employeeNumber: null,
          deviceEmployeeNumber: null,
          employeeName: 'Jane Doe',
        }),
      );
    const previewBatch = {
      batchId: 'IMPORT-20260724-ABC123',
      previewToken: 'preview-token',
      status: EmployeeImportBatchStatusEnum.PREVIEW_READY,
      importMode: EmployeeImportModeEnum.CREATE_OR_UPDATE,
      totalRows: 1,
      validRows: 0,
      invalidRows: 1,
      duplicateRows: 0,
      validationSummary: {},
    } as EmployeeImportBatch;

    jest
      .spyOn(service as any, 'persistPreviewBatch')
      .mockResolvedValue(previewBatch);

    const result = await service.previewImport(
      10,
      {
        originalname: 'employees.xlsx',
        mimetype:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
        buffer,
      },
      {},
      actor,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Duplicate header "first_name"'),
        expect.stringContaining(
          'Unsupported columns detected: phone_extension',
        ),
      ]),
    );
  });

  it('validates the mapped employee import workbook fixture against current rules', async () => {
    const workbookBuffer = await createMappedImportWorkbookBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(workbookBuffer);

    const branchesSheet = workbook.getWorksheet('Branches');
    const departmentsSheet = workbook.getWorksheet('Departments');
    const positionsSheet = workbook.getWorksheet('Positions');
    const devicesSheet = workbook.getWorksheet('Access Devices');

    const branches = Array.from(
      { length: (branchesSheet?.rowCount ?? 1) - 1 },
      (_, index) => {
        const row = branchesSheet!.getRow(index + 2);
        return {
          id: index + 1,
          code: row.getCell(1).text.trim(),
          name: row.getCell(2).text.trim(),
          status: row.getCell(3).text.trim().toLowerCase(),
        };
      },
    );
    const branchIdByCode = new Map(
      branches.map((branch) => [branch.code, branch.id]),
    );

    const departments = Array.from(
      { length: (departmentsSheet?.rowCount ?? 1) - 1 },
      (_, index) => {
        const row = departmentsSheet!.getRow(index + 2);
        return {
          id: index + 1,
          code: row.getCell(1).text.trim(),
          name: row.getCell(2).text.trim(),
          branch_id: branchIdByCode.get(row.getCell(3).text.trim()) ?? null,
          status: row.getCell(4).text.trim().toLowerCase(),
        };
      },
    );

    const positions = Array.from(
      { length: (positionsSheet?.rowCount ?? 1) - 1 },
      (_, index) => {
        const row = positionsSheet!.getRow(index + 2);
        return {
          id: index + 1,
          code: row.getCell(1).text.trim(),
          name: row.getCell(2).text.trim(),
          branch_id: null,
          department_id: null,
          status: row.getCell(5).text.trim().toLowerCase(),
        };
      },
    );

    const devices = Array.from(
      { length: (devicesSheet?.rowCount ?? 1) - 1 },
      (_, index) => {
        const row = devicesSheet!.getRow(index + 2);
        return {
          id: index + 1,
          deviceCode: row.getCell(1).text.trim(),
          deviceName: row.getCell(2).text.trim(),
          status: row.getCell(3).text.trim(),
        };
      },
    );

    jest.spyOn(service as any, 'loadReferenceData').mockResolvedValue({
      branches,
      departments,
      positions,
      departmentPositionMappings: [],
      shifts: [],
      timetables: [],
      devices,
      roles: [],
      employees: [],
      companyUsers: [],
      users: [],
      identifications: [],
      deviceAssignments: [],
      credentials: [],
    });
    jest
      .spyOn(service as any, 'applyActorBranchValidation')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'applyManagerValidation')
      .mockImplementation(() => undefined);
    jest.spyOn(service as any, 'getTodayIsoDate').mockReturnValue('2026-07-30');

    const result = await service.previewImport(
      10,
      {
        originalname: 'employee-import-mapped.xlsx',
        mimetype:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: workbookBuffer.length,
        buffer: workbookBuffer,
      },
      {
        import_mode: EmployeeImportModeEnum.CREATE_OR_UPDATE,
        process_valid_rows_only: true,
      },
      actor,
    );

    expect(result.totalRows).toBe(119);
    expect(result.validRows).toBe(118);
    expect(result.invalidRows).toBe(1);
    expect(result.duplicateRows).toBe(0);
    expect(result.summary).toEqual(
      expect.objectContaining({
        totalRows: 119,
        readyForImport: 118,
        invalidRecords: 1,
        duplicateInFileRecords: 0,
      }),
    );

    const futureDateRow = result.rows.find((row) => row.rowNumber === 59);
    expect(futureDateRow).toEqual(
      expect.objectContaining({
        status: 'INVALID_RECORD',
        identifier: 'Jayman Hiten Chohan',
      }),
    );
    expect(futureDateRow?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'employment_date',
          message: 'Employment date cannot be in the future',
        }),
      ]),
    );

    const missingDeviceEmployeeNumberRow = result.rows.find(
      (row) => row.rowNumber === 68,
    );
    expect(missingDeviceEmployeeNumberRow).toEqual(
      expect.objectContaining({
        status: 'READY_FOR_IMPORT',
        identifier: 'KVA Krishnan',
      }),
    );
    expect(missingDeviceEmployeeNumberRow?.warnings).toEqual(
      expect.arrayContaining([
        'Device employee number is blank. HRMS will use the employee number for access-device assignment during import.',
      ]),
    );
  }, 20000);

  it('applies the company default timetable and its default shift for old-template rows', () => {
    const row = (
      service as unknown as {
        validatePreviewRow: (
          companyId: number,
          rowNumber: number,
          values: Record<string, unknown>,
          dto: Record<string, unknown>,
          references: Record<string, unknown>,
        ) => {
          previewStatus: string;
          normalizedData: Record<string, unknown>;
        };
      }
    ).validatePreviewRow(
      10,
      2,
      {
        first_name: 'Jane',
        middle_name: '',
        last_name: 'Doe',
        employee_number: '',
        email: 'jane.doe@example.com',
        gender: 'female',
        employment_date: '2026-07-28',
        branch_code: 'HQ',
        department_code: 'HR',
        position_code: 'HRO',
        employment_type: 'full_time',
      },
      {},
      {
        branches: [
          { id: 1, code: 'HQ', name: 'Head Office', status: 'active' },
        ],
        departments: [
          {
            id: 2,
            code: 'HR',
            name: 'Human Resources',
            branch_id: 1,
            status: 'active',
          },
        ],
        positions: [
          {
            id: 3,
            code: 'HRO',
            name: 'HR Officer',
            branch_id: 1,
            department_id: 2,
            status: 'active',
          },
        ],
        departmentPositionMappings: [],
        shifts: [
          {
            id: 4,
            code: 'DAY',
            name: 'Day Shift',
            status: 'ACTIVE',
          },
        ],
        timetables: [
          {
            id: 5,
            code: 'STD',
            name: 'Standard Week',
            status: 'ACTIVE',
            isDefault: true,
            days: [
              {
                dayOfWeek: 2,
                isWorkingDay: true,
                defaultShiftId: 4,
              },
            ],
          },
        ],
        devices: [],
        roles: [],
        employees: [],
        companyUsers: [],
        users: [],
        identifications: [],
        deviceAssignments: [],
        credentials: [],
      },
    );

    expect(row.previewStatus).toBe('READY_FOR_IMPORT');
    expect(row.normalizedData).toEqual(
      expect.objectContaining({
        shift_code: 'DAY',
        shift_id: 4,
        timetable_code: 'STD',
        timetable_id: 5,
      }),
    );
  });

  it('ignores blank optional lookup cells during preview validation', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Employees');
    sheet.addRow([
      'first_name',
      'last_name',
      'email',
      'gender',
      'employment_date',
      'branch_code',
      'department_code',
      'position_code',
      'access_device_codes',
      'device_employee_number',
    ]);
    sheet.addRow([
      'Jane',
      'Doe',
      'jane.optional@example.com',
      'female',
      '2026-01-01',
      '',
      '',
      '',
      '',
      '',
    ]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    jest.spyOn(service as any, 'loadReferenceData').mockResolvedValue({
      branches: [],
      departments: [],
      positions: [],
      shifts: [],
      timetables: [],
      devices: [],
      roles: [],
      employees: [],
      companyUsers: [],
      users: [],
      identifications: [],
      deviceAssignments: [],
      credentials: [],
    });
    jest
      .spyOn(service as any, 'applyActorBranchValidation')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'applyManagerValidation')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'applyBatchDuplicateValidation')
      .mockImplementation(() => undefined);
    jest
      .spyOn(service as any, 'persistPreviewBatch')
      .mockImplementation(
        (
          _companyId: number,
          _file: unknown,
          _dto: unknown,
          _actor: unknown,
          rows: Array<{ errors: string[] }>,
        ) =>
          Promise.resolve({
            batchId: 'IMPORT-20260727-BLANKS',
            previewToken: 'preview-token',
            status: EmployeeImportBatchStatusEnum.PREVIEW_READY,
            importMode: EmployeeImportModeEnum.CREATE_ONLY,
            totalRows: rows.length,
            validRows: rows.filter((row) => row.errors.length === 0).length,
            invalidRows: rows.filter((row) => row.errors.length > 0).length,
            duplicateRows: 0,
            validationSummary: {},
          } as EmployeeImportBatch),
      );

    const result = await service.previewImport(
      10,
      {
        originalname: 'employees.xlsx',
        mimetype:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
        buffer,
      },
      {},
      actor,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.errors).not.toEqual(
      expect.arrayContaining([
        'branch_code "" does not match any branch code',
        'department_code "" does not match any department code',
        'position_code "" does not match any position code',
      ]),
    );
    expect(result.rows[0]?.status).toBe('READY_FOR_IMPORT');
  });

  it('allows previews when both device columns are omitted from the workbook', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Employees');
    sheet.addRow([
      'first_name',
      'last_name',
      'email',
      'gender',
      'employment_date',
      'branch_code',
      'department_code',
      'position_code',
    ]);
    sheet.addRow([
      'John',
      'Importer',
      'john.importer@example.com',
      'male',
      '2026-01-01',
      '',
      '',
      '',
    ]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    jest.spyOn(service as any, 'loadReferenceData').mockResolvedValue({
      branches: [],
      departments: [],
      positions: [],
      shifts: [],
      timetables: [],
      devices: [],
      roles: [],
      employees: [],
      companyUsers: [],
      users: [],
      identifications: [],
      deviceAssignments: [],
      credentials: [],
    });
    jest
      .spyOn(service as any, 'applyActorBranchValidation')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'applyManagerValidation')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'applyBatchDuplicateValidation')
      .mockImplementation(() => undefined);
    jest
      .spyOn(service as any, 'persistPreviewBatch')
      .mockImplementation(
        (
          _companyId: number,
          _file: unknown,
          _dto: unknown,
          _actor: unknown,
          rows: Array<{ errors: string[] }>,
        ) =>
          Promise.resolve({
            batchId: 'IMPORT-20260730-NO-DEVICE-COLUMNS',
            previewToken: 'preview-token',
            status: EmployeeImportBatchStatusEnum.PREVIEW_READY,
            importMode: EmployeeImportModeEnum.CREATE_ONLY,
            totalRows: rows.length,
            validRows: rows.filter((row) => row.errors.length === 0).length,
            invalidRows: rows.filter((row) => row.errors.length > 0).length,
            duplicateRows: 0,
            validationSummary: {},
          } as EmployeeImportBatch),
      );

    const result = await service.previewImport(
      10,
      {
        originalname: 'employees-no-device-columns.xlsx',
        mimetype:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
        buffer,
      },
      {},
      actor,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        status: 'READY_FOR_IMPORT',
        warnings: [],
        deviceAssignmentStatus: 'NO_DEVICE_ASSIGNMENT',
        deviceCodes: [],
        providedDeviceEmployeeNumber: null,
        effectiveDeviceEmployeeNumber: null,
      }),
    );
  });

  it('returns clear validation errors for invalid codes and device mappings', () => {
    const row = (
      service as unknown as {
        validatePreviewRow: (
          companyId: number,
          rowNumber: number,
          values: Record<string, unknown>,
          dto: Record<string, unknown>,
          references: Record<string, unknown>,
        ) => { errors: string[] };
      }
    ).validatePreviewRow(
      10,
      2,
      {
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@example.com',
        gender: 'female',
        branch_code: 'UNKNOWN-BRANCH',
        department_code: 'UNKNOWN-DEPT',
        position_code: 'UNKNOWN-POS',
        employment_type: 'casual',
        access_device_codes: 'UNKNOWN-DEVICE',
        device_employee_number: 'DEV-1001',
      },
      {},
      {
        branches: [],
        departments: [],
        positions: [],
        shifts: [],
        timetables: [],
        devices: [],
        roles: [],
        employees: [],
        companyUsers: [],
        users: [],
        identifications: [],
        deviceAssignments: [],
        credentials: [],
      },
    );

    expect(row.errors).toEqual(
      expect.arrayContaining([
        'Branch code "UNKNOWN-BRANCH" was not found',
        'Department code "UNKNOWN-DEPT" was not found',
        'Position code "UNKNOWN-POS" was not found',
        expect.stringContaining('employment_type must be one of:'),
        'Access device code "UNKNOWN-DEVICE" does not exist or is inactive.',
      ]),
    );
  });

  it('allows device codes without a device employee number and warns about the fallback', () => {
    const row = (
      service as unknown as {
        validatePreviewRow: (
          companyId: number,
          rowNumber: number,
          values: Record<string, unknown>,
          dto: Record<string, unknown>,
          references: Record<string, unknown>,
        ) => {
          errors: string[];
          warnings: string[];
          previewStatus: string;
          normalizedData: Record<string, unknown>;
        };
      }
    ).validatePreviewRow(
      10,
      3,
      {
        first_name: 'Mary',
        last_name: 'Joseph',
        email: 'mary@example.com',
        gender: 'female',
        access_device_codes: 'DEVICE-DSM-01',
        device_employee_number: '',
      },
      {},
      {
        branches: [],
        departments: [],
        positions: [],
        shifts: [],
        timetables: [],
        devices: [
          {
            id: 1,
            deviceCode: 'DEVICE-DSM-01',
            deviceName: 'Main Gate',
            status: 'active',
          },
        ],
        roles: [],
        employees: [],
        companyUsers: [],
        users: [],
        identifications: [],
        deviceAssignments: [],
        credentials: [],
      },
    );

    expect(row.errors).toEqual([]);
    expect(row.previewStatus).toBe('READY_FOR_IMPORT');
    expect(row.normalizedData.access_device_codes).toEqual(['DEVICE-DSM-01']);
    expect(row.warnings).toEqual(
      expect.arrayContaining([
        'Device employee number is blank. HRMS will use the employee number for access-device assignment during import.',
      ]),
    );
  });

  it('allows a device employee number without device codes and warns that it will be ignored', () => {
    const row = (
      service as unknown as {
        validatePreviewRow: (
          companyId: number,
          rowNumber: number,
          values: Record<string, unknown>,
          dto: Record<string, unknown>,
          references: Record<string, unknown>,
        ) => {
          errors: string[];
          warnings: string[];
          previewStatus: string;
        };
      }
    ).validatePreviewRow(
      10,
      4,
      {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        gender: 'male',
        access_device_codes: '   ',
        device_employee_number: 'DEV-001',
      },
      {},
      {
        branches: [],
        departments: [],
        positions: [],
        shifts: [],
        timetables: [],
        devices: [],
        roles: [],
        employees: [],
        companyUsers: [],
        users: [],
        identifications: [],
        deviceAssignments: [],
        credentials: [],
      },
    );

    expect(row.errors).toEqual([]);
    expect(row.previewStatus).toBe('READY_FOR_IMPORT');
    expect(row.warnings).toEqual(
      expect.arrayContaining([
        'Device employee number was provided without access device codes. It will be ignored during import.',
      ]),
    );
  });

  it('parses multiple device codes, trims spaces, and ignores empty values', () => {
    const row = (
      service as unknown as {
        validatePreviewRow: (
          companyId: number,
          rowNumber: number,
          values: Record<string, unknown>,
          dto: Record<string, unknown>,
          references: Record<string, unknown>,
        ) => {
          errors: string[];
          previewStatus: string;
          normalizedData: Record<string, unknown>;
        };
      }
    ).validatePreviewRow(
      10,
      5,
      {
        first_name: 'Janet',
        last_name: 'Moshi',
        email: 'janet@example.com',
        gender: 'female',
        access_device_codes: 'DEVICE-DSM-01,  , DEVICE-DSM-02  , DEVICE-DSM-01',
        device_employee_number: '000125',
      },
      {},
      {
        branches: [],
        departments: [],
        positions: [],
        shifts: [],
        timetables: [],
        devices: [
          {
            id: 1,
            deviceCode: 'DEVICE-DSM-01',
            deviceName: 'Gate 1',
            status: 'active',
          },
          {
            id: 2,
            deviceCode: 'DEVICE-DSM-02',
            deviceName: 'Gate 2',
            status: 'active',
          },
        ],
        roles: [],
        employees: [],
        companyUsers: [],
        users: [],
        identifications: [],
        deviceAssignments: [],
        credentials: [],
      },
    );

    expect(row.errors).toEqual([]);
    expect(row.previewStatus).toBe('READY_FOR_IMPORT');
    expect(row.normalizedData.access_device_codes).toEqual([
      'DEVICE-DSM-01',
      'DEVICE-DSM-02',
    ]);
  });

  it('previews imported users as pending activation accounts', () => {
    configService.get.mockReturnValueOnce(undefined);

    const row = (
      service as unknown as {
        validatePreviewRow: (
          companyId: number,
          rowNumber: number,
          values: Record<string, unknown>,
          dto: Record<string, unknown>,
          references: Record<string, unknown>,
        ) => {
          errors: string[];
          previewStatus: string;
          userAccount: { action: string; message: string };
        };
      }
    ).validatePreviewRow(
      10,
      6,
      {
        first_name: 'Config',
        last_name: 'Missing',
        email: 'config.missing@example.com',
        gender: 'male',
      },
      {},
      {
        branches: [],
        departments: [],
        positions: [],
        shifts: [],
        timetables: [],
        devices: [],
        roles: [],
        employees: [],
        companyUsers: [],
        users: [],
        identifications: [],
        deviceAssignments: [],
        credentials: [],
      },
    );

    expect(row.previewStatus).toBe('READY_FOR_IMPORT');
    expect(row.userAccount.action).toBe('CREATE_NEW_USER');
    expect(row.userAccount.userStatus).toBe('inactive');
    expect(row.userAccount.passwordChangeRequiredOnFirstLogin).toBe(true);
  });

  it('marks the row invalid when the default Employee role is not configured', () => {
    jest
      .spyOn(service as any, 'findDefaultEmployeeRole')
      .mockReturnValueOnce(null);

    const row = (
      service as unknown as {
        validatePreviewRow: (
          companyId: number,
          rowNumber: number,
          values: Record<string, unknown>,
          dto: Record<string, unknown>,
          references: Record<string, unknown>,
        ) => {
          errors: string[];
          previewStatus: string;
          userAccount: { action: string; message: string };
        };
      }
    ).validatePreviewRow(
      10,
      7,
      {
        first_name: 'Role',
        last_name: 'Missing',
        email: 'role.missing@example.com',
        gender: 'female',
      },
      {},
      {
        branches: [],
        departments: [],
        positions: [],
        shifts: [],
        timetables: [],
        devices: [],
        roles: [],
        employees: [],
        companyUsers: [],
        users: [],
        identifications: [],
        deviceAssignments: [],
        credentials: [],
      },
    );

    expect(row.previewStatus).toBe('INVALID_RECORD');
    expect(row.userAccount.action).toBe('CANNOT_CREATE_USER');
    expect(row.userAccount.message).toContain('Employee role');
  });

  it('flags platform owner accounts as user conflicts during preview', () => {
    const row = (
      service as unknown as {
        validatePreviewRow: (
          companyId: number,
          rowNumber: number,
          values: Record<string, unknown>,
          dto: Record<string, unknown>,
          references: Record<string, unknown>,
        ) => {
          errors: string[];
          previewStatus: string;
          userAccount: { action: string; existingUserId: number | null };
        };
      }
    ).validatePreviewRow(
      10,
      8,
      {
        first_name: 'Mary',
        last_name: 'Joseph',
        email: 'mary.joseph@example.com',
        gender: 'female',
      },
      {},
      {
        branches: [],
        departments: [],
        positions: [],
        shifts: [],
        timetables: [],
        devices: [],
        roles: [],
        employees: [],
        companyUsers: [],
        users: [
          {
            id: 44,
            email: 'mary.joseph@example.com',
            status: 'active',
            user_type: 'OWNER',
          },
        ],
        identifications: [],
        deviceAssignments: [],
        credentials: [],
      },
    );

    expect(row.previewStatus).toBe('INVALID_RECORD');
    expect(row.userAccount.action).toBe('USER_CONFLICT');
    expect(row.userAccount.existingUserId).toBe(44);
  });

  it('reuses an existing user account during preview when it is not linked to another employee in the company', () => {
    const row = (
      service as unknown as {
        validatePreviewRow: (
          companyId: number,
          rowNumber: number,
          values: Record<string, unknown>,
          dto: Record<string, unknown>,
          references: Record<string, unknown>,
        ) => {
          errors: string[];
          previewStatus: string;
          userAccount: {
            action: string;
            existingUserId: number | null;
            message: string;
          };
        };
      }
    ).validatePreviewRow(
      10,
      9,
      {
        first_name: 'Mary',
        last_name: 'Joseph',
        email: 'mary.joseph@example.com',
        gender: 'female',
      },
      {},
      {
        branches: [],
        departments: [],
        positions: [],
        shifts: [],
        timetables: [],
        devices: [],
        roles: [],
        employees: [],
        companyUsers: [],
        users: [
          {
            id: 44,
            email: 'mary.joseph@example.com',
            status: 'active',
            user_type: 'COMPANY_USER',
            must_set_password: false,
          },
        ],
        identifications: [],
        deviceAssignments: [],
        credentials: [],
      },
    );

    expect(row.previewStatus).toBe('READY_FOR_IMPORT');
    expect(row.userAccount.action).toBe('REUSE_EXISTING_LINKED_USER');
    expect(row.userAccount.existingUserId).toBe(44);
    expect(row.userAccount.message).toContain(
      'Existing system user will be added to the company',
    );
  });

  it('generates a stable fallback idempotency key when the confirm header is missing', () => {
    const resolveImportIdempotencyKey = (
      service as unknown as {
        resolveImportIdempotencyKey: (
          companyId: number,
          dto: {
            batch_id?: string;
            preview_token?: string;
            row_ids?: number[];
            excluded_row_ids?: number[];
            skip_existing_records?: boolean;
            exclude_invalid_records?: boolean;
            process_valid_rows_only?: boolean;
          },
          value?: string | null,
        ) => string;
      }
    ).resolveImportIdempotencyKey.bind(service);

    const first = resolveImportIdempotencyKey(
      10,
      {
        preview_token: 'preview-token',
        row_ids: [9, 4, 9, 2],
        excluded_row_ids: [7, 3],
        skip_existing_records: true,
        exclude_invalid_records: true,
        process_valid_rows_only: true,
      },
      null,
    );
    const second = resolveImportIdempotencyKey(
      10,
      {
        preview_token: 'preview-token',
        row_ids: [2, 4, 9],
        excluded_row_ids: [3, 7],
        skip_existing_records: true,
        exclude_invalid_records: true,
        process_valid_rows_only: true,
      },
      undefined,
    );

    expect(first).toMatch(/^auto-employee-import-[a-f0-9]{64}$/);
    expect(second).toBe(first);
  });

  it('queues import confirmation by default in NORMAL mode', async () => {
    const batchRepository = createRepositoryMock();
    const rowRepository = createRepositoryMock();
    const outboxRepository = createRepositoryMock();
    const sequenceRepository = createRepositoryMock();
    const txManager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === EmployeeImportBatch) {
          return batchRepository;
        }
        if (entity === EmployeeImportRow) {
          return rowRepository;
        }
        if (entity === EmployeeImportOutboxEvent) {
          return outboxRepository;
        }
        if (entity === EmployeeNumberSequence) {
          return sequenceRepository;
        }
        return createRepositoryMock();
      }),
    };

    const storedRow = {
      id: 201,
      rowNumber: 2,
      rowKey: 'row-2',
      rawData: {
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@example.com',
        gender: 'female',
      },
      normalizedData: null,
      warnings: [],
      errors: [],
      employeeName: 'Jane Doe',
      employeeNumber: 'EMP-001',
      deviceEmployeeNumber: null,
      importAction: null,
      matchedEmployeeId: null,
      status: EmployeeImportRowStatusEnum.READY,
      resultData: {},
    } as EmployeeImportRow;
    const batch = {
      id: 301,
      companyId: 10,
      batchId: 'IMPORT-20260812-CONFIRM',
      importMode: EmployeeImportModeEnum.CREATE_ONLY,
      status: EmployeeImportBatchStatusEnum.PREVIEW_READY,
      rows: [storedRow],
      metadata: {},
      validationSummary: {},
      totalRows: 1,
      successfulRows: 0,
      failedRows: 0,
      warningRows: 0,
      createdEmployees: 0,
      updatedEmployees: 0,
      createdUsers: 0,
      deviceAssignmentsCreated: 0,
      deviceSyncPending: 0,
    } as EmployeeImportBatch;

    rowRepository.save.mockImplementation(async (value: unknown) => value);
    batchRepository.save.mockImplementation(async (value: unknown) => value);
    outboxRepository.create.mockImplementation((value: unknown) => value);
    outboxRepository.save.mockImplementation(async (value: unknown) => value);
    sequenceRepository.findOne.mockResolvedValue({ id: 1, company_id: 10 });
    (
      service as unknown as {
        dataSource: { transaction: jest.Mock };
      }
    ).dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => unknown) =>
        callback(txManager),
      ),
    };

    jest
      .spyOn(service as any, 'findBatchForProcessing')
      .mockResolvedValue(batch);
    jest.spyOn(service as any, 'loadReferenceData').mockResolvedValue({
      branches: [],
      departments: [],
      positions: [],
      departmentPositionMappings: [],
      shifts: [],
      timetables: [],
      devices: [],
      roles: [],
      employees: [],
      companyUsers: [],
      users: [],
      identifications: [],
      deviceAssignments: [],
      credentials: [],
    });
    jest
      .spyOn(service as any, 'applyActorBranchValidation')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'applyBatchDuplicateValidation')
      .mockImplementation(() => undefined);
    jest
      .spyOn(service as any, 'applyManagerValidation')
      .mockImplementation(() => undefined);
    jest.spyOn(service as any, 'validatePreviewRow').mockReturnValue({
      rowNumber: 2,
      identifier: 'Jane Doe',
      rawData: storedRow.rawData,
      normalizedData: {
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@example.com',
        gender: 'female',
        access_device_codes: [],
      },
      errors: [],
      warnings: [],
      issues: [],
      importAction: 'CREATE',
      matchedEmployeeId: null,
      matchedBy: [],
      existingEmployee: null,
      duplicateInFile: [],
      previewStatus: 'READY_FOR_IMPORT',
      employeeNumber: 'EMP-001',
      deviceEmployeeNumber: null,
      employeeName: 'Jane Doe',
      userAccount: null,
    });
    const processQueuedBatchSpy = jest.spyOn(service, 'processQueuedBatch');

    const result = await service.confirmImport(
      10,
      { preview_token: 'preview-token' },
      actor,
    );

    expect(result.status).toBe(EmployeeImportBatchStatusEnum.QUEUED);
    expect(outboxRepository.save).toHaveBeenCalledTimes(1);
    expect(processQueuedBatchSpy).not.toHaveBeenCalled();
  });

  it('processes import confirmation immediately in SYNC mode', async () => {
    const batchRepository = createRepositoryMock();
    const rowRepository = createRepositoryMock();
    const outboxRepository = createRepositoryMock();
    const sequenceRepository = createRepositoryMock();
    const txManager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === EmployeeImportBatch) {
          return batchRepository;
        }
        if (entity === EmployeeImportRow) {
          return rowRepository;
        }
        if (entity === EmployeeImportOutboxEvent) {
          return outboxRepository;
        }
        if (entity === EmployeeNumberSequence) {
          return sequenceRepository;
        }
        return createRepositoryMock();
      }),
    };

    const storedRow = {
      id: 202,
      rowNumber: 2,
      rowKey: 'row-2',
      rawData: {
        first_name: 'John',
        last_name: 'Importer',
        email: 'john@example.com',
        gender: 'male',
      },
      normalizedData: null,
      warnings: [],
      errors: [],
      employeeName: 'John Importer',
      employeeNumber: 'EMP-002',
      deviceEmployeeNumber: null,
      importAction: null,
      matchedEmployeeId: null,
      status: EmployeeImportRowStatusEnum.READY,
      resultData: {},
    } as EmployeeImportRow;
    const batch = {
      id: 302,
      companyId: 10,
      batchId: 'IMPORT-20260812-SYNC',
      importMode: EmployeeImportModeEnum.CREATE_ONLY,
      status: EmployeeImportBatchStatusEnum.PREVIEW_READY,
      rows: [storedRow],
      metadata: {},
      validationSummary: {},
      totalRows: 1,
      successfulRows: 0,
      failedRows: 0,
      warningRows: 0,
      createdEmployees: 0,
      updatedEmployees: 0,
      createdUsers: 0,
      deviceAssignmentsCreated: 0,
      deviceSyncPending: 0,
    } as EmployeeImportBatch;

    rowRepository.save.mockImplementation(async (value: unknown) => value);
    batchRepository.save.mockImplementation(async (value: unknown) => value);
    outboxRepository.create.mockImplementation((value: unknown) => value);
    outboxRepository.save.mockImplementation(async (value: unknown) => value);
    sequenceRepository.findOne.mockResolvedValue({ id: 1, company_id: 10 });
    (
      service as unknown as {
        dataSource: { transaction: jest.Mock };
      }
    ).dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => unknown) =>
        callback(txManager),
      ),
    };

    jest
      .spyOn(service as any, 'findBatchForProcessing')
      .mockResolvedValue(batch);
    jest.spyOn(service as any, 'loadReferenceData').mockResolvedValue({
      branches: [],
      departments: [],
      positions: [],
      departmentPositionMappings: [],
      shifts: [],
      timetables: [],
      devices: [],
      roles: [],
      employees: [],
      companyUsers: [],
      users: [],
      identifications: [],
      deviceAssignments: [],
      credentials: [],
    });
    jest
      .spyOn(service as any, 'applyActorBranchValidation')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'applyBatchDuplicateValidation')
      .mockImplementation(() => undefined);
    jest
      .spyOn(service as any, 'applyManagerValidation')
      .mockImplementation(() => undefined);
    jest.spyOn(service as any, 'validatePreviewRow').mockReturnValue({
      rowNumber: 2,
      identifier: 'John Importer',
      rawData: storedRow.rawData,
      normalizedData: {
        first_name: 'John',
        last_name: 'Importer',
        email: 'john@example.com',
        gender: 'male',
        access_device_codes: [],
      },
      errors: [],
      warnings: [],
      issues: [],
      importAction: 'CREATE',
      matchedEmployeeId: null,
      matchedBy: [],
      existingEmployee: null,
      duplicateInFile: [],
      previewStatus: 'READY_FOR_IMPORT',
      employeeNumber: 'EMP-002',
      deviceEmployeeNumber: null,
      employeeName: 'John Importer',
      userAccount: null,
    });
    const processQueuedBatchSpy = jest
      .spyOn(service, 'processQueuedBatch')
      .mockResolvedValue(undefined);
    const getResultSpy = jest.spyOn(service, 'getResult').mockResolvedValue({
      batchId: 'IMPORT-20260812-SYNC',
      status: EmployeeImportBatchStatusEnum.COMPLETED,
      totalRows: 1,
      successfulRows: 1,
      failedRows: 0,
      skippedRows: 0,
      warningRows: 0,
      createdEmployees: 1,
      updatedEmployees: 0,
      createdUsers: 1,
      deviceAssignmentsCreated: 0,
      deviceSyncPending: 0,
      summary: { successfullyImported: 1 },
      rows: [],
      previewToken: null,
      previewExpiresAt: null,
      previewSummary: null,
      duplicateRows: 0,
      validRows: 1,
      invalidRows: 0,
      importMode: EmployeeImportModeEnum.CREATE_ONLY,
      originalFileName: 'employees.xlsx',
      fileSize: 0,
      createdAt: new Date(),
      completedAt: new Date(),
      startedAt: new Date(),
      updatedEmployeesCount: 0,
    } as unknown as Awaited<ReturnType<EmployeeImportService['getResult']>>);

    const result = await service.confirmImport(
      10,
      {
        preview_token: 'preview-token',
        execution_mode: EmployeeImportExecutionModeEnum.SYNC,
      },
      actor,
    );

    expect(outboxRepository.save).not.toHaveBeenCalled();
    expect(processQueuedBatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 10,
        databaseBatchId: 302,
        batchId: 'IMPORT-20260812-SYNC',
      }),
      'sync-IMPORT-20260812-SYNC',
    );
    expect(getResultSpy).toHaveBeenCalledWith(10, 'IMPORT-20260812-SYNC');
    expect(result.status).toBe(EmployeeImportBatchStatusEnum.COMPLETED);
  });

  it('fails confirm once when employee number configuration is missing for create rows', async () => {
    const batchRepository = createRepositoryMock();
    const rowRepository = createRepositoryMock();
    const outboxRepository = createRepositoryMock();
    const sequenceRepository = createRepositoryMock();
    const txManager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === EmployeeImportBatch) {
          return batchRepository;
        }
        if (entity === EmployeeImportRow) {
          return rowRepository;
        }
        if (entity === EmployeeImportOutboxEvent) {
          return outboxRepository;
        }
        if (entity === EmployeeNumberSequence) {
          return sequenceRepository;
        }
        return createRepositoryMock();
      }),
    };

    const storedRow = {
      id: 203,
      rowNumber: 2,
      rowKey: 'row-2',
      rawData: {
        first_name: 'Prefix',
        last_name: 'Missing',
        email: 'prefix.missing@example.com',
        gender: 'female',
      },
      normalizedData: null,
      warnings: [],
      errors: [],
      employeeName: 'Prefix Missing',
      employeeNumber: null,
      deviceEmployeeNumber: null,
      importAction: null,
      matchedEmployeeId: null,
      status: EmployeeImportRowStatusEnum.READY,
      resultData: {},
    } as EmployeeImportRow;
    const batch = {
      id: 303,
      companyId: 10,
      batchId: 'IMPORT-20260812-NO-PREFIX',
      importMode: EmployeeImportModeEnum.CREATE_ONLY,
      status: EmployeeImportBatchStatusEnum.PREVIEW_READY,
      rows: [storedRow],
      metadata: {},
      validationSummary: {},
    } as EmployeeImportBatch;

    sequenceRepository.findOne.mockResolvedValue(null);
    (
      service as unknown as {
        dataSource: { transaction: jest.Mock };
      }
    ).dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => unknown) =>
        callback(txManager),
      ),
    };

    jest
      .spyOn(service as any, 'findBatchForProcessing')
      .mockResolvedValue(batch);
    jest.spyOn(service as any, 'loadReferenceData').mockResolvedValue({
      branches: [],
      departments: [],
      positions: [],
      departmentPositionMappings: [],
      shifts: [],
      timetables: [],
      devices: [],
      roles: [],
      employees: [],
      companyUsers: [],
      users: [],
      identifications: [],
      deviceAssignments: [],
      credentials: [],
    });
    jest
      .spyOn(service as any, 'applyActorBranchValidation')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'applyBatchDuplicateValidation')
      .mockImplementation(() => undefined);
    jest
      .spyOn(service as any, 'applyManagerValidation')
      .mockImplementation(() => undefined);
    jest.spyOn(service as any, 'validatePreviewRow').mockReturnValue({
      rowNumber: 2,
      identifier: 'Prefix Missing',
      rawData: storedRow.rawData,
      normalizedData: {
        first_name: 'Prefix',
        last_name: 'Missing',
        email: 'prefix.missing@example.com',
        gender: 'female',
        access_device_codes: [],
      },
      errors: [],
      warnings: [],
      issues: [],
      importAction: 'CREATE',
      matchedEmployeeId: null,
      matchedBy: [],
      existingEmployee: null,
      duplicateInFile: [],
      previewStatus: 'READY_FOR_IMPORT',
      employeeNumber: null,
      deviceEmployeeNumber: null,
      employeeName: 'Prefix Missing',
      userAccount: null,
    });

    await expect(
      service.confirmImport(10, { preview_token: 'preview-token' }, actor),
    ).rejects.toThrow(
      'Configure the employee number format before confirming employee imports that create employees.',
    );
    expect(outboxRepository.save).not.toHaveBeenCalled();
  });

  it('creates a company membership through UsersService for a new import user', async () => {
    const ensureEmployeeImportAccount = jest.fn().mockResolvedValue({
      user: { id: 91 },
      membership: {
        id: 18,
        company_id: 10,
        user_id: 91,
        status: 'active',
      },
      action: 'CREATED',
    });
    (
      service as unknown as {
        usersService: { ensureEmployeeImportAccount: jest.Mock };
      }
    ).usersService = {
      ensureEmployeeImportAccount,
    };
    jest
      .spyOn(service as any, 'getRequiredDefaultEmployeeRole')
      .mockResolvedValue({ id: 7, name: 'EMPLOYEE' });

    const membership = await (
      service as unknown as {
        ensureMembershipForImportRow: (
          companyId: number,
          previewRow: Record<string, unknown>,
          manager?: unknown,
        ) => Promise<{
          membership: { id: number; user_id: number };
          createdUserId: number;
          linkedUserId: number;
          userAction: string;
        }>;
      }
    ).ensureMembershipForImportRow(10, {
      importAction: 'CREATE',
      normalizedData: {
        first_name: 'Api',
        last_name: 'Import',
        email: 'api.import.tx@example.com',
      },
    });

    expect(ensureEmployeeImportAccount).toHaveBeenCalledWith(
      10,
      {
        email: 'api.import.tx@example.com',
        firstName: 'Api',
        lastName: 'Import',
        roleNames: ['EMPLOYEE'],
      },
      undefined,
    );
    expect(membership.membership.id).toBe(18);
    expect(membership.membership.user_id).toBe(91);
    expect(membership.createdUserId).toBe(91);
    expect(membership.linkedUserId).toBe(91);
    expect(membership.userAction).toBe('CREATE_NEW_USER');
  });

  it('reuses an existing system user through UsersService without creating a duplicate import account', async () => {
    const ensureEmployeeImportAccount = jest.fn().mockResolvedValue({
      user: { id: 91 },
      membership: {
        id: 18,
        company_id: 10,
        user_id: 91,
        status: 'active',
      },
      action: 'REUSED',
    });
    (
      service as unknown as {
        usersService: { ensureEmployeeImportAccount: jest.Mock };
      }
    ).usersService = {
      ensureEmployeeImportAccount,
    };
    jest
      .spyOn(service as any, 'getRequiredDefaultEmployeeRole')
      .mockResolvedValue({ id: 7, name: 'EMPLOYEE' });

    const membership = await (
      service as unknown as {
        ensureMembershipForImportRow: (
          companyId: number,
          previewRow: Record<string, unknown>,
          manager?: unknown,
        ) => Promise<{
          membership: { id: number; user_id: number };
          createdUserId: number | null;
          linkedUserId: number;
          userAction: string;
        }>;
      }
    ).ensureMembershipForImportRow(10, {
      importAction: 'CREATE',
      normalizedData: {
        first_name: 'Api',
        last_name: 'Reuse',
        email: 'api.reuse.tx@example.com',
      },
    });

    expect(ensureEmployeeImportAccount).toHaveBeenCalledWith(
      10,
      {
        email: 'api.reuse.tx@example.com',
        firstName: 'Api',
        lastName: 'Reuse',
        roleNames: ['EMPLOYEE'],
      },
      undefined,
    );
    expect(membership.membership.id).toBe(18);
    expect(membership.membership.user_id).toBe(91);
    expect(membership.createdUserId).toBeNull();
    expect(membership.linkedUserId).toBe(91);
    expect(membership.userAction).toBe('REUSE_EXISTING_LINKED_USER');
  });

  it('reuses the existing linked membership for update rows', async () => {
    const companyUserRepository = (
      service as unknown as {
        companyUserRepository: MockRepo;
      }
    ).companyUserRepository;
    companyUserRepository.findOne
      .mockResolvedValueOnce({
        id: 19,
        company_id: 10,
        user_id: 92,
        status: 'active',
      })
      .mockResolvedValueOnce({
        id: 19,
        company_id: 10,
        user_id: 92,
        status: 'active',
      });
    const companiesService = {
      addUserToCompany: jest.fn().mockResolvedValue(undefined),
    };
    (
      service as unknown as {
        companiesService: typeof companiesService;
      }
    ).companiesService = companiesService as never;
    jest
      .spyOn(service as any, 'getRequiredDefaultEmployeeRole')
      .mockResolvedValue({ id: 7, name: 'EMPLOYEE' });

    const membership = await (
      service as unknown as {
        ensureMembershipForImportRow: (
          companyId: number,
          previewRow: Record<string, unknown>,
          manager?: unknown,
        ) => Promise<{
          membership: { id: number; user_id: number };
          createdUserId: number | null;
          linkedUserId: number;
          userAction: string;
        }>;
      }
    ).ensureMembershipForImportRow(10, {
      importAction: 'UPDATE',
      existingEmployee: {
        id: 19,
        companyUserId: 19,
        userId: 92,
      },
      normalizedData: {},
    });

    expect(companiesService.addUserToCompany).toHaveBeenCalledWith(
      92,
      10,
      {
        roleNames: ['EMPLOYEE'],
      },
      undefined,
    );
    expect(membership.membership.id).toBe(19);
    expect(membership.membership.user_id).toBe(92);
    expect(membership.createdUserId).toBeNull();
    expect(membership.linkedUserId).toBe(92);
    expect(membership.userAction).toBe('REUSE_EXISTING_LINKED_USER');
  });

  it('creates employees from the old template with default timetable and shift assignments', async () => {
    const batchRepository = (
      service as unknown as {
        batchRepository: MockRepo;
      }
    ).batchRepository;
    const rowRepository = (
      service as unknown as {
        rowRepository: MockRepo;
      }
    ).rowRepository;
    const employeesService = {
      createForCompanyUser: jest.fn().mockResolvedValue({
        employeeId: 38,
        onboardingRequestId: null,
      }),
      update: jest.fn(),
    };
    const txEmployeeRepository = {
      findOneOrFail: jest.fn().mockResolvedValue({
        id: 38,
        employee_no: 'EMP-1001',
        first_name: 'Jane',
        middle_name: null,
        last_name: 'Doe',
      }),
    };
    const batchQueryBuilder: Record<string, jest.Mock> = {
      leftJoinAndSelect: jest.fn(() => batchQueryBuilder),
      where: jest.fn(() => batchQueryBuilder),
      andWhere: jest.fn(() => batchQueryBuilder),
      orderBy: jest.fn(() => batchQueryBuilder),
      setLock: jest.fn(() => batchQueryBuilder),
      getOne: jest.fn(() => Promise.resolve(storedBatch)),
    };
    const txManager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Employee) {
          return txEmployeeRepository;
        }
        if (entity === EmployeeImportBatch) {
          return {
            ...batchRepository,
            createQueryBuilder: jest.fn(() => batchQueryBuilder),
          };
        }
        if (entity === EmployeeImportRow) {
          return rowRepository;
        }
        return createRepositoryMock();
      }),
    };

    (
      service as unknown as {
        employeesService: typeof employeesService;
        dataSource: {
          transaction: jest.Mock;
        };
      }
    ).employeesService = employeesService;
    (
      service as unknown as {
        dataSource: {
          transaction: jest.Mock;
        };
      }
    ).dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => unknown) =>
        callback(txManager),
      ),
    };

    const storedRow = {
      rowNumber: 2,
      rawData: {
        first_name: 'Jane',
        middle_name: '',
        last_name: 'Doe',
        employee_number: '',
        email: 'jane.old-template@example.com',
        gender: 'female',
        employment_date: '2026-07-28',
        branch_code: 'HQ',
        department_code: 'HR',
        position_code: 'HRO',
        employment_type: 'full_time',
        access_device_codes: '',
        device_employee_number: '',
      },
      errors: [],
      warnings: [],
      normalizedData: null,
      importAction: null,
      employeeName: 'Jane Doe',
      employeeNumber: null,
      deviceEmployeeNumber: null,
      matchedEmployeeId: null,
      status: EmployeeImportRowStatusEnum.QUEUED,
    } as EmployeeImportRow;

    const storedBatch = {
      id: 502,
      companyId: 10,
      batchId: 'IMPORT-20260812-OLD-TEMPLATE',
      previewToken: 'preview-token',
      status: EmployeeImportBatchStatusEnum.QUEUED,
      importMode: EmployeeImportModeEnum.CREATE_ONLY,
      metadata: {
        process_valid_rows_only: true,
        requested_by: { ...actor },
      },
      rows: [storedRow],
    } as EmployeeImportBatch;

    batchRepository.findOne.mockResolvedValue(storedBatch);
    batchRepository.save.mockImplementation((value: unknown) => value);
    batchRepository.update = jest.fn().mockResolvedValue(undefined);
    rowRepository.save.mockImplementation((value: unknown) => value);
    rowRepository.find.mockResolvedValue([storedRow]);

    jest.spyOn(service as any, 'loadReferenceData').mockResolvedValue({
      branches: [{ id: 1, code: 'HQ', name: 'Head Office', status: 'active' }],
      departments: [
        {
          id: 2,
          code: 'HR',
          name: 'Human Resources',
          branch_id: 1,
          status: 'active',
        },
      ],
      positions: [
        {
          id: 3,
          code: 'HRO',
          name: 'HR Officer',
          branch_id: 1,
          department_id: 2,
          status: 'active',
        },
      ],
      departmentPositionMappings: [],
      shifts: [
        {
          id: 4,
          code: 'DAY',
          name: 'Day Shift',
          status: 'ACTIVE',
        },
      ],
      timetables: [
        {
          id: 5,
          code: 'STD',
          name: 'Standard Week',
          status: 'ACTIVE',
          isDefault: true,
          days: [
            {
              dayOfWeek: 2,
              isWorkingDay: true,
              defaultShiftId: 4,
            },
          ],
        },
      ],
      devices: [],
      roles: [],
      employees: [],
      companyUsers: [],
      users: [],
      identifications: [],
      deviceAssignments: [],
      credentials: [],
    });
    jest
      .spyOn(service as any, 'applyActorBranchValidation')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'applyBatchDuplicateValidation')
      .mockImplementation(() => undefined);
    jest
      .spyOn(service as any, 'applyManagerValidation')
      .mockImplementation(() => undefined);
    jest
      .spyOn(service as any, 'ensureMembershipForImportRow')
      .mockResolvedValue({
        membership: { id: 18, user_id: 41 },
        createdUserId: 41,
        linkedUserId: 41,
        userAction: 'CREATE_NEW_USER',
      });
    jest
      .spyOn(service as any, 'applyManagerAssignments')
      .mockResolvedValue(undefined);

    const jobData: EmployeeImportJobData = {
      companyId: 10,
      databaseBatchId: 502,
      batchId: 'IMPORT-20260812-OLD-TEMPLATE',
      requestedByUserId: actor.id,
      requestedByCompanyUserId: actor.companyMembershipId ?? null,
    };

    await service.processQueuedBatch(jobData, 'worker-1');

    expect(employeesService.createForCompanyUser).toHaveBeenCalledWith(
      10,
      18,
      expect.objectContaining({
        first_name: 'Jane',
        last_name: 'Doe',
        hire_date: '2026-07-28',
      }),
      expect.objectContaining({ id: actor.id, email: actor.email }),
      txManager,
    );
    expect(employeeTimetablesService.create).toHaveBeenCalledWith(
      10,
      {
        employee_id: 38,
        timetable_id: 5,
        effective_from: '2026-07-28',
      },
      txManager,
    );
    expect(shiftAssignmentsService.create).toHaveBeenCalledWith(
      10,
      {
        employee_id: 38,
        shift_id: 4,
        effective_from: '2026-07-28',
      },
      txManager,
    );
    expect(storedRow.status).toBe(EmployeeImportRowStatusEnum.IMPORTED);
    expect(storedRow.createdEmployeeId).toBe(38);
  });

  it('uses the next standard employee number when import employee_number is blank', async () => {
    const batchRepository = (
      service as unknown as {
        batchRepository: MockRepo;
      }
    ).batchRepository;
    const rowRepository = (
      service as unknown as {
        rowRepository: MockRepo;
      }
    ).rowRepository;
    const employeesService = {
      createForCompanyUser: jest.fn().mockResolvedValue({
        employeeId: 37,
        onboardingRequestId: null,
      }),
      update: jest.fn(),
    };
    const txEmployeeRepository = {
      findOneOrFail: jest.fn().mockResolvedValue({
        id: 37,
        employee_no: '000037',
      }),
    };
    const batchQueryBuilder: Record<string, jest.Mock> = {
      leftJoinAndSelect: jest.fn(() => batchQueryBuilder),
      where: jest.fn(() => batchQueryBuilder),
      andWhere: jest.fn(() => batchQueryBuilder),
      orderBy: jest.fn(() => batchQueryBuilder),
      setLock: jest.fn(() => batchQueryBuilder),
      getOne: jest.fn(() => Promise.resolve(storedBatch)),
    };
    const txManager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Employee) {
          return txEmployeeRepository;
        }
        if (entity === EmployeeImportBatch) {
          return {
            ...batchRepository,
            createQueryBuilder: jest.fn(() => batchQueryBuilder),
          };
        }
        if (entity === EmployeeImportRow) {
          return rowRepository;
        }
        return createRepositoryMock();
      }),
    };
    (
      service as unknown as {
        employeesService: typeof employeesService;
        dataSource: {
          transaction: jest.Mock;
        };
      }
    ).employeesService = employeesService;
    (
      service as unknown as {
        dataSource: {
          transaction: jest.Mock;
        };
      }
    ).dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => unknown) =>
        callback(txManager),
      ),
    };

    const storedRow = {
      rowNumber: 2,
      rawData: {
        first_name: 'Ahlam',
        last_name: 'Salim',
        email: 'ahlam.import@example.com',
        gender: 'female',
      },
      errors: [],
      warnings: [],
      normalizedData: null,
      importAction: null,
      employeeName: 'Ahlam Salim',
      employeeNumber: null,
      deviceEmployeeNumber: null,
      matchedEmployeeId: null,
      status: EmployeeImportRowStatusEnum.QUEUED,
    } as EmployeeImportRow;

    const storedBatch = {
      id: 501,
      companyId: 10,
      batchId: 'IMPORT-20260727-BLANK-EMP-NO',
      previewToken: 'preview-token',
      status: EmployeeImportBatchStatusEnum.QUEUED,
      importMode: EmployeeImportModeEnum.CREATE_ONLY,
      metadata: {
        process_valid_rows_only: true,
        requested_by: { ...actor },
      },
      rows: [storedRow],
    } as EmployeeImportBatch;
    batchRepository.findOne.mockResolvedValue(storedBatch);
    batchRepository.save.mockImplementation((value: unknown) => value);
    batchRepository.update = jest.fn().mockResolvedValue(undefined);
    rowRepository.save.mockImplementation((value: unknown) => value);
    rowRepository.find.mockResolvedValue([storedRow]);

    jest.spyOn(service as any, 'loadReferenceData').mockResolvedValue({
      branches: [],
      departments: [],
      positions: [],
      shifts: [],
      timetables: [],
      devices: [],
      roles: [],
      employees: [],
      companyUsers: [],
      users: [],
      identifications: [],
      deviceAssignments: [],
      credentials: [],
    });
    jest
      .spyOn(service as any, 'applyActorBranchValidation')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'applyBatchDuplicateValidation')
      .mockImplementation(() => undefined);
    jest
      .spyOn(service as any, 'applyManagerValidation')
      .mockImplementation(() => undefined);
    jest
      .spyOn(service as any, 'ensureMembershipForImportRow')
      .mockResolvedValue({
        membership: { id: 18, user_id: 41 },
        createdUserId: 41,
        linkedUserId: 41,
        userAction: 'CREATE_NEW_USER',
      });
    jest
      .spyOn(service as any, 'applyAssignmentsAndCredentials')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'applyManagerAssignments')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'validatePreviewRow')
      .mockImplementation(
        (_: number, rowNumber: number, values: Record<string, unknown>) => ({
          rowNumber,
          rawData: values,
          normalizedData: {
            first_name: 'Ahlam',
            last_name: 'Salim',
            email: 'ahlam.import@example.com',
            gender: 'female',
            employee_number: null,
            employee_status: EmploymentStatusEnum.ACTIVE,
            access_device_codes: [],
          },
          errors: [],
          warnings: [],
          importAction: 'CREATE',
          matchedEmployeeId: null,
          employeeNumber: null,
          deviceEmployeeNumber: null,
          employeeName: 'Ahlam Salim',
          userAccount: {
            action: 'CREATE_NEW_USER',
            loginIdentifier: 'ahlam.import@example.com',
            role: 'Employee',
            status: 'VALID',
            userStatus: 'active',
            existingUserId: null,
            message: 'A new active system user will be created.',
            passwordChangeRequiredOnFirstLogin: false,
            limitation: null,
          },
        }),
      );

    const jobData: EmployeeImportJobData = {
      companyId: 10,
      databaseBatchId: 501,
      batchId: 'IMPORT-20260727-BLANK-EMP-NO',
      requestedByUserId: actor.id,
      requestedByCompanyUserId: actor.companyMembershipId ?? null,
    };

    await service.processQueuedBatch(jobData, 'worker-1');

    expect(employeesService.createForCompanyUser).toHaveBeenCalledWith(
      10,
      18,
      expect.objectContaining({
        employment_status: EmploymentStatusEnum.ACTIVE,
        onboarding: {
          auto_start: false,
        },
      }),
      expect.objectContaining({ id: actor.id, email: actor.email }),
      txManager,
    );
    expect(storedRow.status).toBe(EmployeeImportRowStatusEnum.IMPORTED);
    expect(storedRow.createdEmployeeId).toBe(37);
    expect(storedRow.createdUserId).toBe(41);
    expect(storedRow.employeeNumber).toBe('000037');
    expect(storedBatch.createdEmployees).toBe(1);
    expect(storedBatch.failedRows).toBe(0);
  });

  it('returns batch result details as JSON summary data', async () => {
    const batchRepository = (
      service as unknown as {
        batchRepository: MockRepo;
      }
    ).batchRepository;

    batchRepository.findOne.mockResolvedValue({
      id: 14,
      batchId: 'IMPORT-20260730-RESULT',
      previewToken: 'preview-token',
      status: EmployeeImportBatchStatusEnum.COMPLETED_WITH_ERRORS,
      importMode: EmployeeImportModeEnum.CREATE_ONLY,
      originalFileName: 'employees.xlsx',
      fileSize: '2048',
      totalRows: 3,
      validRows: 1,
      invalidRows: 2,
      duplicateRows: 1,
      successfulRows: 1,
      failedRows: 0,
      warningRows: 0,
      createdEmployees: 1,
      updatedEmployees: 0,
      createdUsers: 1,
      deviceAssignmentsCreated: 0,
      deviceSyncPending: 0,
      metadata: {
        skipped_rows: 2,
      },
      validationSummary: {
        preview: {
          readyForImport: 1,
          existingRecords: 1,
        },
        result: {
          selectedForImport: 1,
          successfullyImported: 1,
          existingSkipped: 1,
        },
      },
      rows: [
        {
          id: 77,
          rowNumber: 2,
          employeeName: 'Jane Doe',
          employeeNumber: 'EMP-0001',
          deviceEmployeeNumber: null,
          importAction: 'CREATE',
          matchedEmployeeId: null,
          createdEmployeeId: 501,
          createdUserId: 601,
          status: EmployeeImportRowStatusEnum.IMPORTED,
          errors: [],
          warnings: [],
          resultData: {
            preview_status: 'READY_FOR_IMPORT',
            final_status: 'IMPORTED',
            identifier: 'Jane Doe',
            issues: [],
          },
        },
      ],
      startedAt: new Date('2026-07-30T08:00:00.000Z'),
      completedAt: new Date('2026-07-30T08:05:00.000Z'),
      createdAt: new Date('2026-07-30T07:55:00.000Z'),
      updatedAt: new Date('2026-07-30T08:05:00.000Z'),
      previewExpiresAt: new Date('2026-07-30T08:30:00.000Z'),
    });

    const result = (await service.getResult(10, 'IMPORT-20260730-RESULT')) as {
      batchId: string;
      status: EmployeeImportBatchStatusEnum;
      summary: {
        selectedForImport: number;
        successfullyImported: number;
      };
      previewSummary: {
        readyForImport: number;
        existingRecords: number;
      };
      rows: Array<Record<string, unknown>>;
    };

    expect(result.batchId).toBe('IMPORT-20260730-RESULT');
    expect(result.status).toBe(
      EmployeeImportBatchStatusEnum.COMPLETED_WITH_ERRORS,
    );
    expect(result.summary.selectedForImport).toBe(1);
    expect(result.summary.successfullyImported).toBe(1);
    expect(result.previewSummary.readyForImport).toBe(1);
    expect(result.previewSummary.existingRecords).toBe(1);
    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        rowId: 77,
        status: 'IMPORTED',
        previewStatus: 'READY_FOR_IMPORT',
        employeeId: 501,
        userId: 601,
      }),
    );
  });

  it('returns stored preview rows for an existing import batch', async () => {
    const batchRepository = (
      service as unknown as {
        batchRepository: MockRepo;
      }
    ).batchRepository;

    batchRepository.findOne.mockResolvedValue({
      id: 19,
      batchId: 'IMPORT-20260730-PREVIEW',
      previewToken: 'preview-token',
      status: EmployeeImportBatchStatusEnum.COMPLETED_WITH_ERRORS,
      importMode: EmployeeImportModeEnum.CREATE_OR_UPDATE,
      totalRows: 2,
      metadata: {
        process_valid_rows_only: true,
      },
      validationSummary: {
        preview: {
          totalRows: 2,
          readyForImport: 1,
          invalidRecords: 1,
          duplicateInFileRecords: 0,
        },
      },
      rows: [
        {
          id: 11,
          rowNumber: 2,
          employeeName: 'Jane Doe',
          employeeNumber: 'EMP-0001',
          deviceEmployeeNumber: null,
          importAction: 'CREATE',
          errors: [],
          warnings: [],
          resultData: {
            preview_status: 'READY_FOR_IMPORT',
            identifier: 'Jane Doe',
            issues: [],
          },
        },
        {
          id: 12,
          rowNumber: 3,
          employeeName: 'John Smith',
          employeeNumber: 'EMP-0002',
          deviceEmployeeNumber: null,
          importAction: null,
          errors: ['Email is required'],
          warnings: [],
          resultData: {
            preview_status: 'INVALID_RECORD',
            identifier: 'John Smith',
            issues: [
              {
                field: 'email',
                value: '',
                message: 'Email is required',
              },
            ],
          },
        },
      ],
      previewExpiresAt: new Date('2026-07-30T08:30:00.000Z'),
    });

    const result = (await service.getPreview(
      10,
      'IMPORT-20260730-PREVIEW',
    )) as {
      batchId: string;
      previewToken: string | null;
      process_valid_rows_only: boolean;
      totalRows: number;
      validRows: number;
      invalidRows: number;
      rowsReadyForImport: number;
      summary: {
        readyForImport: number;
        invalidRecords: number;
      };
      rows: Array<Record<string, unknown>>;
    };

    expect(result.batchId).toBe('IMPORT-20260730-PREVIEW');
    expect(result.previewToken).toBeNull();
    expect(result.process_valid_rows_only).toBe(true);
    expect(result.totalRows).toBe(2);
    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(1);
    expect(result.rowsReadyForImport).toBe(1);
    expect(result.summary.readyForImport).toBe(1);
    expect(result.summary.invalidRecords).toBe(1);
    expect(result.rows).toEqual([
      expect.objectContaining({
        rowId: 11,
        rowNumber: 2,
        status: 'READY_FOR_IMPORT',
        selectable: true,
      }),
      expect.objectContaining({
        rowId: 12,
        rowNumber: 3,
        status: 'INVALID_RECORD',
        selectable: false,
      }),
    ]);
  });

  it('downloads an enriched workbook report for an import batch', async () => {
    const batchRepository = (
      service as unknown as {
        batchRepository: MockRepo;
      }
    ).batchRepository;

    batchRepository.findOne.mockResolvedValue({
      batchId: 'IMPORT-20260730-REPORT',
      completedAt: new Date('2026-07-30T08:15:42.000Z'),
      rows: [
        {
          rowNumber: 4,
          rawData: {
            first_name: 'Mary',
            last_name: 'Joseph',
            email: 'mary@example.com',
            branch_code: 'HQ',
            department_code: 'FIN',
            position_code: 'ACC',
            employment_type: 'full_time',
          },
          normalizedData: {
            branch_code: 'HQ',
            branch_name: 'Head Office',
            department_code: null,
            department_name: null,
            position_code: 'ACC',
            position_name: 'Accountant',
            employment_type: 'full_time',
            shift_name: 'General Shift',
            timetable_name: 'Standard Week',
          },
          status: EmployeeImportRowStatusEnum.SKIPPED,
          importAction: 'CREATE',
          createdEmployeeId: null,
          createdUserId: null,
          errors: ['Department code "FIN" was not found'],
          warnings: [],
          resultData: {
            preview_status: 'INVALID_RECORD',
            matched_by: ['email'],
            existing_employee: {
              fullName: 'Mary Joseph',
            },
          },
        },
      ],
    });

    const result = await service.downloadResult(10, 'IMPORT-20260730-REPORT');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      result.buffer.buffer.slice(
        result.buffer.byteOffset,
        result.buffer.byteOffset + result.buffer.byteLength,
      ) as ArrayBuffer,
    );

    expect(result.fileName).toMatch(
      /^employee-import-result-\d{8}-\d{6}\.xlsx$/,
    );
    const reviewSheet = workbook.getWorksheet('Employee Import Mapping Review');
    expect(reviewSheet?.getCell('A1').text).toBe(
      'Employee Import Mapping Review',
    );
    expect(reviewSheet?.getCell('A3').text).toBe('Metric');
    expect(reviewSheet?.getCell('A11').text).toBe('Excel row number');
    expect(reviewSheet?.getCell('A12').value).toBe(4);
    expect(reviewSheet?.getCell('B12').text).toBe('');
    expect(reviewSheet?.getCell('C12').text).toBe('Mary Joseph');
    expect(reviewSheet?.getCell('F12').text).toBe('Head Office');
    expect(reviewSheet?.getCell('O12').text).toBe('General Shift');
    expect(reviewSheet?.getCell('P12').text).toBe('Standard Week');
    expect(reviewSheet?.getCell('R12').text).toBe('FAILED');
    expect(reviewSheet?.getCell('S12').text).toContain(
      'Department code "FIN" was not found',
    );

    const resultSheet = workbook.getWorksheet('Import Results');
    expect(resultSheet?.getRow(1).values).toEqual(
      expect.arrayContaining([
        'preview_status',
        'matched_by',
        'existing_employee',
      ]),
    );
    expect(resultSheet?.getRow(2).values).toEqual(
      expect.arrayContaining([
        'SKIPPED',
        'INVALID_RECORD',
        'email',
        'Mary Joseph',
      ]),
    );
  });
});
