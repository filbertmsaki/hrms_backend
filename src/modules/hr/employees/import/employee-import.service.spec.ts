import { BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import ExcelJS from 'exceljs';
jest.mock('digest-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));
import { EmployeeImportService } from './employee-import.service';
import { EmployeeImportBatch } from './entities/employee-import-batch.entity';
import { EmployeeImportRow } from './entities/employee-import-row.entity';
import { Employee } from '../entities/employee.entity';
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

describe('EmployeeImportService', () => {
  let service: EmployeeImportService;

  const actor: AuthenticatedUser = {
    id: 9,
    email: 'hr@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: 10,
    companyMembershipId: 33,
    roles: [],
    permissions: [],
  };

  beforeEach(() => {
    service = new EmployeeImportService(
      {} as DataSource,
      createRepositoryMock() as unknown as Repository<EmployeeImportBatch>,
      createRepositoryMock() as unknown as Repository<EmployeeImportRow>,
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
      {} as never,
      {} as never,
      {} as never,
    );
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
    expect(employeeSheet?.getCell('H2').dataValidation.type).toBe('list');
    expect(employeeSheet?.getCell('H2').dataValidation.formulae).toEqual([
      'BranchCodes',
    ]);
    expect(employeeSheet?.getCell('I2').dataValidation.type).toBe('list');
    expect(employeeSheet?.getCell('I2').dataValidation.formulae).toEqual([
      'DepartmentCodes',
    ]);
    expect(employeeSheet?.getCell('J2').dataValidation.type).toBe('list');
    expect(employeeSheet?.getCell('J2').dataValidation.formulae).toEqual([
      'PositionCodes',
    ]);
    expect(employeeSheet?.getCell('K2').dataValidation.type).toBe('list');
    expect(employeeSheet?.getCell('K2').dataValidation.formulae).toEqual([
      'EmploymentTypes',
    ]);
    expect(employeeSheet?.getCell('F2').dataValidation.type).toBe('list');
    expect(employeeSheet?.getCell('F2').dataValidation.formulae).toEqual([
      'GenderValues',
    ]);
    expect(employeeSheet?.getCell('L2').dataValidation.type).toBe('list');
    expect(employeeSheet?.getCell('L2').dataValidation.formulae).toEqual([
      'AccessDeviceCodes',
    ]);
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
      'phone_number',
    ]);
    sheet.addRow([
      'Jane',
      'Jane',
      'Doe',
      'jane@example.com',
      'female',
      '+255712345678',
    ]);
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
        expect.stringContaining('Unsupported columns detected: phone_number'),
      ]),
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
    expect(result.rows[0]?.status).toBe('READY');
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
        'branch_code "UNKNOWN-BRANCH" does not match any branch code',
        'department_code "UNKNOWN-DEPT" does not match any department code',
        'position_code "UNKNOWN-POS" does not match any position code',
        expect.stringContaining('employment_type must be one of:'),
        'access_device_codes contain invalid device code(s): UNKNOWN-DEVICE',
        'device_employee_number requires at least one valid access_device_codes value',
      ]),
    );
  });

  it('creates company membership in the same transaction when importing a new system user', async () => {
    const addUserToCompany = jest.fn().mockResolvedValue(undefined);
    (
      service as unknown as {
        companiesService: { addUserToCompany: jest.Mock };
      }
    ).companiesService = {
      addUserToCompany,
    };
    (
      service as unknown as { usersService: { generateUserNo: jest.Mock } }
    ).usersService = {
      generateUserNo: jest.fn().mockResolvedValue('USER-2026-00091'),
    };

    const userRepo = createRepositoryMock();
    const companyUserRepo = createRepositoryMock();
    const transactionalManager = { name: 'tx-manager' };

    userRepo.findOne.mockResolvedValue(null);
    userRepo.save.mockResolvedValue({
      id: 91,
      status: 'active',
    });
    companyUserRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 18,
      company_id: 10,
      user_id: 91,
      status: 'active',
    });

    const membership = await (
      service as unknown as {
        ensureMembershipForImportRow: (
          companyId: number,
          normalizedData: Record<string, unknown>,
          actor: AuthenticatedUser,
          userRepo: MockRepo,
          companyUserRepo: MockRepo,
          createSystemUser: boolean,
          roleId: number | null,
          manager?: unknown,
        ) => Promise<{ id: number; user_id: number }>;
      }
    ).ensureMembershipForImportRow(
      10,
      {
        first_name: 'Api',
        last_name: 'Import',
        email: 'api.import.tx@example.com',
        phone_number: '+255700000001',
        temporary_password: 'Employee123!',
      },
      actor,
      userRepo as unknown as MockRepo,
      companyUserRepo as unknown as MockRepo,
      true,
      7,
      transactionalManager,
    );

    expect(addUserToCompany).toHaveBeenCalledWith(
      91,
      10,
      { roleIds: [7] },
      transactionalManager,
    );
    expect(membership).toEqual(
      expect.objectContaining({
        id: 18,
        user_id: 91,
      }),
    );
  });

  it('creates an inactive placeholder membership when importing without phone details', async () => {
    const addUserToCompany = jest.fn().mockResolvedValue(undefined);
    (
      service as unknown as {
        companiesService: { addUserToCompany: jest.Mock };
      }
    ).companiesService = {
      addUserToCompany,
    };
    (
      service as unknown as { usersService: { generateUserNo: jest.Mock } }
    ).usersService = {
      generateUserNo: jest.fn().mockResolvedValue('USER-2026-00092'),
    };

    const userRepo = createRepositoryMock();
    const companyUserRepo = createRepositoryMock();

    userRepo.findOne.mockResolvedValue(null);
    userRepo.save.mockResolvedValue({
      id: 92,
      status: 'inactive',
    });
    companyUserRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 19,
      company_id: 10,
      user_id: 92,
      status: 'active',
    });
    companyUserRepo.save.mockResolvedValue({
      id: 19,
      company_id: 10,
      user_id: 92,
      status: 'active',
    });

    const membership = await (
      service as unknown as {
        ensureMembershipForImportRow: (
          companyId: number,
          normalizedData: Record<string, unknown>,
          actor: AuthenticatedUser,
          userRepo: MockRepo,
          companyUserRepo: MockRepo,
          createSystemUser: boolean,
          roleId: number | null,
          manager?: unknown,
        ) => Promise<{ id: number; user_id: number }>;
      }
    ).ensureMembershipForImportRow(
      10,
      {
        first_name: 'Api',
        last_name: 'Import',
        email: 'api.import.placeholder@example.com',
      },
      actor,
      userRepo as unknown as MockRepo,
      companyUserRepo as unknown as MockRepo,
      false,
      null,
    );

    expect(addUserToCompany).not.toHaveBeenCalled();
    expect(companyUserRepo.save).toHaveBeenCalled();
    expect(membership).toEqual(
      expect.objectContaining({
        id: 19,
        user_id: 92,
      }),
    );
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
    const txManager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Employee) {
          return txEmployeeRepository;
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
      status: EmployeeImportRowStatusEnum.READY,
    } as EmployeeImportRow;

    batchRepository.findOne.mockResolvedValue({
      batchId: 'IMPORT-20260727-BLANK-EMP-NO',
      previewToken: 'preview-token',
      status: EmployeeImportBatchStatusEnum.PREVIEW_READY,
      importMode: EmployeeImportModeEnum.CREATE_ONLY,
      metadata: {
        process_valid_rows_only: true,
      },
      rows: [storedRow],
    });
    batchRepository.save.mockImplementation((value: unknown) => value);
    rowRepository.save.mockImplementation((value: unknown) => value);

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
    jest.spyOn(service as any, 'resolveRole').mockResolvedValue(null);
    jest
      .spyOn(service as any, 'ensureMembershipForImportRow')
      .mockResolvedValue({ id: 18, user_id: 41 });
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
            access_device_codes: [],
          },
          errors: [],
          warnings: [],
          importAction: 'CREATE',
          matchedEmployeeId: null,
          employeeNumber: null,
          deviceEmployeeNumber: null,
          employeeName: 'Ahlam Salim',
        }),
      );

    const result = await service.confirmImport(
      10,
      {
        preview_token: 'preview-token',
        process_valid_rows_only: true,
      },
      actor,
    );

    expect(employeesService.createForCompanyUser).toHaveBeenCalledWith(
      10,
      18,
      expect.objectContaining({
        employment_status: EmploymentStatusEnum.ACTIVE,
        onboarding: {
          auto_start: false,
        },
      }),
      actor,
      txManager,
    );
    expect(result.successfulRows).toBe(1);
    expect(result.failedRows).toBe(0);
    expect(result.createdEmployees).toBe(1);
    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        status: 'IMPORTED',
        employeeId: 37,
        userId: 41,
        employeeNumber: '000037',
      }),
    );
  });
});
