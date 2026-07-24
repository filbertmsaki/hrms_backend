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
    jest.spyOn(service as never, 'loadReferenceData').mockResolvedValue({
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
      .spyOn(service as never, 'applyActorBranchValidation')
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
    expect(employeeSheet?.getRow(1).values).toEqual(
      expect.arrayContaining([
        'first_name',
        'last_name',
        'email',
        'phone_number',
        'gender',
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

  it('reports duplicate headers and missing required columns during preview', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Employees');
    sheet.addRow(['first_name', 'first_name', 'last_name', 'email', 'gender']);
    sheet.addRow(['Jane', 'Jane', 'Doe', 'jane@example.com', 'female']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    jest.spyOn(service as never, 'loadReferenceData').mockResolvedValue({
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
      .spyOn(service as never, 'applyActorBranchValidation')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as never, 'applyManagerValidation')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as never, 'applyBatchDuplicateValidation')
      .mockImplementation(() => undefined);
    jest
      .spyOn(service as never, 'validatePreviewRow')
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
      .spyOn(service as never, 'persistPreviewBatch')
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
        expect.stringContaining('Missing required columns: phone_number'),
      ]),
    );
  });
});
