import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import ExcelJS from 'exceljs';
import { validateSync } from 'class-validator';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { CompaniesService } from '../../../companies/companies.service';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { Role } from '../../../roles/entities/role.entity';
import { UsersService } from '../../../users/users.service';
import { User } from '../../../users/entities/user.entity';
import { AttendanceDevice } from '../../../access-control/attendance-devices/entities/attendance-device.entity';
import { AttendanceDeviceStatusEnum } from '../../../access-control/attendance-devices/enums/attendance-device-status.enum';
import { EmployeeAccessCredential } from '../../../access-control/employee-access-credentials/entity/employee-access-credential.entity';
import { EmployeeAccessCredentialSourceEnum } from '../../../access-control/employee-access-credentials/enum/employee-access-credential-source.enum';
import { EmployeeAccessCredentialStatusEnum } from '../../../access-control/employee-access-credentials/enum/employee-access-credential-status.enum';
import { EmployeeAccessCredentialTypeEnum } from '../../../access-control/employee-access-credentials/enum/employee-access-credential-type.enum';
import { EmployeeDeviceAssignment } from '../../../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeDeviceAssignmentSyncStatusEnum } from '../../../access-control/employee-device-assignments/enum/employee-device-assignment-sync-status.enum';
import { ShiftAssignmentsService } from '../../attendance/shift/shift-assignments/shift-assignments.service';
import { ShiftStatusEnum } from '../../attendance/shift/shifts/enums/shift-status.enum';
import { Shift } from '../../attendance/shift/shifts/entities/shift.entity';
import { EmployeeTimetablesService } from '../../attendance/timetable/employee-timetables/employee-timetables.service';
import { TimetableStatusEnum } from '../../attendance/timetable/timetables/enums/timetable-status.enum';
import { Timetable } from '../../attendance/timetable/timetables/entities/timetable.entity';
import { Branch } from '../../branches/entities/branch.entity';
import { Department } from '../../departments/entities/department.entity';
import { DepartmentPosition } from '../../departments/entities/department-position.entity';
import { CreateEmployeeDto } from '../dtos/create-employee.dto';
import { EmployeeContactInputDto } from '../dtos/employee-contact-input.dto';
import { EmployeeImportBatch } from './entities/employee-import-batch.entity';
import { EmployeeImportRow } from './entities/employee-import-row.entity';
import { EmployeeImportConfirmDto } from './dto/employee-import-confirm.dto';
import { EmployeeImportHistoryQueryDto } from './dto/employee-import-history-query.dto';
import { EmployeeImportPreviewRequestDto } from './dto/employee-import-preview-request.dto';
import { EmployeeImportResponseDto } from './dto/employee-import-response.dto';
import { EmployeeImportBatchStatusEnum } from './enums/employee-import-batch-status.enum';
import { EmployeeImportModeEnum } from './enums/employee-import-mode.enum';
import { EmployeeImportRowStatusEnum } from './enums/employee-import-row-status.enum';
import { Employee } from '../entities/employee.entity';
import { EmployeeIdentification } from '../entities/employee-identification.entity';
import { EmploymentStatusEnum } from '../enums/employment-status.enum';
import { EmploymentTypeEnum } from '../enums/employment-type.enum';
import { EmployeesService } from '../employees.service';
import { HrAccessService } from '../../shared/hr-access.service';
import { Position } from '../../positions/entities/position.entity';
import { buildPaginationMeta } from '../../shared/hr.utils';
import { AddressTypeEnum } from '../enums/address-type.enum';
import { IdentificationTypeEnum } from '../enums/identification-type.enum';
import { ContactTypeEnum } from '../enums/contact-type.enum';
import { HikvisionImportSyncService } from '../../../hikvision/hikvision-import-sync.service';
import { BranchesService } from '../../branches/branches.service';
import { ResetPasswordDto } from '../../../auth/dtos/reset-password.dto';

type UploadedExcelFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type PreviewRecordStatus =
  | 'READY_FOR_IMPORT'
  | 'EXISTING_RECORD'
  | 'DUPLICATE_IN_FILE'
  | 'INVALID_RECORD';

type FinalRecordStatus =
  | PreviewRecordStatus
  | 'EXCLUDED_BY_USER'
  | 'IMPORTED'
  | 'IMPORT_FAILED';

type DeviceAssignmentPreviewStatus =
  | 'NO_DEVICE_ASSIGNMENT'
  | 'DEVICE_ASSIGNMENT_READY'
  | 'INVALID_DEVICE_CODE'
  | 'INVALID_DEVICE_EMPLOYEE_NUMBER'
  | 'DUPLICATE_DEVICE_EMPLOYEE_NUMBER'
  | 'DEVICE_ASSIGNMENT_WARNING';

type RowIssue = {
  field: string;
  value: unknown;
  message: string;
  suggestion?: string;
  type?: 'validation' | 'duplicate' | 'existing';
};

type ExistingEmployeeSummary = {
  id: number;
  companyUserId: number;
  userId: number | null;
  employeeNumber: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
};

type ExistingEmployeeMatch = {
  employee: ExistingEmployeeSummary;
  matchedBy: string[];
};

type DuplicateInFileIssue = {
  field: string;
  value: string;
  rowNumbers: number[];
  identifiers: string[];
};

type DeviceAssignmentPreview = {
  status: DeviceAssignmentPreviewStatus;
  message: string;
  deviceCodes: string[];
  providedDeviceEmployeeNumber: string | null;
  effectiveDeviceEmployeeNumber: string | null;
};

type DeviceAssignmentSourceRow = Pick<
  EmployeeImportRow,
  | 'rawData'
  | 'normalizedData'
  | 'warnings'
  | 'errors'
  | 'resultData'
  | 'deviceEmployeeNumber'
>;

type PreviewResponseRowSource = DeviceAssignmentSourceRow & {
  id: number | null;
  rowNumber: number;
  employeeName: string | null;
  employeeNumber: string | null;
  importAction: string | null;
  matchedEmployeeId: number | null;
};

type UserAccountAction =
  | 'CREATE_NEW_USER'
  | 'REUSE_EXISTING_LINKED_USER'
  | 'USER_CONFLICT'
  | 'CANNOT_CREATE_USER';

type UserAccountPreview = {
  action: UserAccountAction;
  loginIdentifier: string | null;
  role: string | null;
  status: 'VALID' | 'INVALID';
  userStatus: string | null;
  existingUserId: number | null;
  message: string;
  passwordChangeRequiredOnFirstLogin: boolean;
  limitation: string | null;
};

type PreviewRow = {
  rowNumber: number;
  identifier: string;
  rawData: Record<string, unknown>;
  normalizedData: Record<string, unknown> | null;
  errors: string[];
  warnings: string[];
  issues: RowIssue[];
  importAction: string | null;
  matchedEmployeeId: number | null;
  matchedBy: string[];
  existingEmployee: ExistingEmployeeSummary | null;
  duplicateInFile: DuplicateInFileIssue[];
  previewStatus: PreviewRecordStatus;
  employeeNumber: string | null;
  deviceEmployeeNumber: string | null;
  employeeName: string | null;
  userAccount: UserAccountPreview | null;
};

type ReferenceData = {
  branches: Branch[];
  departments: Department[];
  positions: Position[];
  departmentPositionMappings: DepartmentPosition[];
  shifts: Shift[];
  timetables: Timetable[];
  devices: AttendanceDevice[];
  roles: Role[];
  employees: Array<{
    id: number;
    employee_no: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    company_user_id: number;
    user_id: number | null;
    reports_to: number | null;
    email: string | null;
    phone: string | null;
  }>;
  companyUsers: CompanyUser[];
  users: User[];
  identifications: EmployeeIdentification[];
  deviceAssignments: EmployeeDeviceAssignment[];
  credentials: EmployeeAccessCredential[];
};

const EMPLOYEE_SHEET = 'Employees';
const INSTRUCTIONS_SHEET = 'Instructions';
const SUPPORTED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);
const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_IMPORT_ROW_COUNT = 1000;
const PREVIEW_TTL_MS = 30 * 60 * 1000;
const TEMPLATE_VALIDATION_ROW_COUNT = 500;
const GENDER_VALUES = ['male', 'female'] as const;

const IMPORT_COLUMNS = [
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
] as const;

type ImportColumn = (typeof IMPORT_COLUMNS)[number];

const REQUIRED_COLUMNS: ImportColumn[] = [
  'first_name',
  'last_name',
  'email',
  'gender',
];

@Injectable()
export class EmployeeImportService {
  private readonly logger = new Logger(EmployeeImportService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(EmployeeImportBatch)
    private readonly batchRepository: Repository<EmployeeImportBatch>,
    @InjectRepository(EmployeeImportRow)
    private readonly rowRepository: Repository<EmployeeImportRow>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(DepartmentPosition)
    private readonly departmentPositionRepository: Repository<DepartmentPosition>,
    @InjectRepository(Position)
    private readonly positionRepository: Repository<Position>,
    @InjectRepository(Shift)
    private readonly shiftRepository: Repository<Shift>,
    @InjectRepository(Timetable)
    private readonly timetableRepository: Repository<Timetable>,
    @InjectRepository(AttendanceDevice)
    private readonly attendanceDeviceRepository: Repository<AttendanceDevice>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(EmployeeIdentification)
    private readonly identificationRepository: Repository<EmployeeIdentification>,
    @InjectRepository(EmployeeDeviceAssignment)
    private readonly employeeDeviceAssignmentRepository: Repository<EmployeeDeviceAssignment>,
    @InjectRepository(EmployeeAccessCredential)
    private readonly credentialRepository: Repository<EmployeeAccessCredential>,
    private readonly employeesService: EmployeesService,
    private readonly companiesService: CompaniesService,
    private readonly usersService: UsersService,
    private readonly shiftAssignmentsService: ShiftAssignmentsService,
    private readonly employeeTimetablesService: EmployeeTimetablesService,
    private readonly hrAccessService: HrAccessService,
    private readonly configService: ConfigService,
    private readonly branchesService: BranchesService,
    private readonly hikvisionImportSyncService: HikvisionImportSyncService,
  ) {}

  async downloadTemplate(
    companyId: number,
    actor: AuthenticatedUser,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const workbook = new ExcelJS.Workbook();
    const employeeSheet = workbook.addWorksheet(EMPLOYEE_SHEET);
    const instructionsSheet = workbook.addWorksheet(INSTRUCTIONS_SHEET);
    const references = await this.loadReferenceData(companyId);
    const branchById = new Map(
      references.branches.map((branch) => [branch.id, branch]),
    );
    const departmentById = new Map(
      references.departments.map((department) => [department.id, department]),
    );
    const mappingsByPositionId = new Map<number, DepartmentPosition[]>();
    references.departmentPositionMappings.forEach((mapping) => {
      const existing = mappingsByPositionId.get(mapping.position_id) ?? [];
      existing.push(mapping);
      mappingsByPositionId.set(mapping.position_id, existing);
    });
    const branchReferenceRows = references.branches
      .filter((branch) => this.optionalString(branch.code))
      .map((branch) => ({
        code: branch.code ?? '',
        name: branch.name,
        status: branch.status,
      }));
    const departmentReferenceRows = references.departments
      .filter((department) => this.optionalString(department.code))
      .map((department) => ({
        code: department.code ?? '',
        name: department.name,
        branch_code:
          references.branches.find(
            (branch) => branch.id === department.branch_id,
          )?.code ?? '',
        status: department.status,
      }));
    const positionReferenceRows = references.positions
      .filter((position) => this.optionalString(position.code))
      .flatMap((position) => {
        const mappings = mappingsByPositionId.get(position.id) ?? [];
        if (!mappings.length) {
          return [
            {
              code: position.code ?? '',
              name: position.name,
              department_code:
                departmentById.get(position.department_id ?? 0)?.code ?? '',
              branch_code: branchById.get(position.branch_id ?? 0)?.code ?? '',
              status: position.status,
            },
          ];
        }

        return mappings.map((mapping) => {
          const department = departmentById.get(mapping.department_id);
          const branch = department
            ? branchById.get(department.branch_id ?? 0)
            : undefined;

          return {
            code: position.code ?? '',
            name: position.name,
            department_code: department?.code ?? '',
            branch_code: branch?.code ?? '',
            status: position.status,
          };
        });
      });
    const accessDeviceReferenceRows = references.devices.map((device) => ({
      device_code: device.deviceCode,
      device_name: device.deviceName,
      status: device.status,
    }));

    employeeSheet.addRow(IMPORT_COLUMNS);
    const headerRow = employeeSheet.getRow(1);
    headerRow.font = { bold: true };
    employeeSheet.views = [{ state: 'frozen', ySplit: 1 }];
    employeeSheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: IMPORT_COLUMNS.length },
    };

    const requiredSet = new Set<string>(REQUIRED_COLUMNS);
    IMPORT_COLUMNS.forEach((column, index) => {
      const worksheetColumn = employeeSheet.getColumn(index + 1);
      worksheetColumn.width = Math.max(column.length + 6, 18);
      if (requiredSet.has(column)) {
        headerRow.getCell(index + 1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFDE68A' },
        };
      }
    });

    employeeSheet.addRow([
      'Jane',
      '',
      'Doe',
      'EMP-0001',
      'jane.doe@example.com',
      'female',
      '2026-07-24',
      'ARU',
      'ARU_ACCOUNTS_FINANCE',
      'EXECUTIVE',
      EmploymentTypeEnum.FULL_TIME,
      '',
      '',
    ]);
    employeeSheet.getRow(2).font = { italic: true };

    instructionsSheet.columns = [
      { header: 'Topic', key: 'topic', width: 28 },
      { header: 'Details', key: 'details', width: 100 },
    ];
    instructionsSheet.getRow(1).font = { bold: true };
    instructionsSheet.views = [{ state: 'frozen', ySplit: 1 }];
    const instructionRows = [
      ['Required columns', REQUIRED_COLUMNS.join(', ')],
      [
        'Optional columns',
        IMPORT_COLUMNS.filter((column) => !requiredSet.has(column)).join(', '),
      ],
      ['Date format', 'Use ISO date values like YYYY-MM-DD.'],
      ['Gender values', GENDER_VALUES.join(', ')],
      ['Employment type values', Object.values(EmploymentTypeEnum).join(', ')],
      [
        'Access devices',
        'Optional. Enter one or more active access-device codes separated by commas using values from the Access Devices sheet. Leave blank to import the employee without any device assignment.',
      ],
      [
        'Device employee number',
        'Optional. Enter the employee number to use on the access-control device. If access devices are provided and this field is blank, HRMS uses the employee number generated for the imported employee.',
      ],
      [
        'Lookup strategy',
        'Use branch_code, department_code, position_code, and access_device_codes exactly as listed in the reference sheets. Department codes are branch-specific, and position codes are reusable but only valid where mapped in the Positions sheet.',
      ],
      [
        'Unique values',
        'Employee number is unique per company when provided. Email is unique per user. device_employee_number must be unique per selected device.',
      ],
      [
        'Optional blanks',
        'Blank optional cells are ignored. Employees can be imported successfully without access-device assignment. In update mode, blank cells do not clear existing values.',
      ],
      [
        'Existing employee matching',
        'Rows are matched using employee_number and email. CREATE_ONLY rejects matches, UPDATE_EXISTING requires a match.',
      ],
      [
        'User records',
        'The current HRMS schema always links employees to company users. When no existing user is found by email, the import creates an inactive placeholder user and membership so the employee record can be created without extra login fields.',
      ],
      [
        'Template example row',
        'The italic sample row is for guidance only and must be removed before import.',
      ],
    ];
    instructionRows.forEach(([topic, details]) =>
      instructionsSheet.addRow({ topic, details }),
    );

    this.addReferenceSheet(
      workbook,
      'Branches',
      ['code', 'name', 'status'],
      branchReferenceRows,
    );
    this.addReferenceSheet(
      workbook,
      'Departments',
      ['code', 'name', 'branch_code', 'status'],
      departmentReferenceRows,
    );
    this.addReferenceSheet(
      workbook,
      'Positions',
      ['code', 'name', 'department_code', 'branch_code', 'status'],
      positionReferenceRows,
    );
    this.addReferenceSheet(
      workbook,
      'Access Devices',
      ['device_code', 'device_name', 'status'],
      accessDeviceReferenceRows,
    );
    this.addReferenceSheet(
      workbook,
      'Employment Types',
      ['value'],
      Object.values(EmploymentTypeEnum).map((value) => ({ value })),
    );
    this.addReferenceSheet(
      workbook,
      'Genders',
      ['value'],
      GENDER_VALUES.map((value) => ({ value })),
    );

    this.addListValidationFromSheet(
      workbook,
      employeeSheet,
      'branch_code',
      'Branches',
      1,
      'BranchCodes',
    );
    this.addListValidationFromSheet(
      workbook,
      employeeSheet,
      'department_code',
      'Departments',
      1,
      'DepartmentCodes',
    );
    this.addListValidationFromSheet(
      workbook,
      employeeSheet,
      'position_code',
      'Positions',
      1,
      'PositionCodes',
    );
    this.addListValidationFromSheet(
      workbook,
      employeeSheet,
      'employment_type',
      'Employment Types',
      1,
      'EmploymentTypes',
    );
    this.addListValidationFromSheet(
      workbook,
      employeeSheet,
      'gender',
      'Genders',
      1,
      'GenderValues',
    );
    this.addListValidationFromSheet(
      workbook,
      employeeSheet,
      'access_device_codes',
      'Access Devices',
      1,
      'AccessDeviceCodes',
      {
        errorStyle: 'warning',
        errorTitle: 'Use device codes',
        error:
          'Select a single device from the dropdown, or enter multiple device codes as a comma-separated list using the Access Devices sheet.',
      },
    );

    await this.applyActorBranchValidation(
      companyId,
      actor,
      references.branches,
    );

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return {
      buffer,
      fileName: `employee-import-template-${companyId}.xlsx`,
    };
  }

  async previewImport(
    companyId: number,
    file: UploadedExcelFile,
    dto: EmployeeImportPreviewRequestDto,
    actor: AuthenticatedUser,
  ) {
    this.assertSupportedFile(file);
    const workbook = await this.loadWorkbook(file.buffer);
    const employeeSheet = this.resolveEmployeeWorksheet(workbook);
    const { headers, unsupportedHeaders } = this.readHeaders(employeeSheet);
    const headerErrors = this.validateHeaders(headers, unsupportedHeaders);
    const rawRows = this.readEmployeeRows(employeeSheet, headers);
    if (rawRows.length === 0) {
      throw new BadRequestException(
        'The uploaded Excel file does not contain any employee records',
      );
    }
    if (rawRows.length > MAX_IMPORT_ROW_COUNT) {
      throw new BadRequestException(
        `The uploaded Excel file exceeds the maximum supported row count of ${MAX_IMPORT_ROW_COUNT}`,
      );
    }
    const references = await this.loadReferenceData(companyId);
    await this.applyActorBranchValidation(
      companyId,
      actor,
      references.branches,
    );

    const rows = rawRows.map((rawRow) =>
      this.validatePreviewRow(
        companyId,
        rawRow.rowNumber,
        rawRow.values,
        dto,
        references,
      ),
    );

    this.applyBatchDuplicateValidation(rows);
    this.applyManagerValidation(companyId, rows, references);
    rows.forEach((row) => {
      row.previewStatus = this.determinePreviewStatus(row);
    });

    if (headerErrors.length > 0) {
      rows.forEach((row) => {
        headerErrors.forEach((error) =>
          this.addIssue(
            row,
            '__file__',
            null,
            error,
            error.toLowerCase().includes('missing required columns')
              ? 'Update the worksheet headers to match the template before re-uploading.'
              : undefined,
          ),
        );
        row.importAction = null;
        row.normalizedData = null;
        row.previewStatus = 'INVALID_RECORD';
      });
    }

    const batch = await this.persistPreviewBatch(
      companyId,
      file,
      dto,
      actor,
      rows,
    );
    const summary = this.buildPreviewSummary(rows);

    return {
      batchId: batch.batchId,
      previewToken: batch.previewToken,
      status: batch.status,
      importMode: batch.importMode,
      previewExpiresAt: batch.previewExpiresAt,
      process_valid_rows_only:
        (batch.metadata?.process_valid_rows_only as boolean | undefined) ??
        true,
      totalRows: batch.totalRows,
      validRows: summary.readyForImport,
      invalidRows: summary.invalidRecords,
      duplicateRows: summary.duplicateInFileRecords,
      rowsReadyForImport: summary.readyForImport,
      summary,
      rows: batch.rows?.length
        ? batch.rows
            .sort((left, right) => left.rowNumber - right.rowNumber)
            .map((storedRow) => {
              const previewRow =
                rows.find((row) => row.rowNumber === storedRow.rowNumber) ??
                null;
              return this.buildPreviewResponseRow(storedRow, previewRow);
            })
        : rows.map((previewRow) =>
            this.buildPreviewResponseRow(
              {
                id: null,
                rowNumber: previewRow.rowNumber,
                employeeName: previewRow.employeeName,
                employeeNumber: previewRow.employeeNumber,
                deviceEmployeeNumber: previewRow.deviceEmployeeNumber,
                importAction: previewRow.importAction,
                rawData: previewRow.rawData,
                normalizedData: previewRow.normalizedData,
                errors: previewRow.errors,
                warnings: previewRow.warnings,
                matchedEmployeeId: previewRow.matchedEmployeeId,
                resultData: {
                  preview_status: previewRow.previewStatus,
                  identifier: previewRow.identifier,
                  issues: previewRow.issues,
                  matched_by: previewRow.matchedBy,
                  existing_employee: previewRow.existingEmployee,
                  duplicate_in_file: previewRow.duplicateInFile,
                  device_assignment: this.buildDeviceAssignmentPreview(
                    {
                      rawData: previewRow.rawData,
                      normalizedData: previewRow.normalizedData,
                      warnings: previewRow.warnings,
                      errors: previewRow.errors,
                      resultData: null,
                      deviceEmployeeNumber: previewRow.deviceEmployeeNumber,
                    },
                    previewRow,
                  ),
                },
              },
              previewRow,
            ),
          ),
    };
  }

  async confirmImport(
    companyId: number,
    dto: EmployeeImportConfirmDto,
    actor: AuthenticatedUser,
  ): Promise<EmployeeImportResponseDto & { rows: Record<string, unknown>[] }> {
    const batchId = this.optionalString(dto.batch_id);
    const previewToken = this.optionalString(dto.preview_token);
    if (!batchId && !previewToken) {
      throw new BadRequestException(
        'batch_id or preview_token is required to confirm an employee import',
      );
    }

    const batch = await this.batchRepository.findOne({
      where: {
        companyId,
        ...(batchId ? { batchId } : { previewToken: previewToken! }),
      },
      relations: {
        rows: true,
      },
    });

    if (!batch) {
      throw new NotFoundException('Import preview batch not found');
    }

    if (
      batch.previewExpiresAt &&
      batch.previewExpiresAt.getTime() < Date.now()
    ) {
      batch.status = EmployeeImportBatchStatusEnum.EXPIRED;
      await this.batchRepository.save(batch);
      throw new BadRequestException('Import preview token has expired');
    }

    const references = await this.loadReferenceData(companyId);
    await this.applyActorBranchValidation(
      companyId,
      actor,
      references.branches,
    );

    const previewRows = batch.rows.map((row) =>
      this.validatePreviewRow(
        companyId,
        row.rowNumber,
        row.rawData,
        {
          import_mode: batch.importMode,
          process_valid_rows_only:
            (batch.metadata?.process_valid_rows_only as boolean | undefined) ??
            true,
        },
        references,
      ),
    );

    this.applyBatchDuplicateValidation(previewRows);
    this.applyManagerValidation(companyId, previewRows, references);
    previewRows.forEach((row) => {
      row.previewStatus = this.determinePreviewStatus(row);
    });

    const previewRowsByStoredId = new Map<number, PreviewRow>();
    batch.rows.forEach((storedRow) => {
      const previewRow =
        previewRows.find((row) => row.rowNumber === storedRow.rowNumber) ??
        null;
      if (previewRow) {
        previewRowsByStoredId.set(this.getStoredRowKey(storedRow), previewRow);
      }
    });

    const invalidRows = previewRows.filter(
      (row) => row.previewStatus !== 'READY_FOR_IMPORT',
    );
    const processValidRowsOnly = dto.process_valid_rows_only ?? true;
    const selectedRowIds = this.resolveSelectedRowIds(
      batch.rows,
      previewRowsByStoredId,
      dto,
    );
    const requestedInvalidSelections = Array.from(selectedRowIds).filter(
      (rowId) =>
        previewRowsByStoredId.get(rowId)?.previewStatus !== 'READY_FOR_IMPORT',
    );
    if (requestedInvalidSelections.length > 0) {
      throw new BadRequestException(
        `Only rows that are ready for import can be confirmed. Invalid selection row IDs: ${requestedInvalidSelections.join(', ')}`,
      );
    }

    const existingRows = previewRows.filter(
      (row) => row.previewStatus === 'EXISTING_RECORD',
    );
    if (existingRows.length > 0 && dto.skip_existing_records !== true) {
      throw new BadRequestException(
        'Existing records were detected in the preview. Set skip_existing_records to true after review before confirming the import.',
      );
    }

    const invalidOrDuplicateRows = previewRows.filter((row) =>
      ['INVALID_RECORD', 'DUPLICATE_IN_FILE'].includes(row.previewStatus),
    );
    if (
      invalidOrDuplicateRows.length > 0 &&
      dto.exclude_invalid_records !== true
    ) {
      throw new BadRequestException(
        'Invalid or duplicate rows were detected in the preview. Set exclude_invalid_records to true after review before confirming the import.',
      );
    }

    if (!processValidRowsOnly && invalidRows.length > 0) {
      throw new BadRequestException(
        'The import contains invalid rows and cannot be processed in all-or-nothing mode.',
      );
    }

    batch.status = EmployeeImportBatchStatusEnum.IMPORTING;
    batch.startedAt = new Date();
    await this.batchRepository.save(batch);

    const rowResults: Record<string, unknown>[] = [];
    const importedEmployeesByNumber = new Map<string, number>();
    let createdEmployees = 0;
    let updatedEmployees = 0;
    let createdUsers = 0;
    let existingUsersReused = 0;
    let employeeRoleAssignmentsCompleted = 0;
    let failedUserCreations = 0;
    let deviceAssignmentsCreated = 0;
    let deviceSyncPending = 0;
    let existingSkipped = 0;
    let invalidSkipped = 0;
    let duplicateInFileSkipped = 0;
    let excludedByUser = 0;
    const userConflicts = previewRows.filter(
      (row) => row.userAccount?.action === 'USER_CONFLICT',
    ).length;

    for (const previewRow of previewRows) {
      const storedRow =
        batch.rows.find((row) => row.rowNumber === previewRow.rowNumber) ??
        null;
      if (!storedRow) {
        continue;
      }

      storedRow.errors = previewRow.errors;
      storedRow.warnings = previewRow.warnings;
      storedRow.normalizedData = previewRow.normalizedData;
      storedRow.importAction = previewRow.importAction;
      storedRow.employeeName = previewRow.employeeName;
      storedRow.employeeNumber = previewRow.employeeNumber;
      storedRow.deviceEmployeeNumber = previewRow.deviceEmployeeNumber;
      storedRow.matchedEmployeeId = previewRow.matchedEmployeeId;
      storedRow.resultData = {
        ...(storedRow.resultData ?? {}),
        preview_status: previewRow.previewStatus,
        identifier: previewRow.identifier,
        issues: previewRow.issues,
        matched_by: previewRow.matchedBy,
        existing_employee: previewRow.existingEmployee,
        duplicate_in_file: previewRow.duplicateInFile,
        user_account: previewRow.userAccount,
        device_assignment: this.buildDeviceAssignmentPreview(
          storedRow,
          previewRow,
        ),
      };

      if (previewRow.previewStatus !== 'READY_FOR_IMPORT') {
        storedRow.status = EmployeeImportRowStatusEnum.SKIPPED;
        const finalStatus = previewRow.previewStatus;
        storedRow.resultData = {
          ...(storedRow.resultData ?? {}),
          final_status: finalStatus,
          reason: this.describeNonReadyPreviewRow(previewRow),
        };
        if (finalStatus === 'EXISTING_RECORD') {
          existingSkipped += 1;
        } else if (finalStatus === 'DUPLICATE_IN_FILE') {
          duplicateInFileSkipped += 1;
        } else {
          invalidSkipped += 1;
        }
        rowResults.push(this.buildRowResult(storedRow));
        continue;
      }

      if (!selectedRowIds.has(this.getStoredRowKey(storedRow))) {
        storedRow.status = EmployeeImportRowStatusEnum.SKIPPED;
        storedRow.resultData = {
          ...(storedRow.resultData ?? {}),
          final_status: 'EXCLUDED_BY_USER',
          reason: 'Excluded during import confirmation',
        };
        excludedByUser += 1;
        rowResults.push(this.buildRowResult(storedRow));
        continue;
      }

      try {
        const result = await this.dataSource.transaction(async (manager) => {
          const normalizedData = previewRow.normalizedData ?? {};
          const importAction = previewRow.importAction ?? 'CREATE';
          let employeeId: number;
          let createdUserId: number | null = null;
          let linkedUserId: number | null =
            previewRow.existingEmployee?.userId ?? null;
          let userAction: UserAccountAction =
            previewRow.userAccount?.action ?? 'CANNOT_CREATE_USER';

          if (importAction === 'UPDATE') {
            employeeId = previewRow.matchedEmployeeId!;
            const updateDto = this.buildEmployeeUpdateDto(normalizedData);
            await this.employeesService.update(
              companyId,
              employeeId,
              updateDto,
              actor,
            );
          } else {
            const account = await this.ensureMembershipForImportRow(
              companyId,
              previewRow,
              manager,
            );

            createdUserId = account.createdUserId;
            linkedUserId = account.linkedUserId;
            userAction = account.userAction;

            const creation = await this.employeesService.createForCompanyUser(
              companyId,
              account.membership.id,
              this.buildEmployeeCreateDto(normalizedData),
              actor,
              manager,
            );
            employeeId = creation.employeeId;
          }

          const employee = await manager.getRepository(Employee).findOneOrFail({
            where: { id: employeeId },
          });

          const primaryBranchId = this.toNumber(normalizedData.branch_id);
          if (linkedUserId && primaryBranchId) {
            await this.branchesService.grantAccess(
              companyId,
              primaryBranchId,
              linkedUserId,
              manager,
            );
          }

          await this.applyAssignmentsAndCredentials(
            companyId,
            employee,
            normalizedData,
            null,
            importedEmployeesByNumber,
            manager.getRepository(EmployeeDeviceAssignment),
            manager.getRepository(EmployeeAccessCredential),
          );

          return {
            employee,
            createdUserId,
            linkedUserId,
            action: importAction,
            userAction,
          };
        });

        const employeeNumber = result.employee.employee_no?.trim();
        if (employeeNumber) {
          importedEmployeesByNumber.set(employeeNumber, result.employee.id);
          storedRow.employeeNumber = employeeNumber;
        }
        const assignedDeviceCodes = this.parseMultiValue(
          previewRow.normalizedData?.access_device_codes,
        );
        const effectiveDeviceEmployeeNumber =
          assignedDeviceCodes.length > 0
            ? (previewRow.deviceEmployeeNumber ?? employeeNumber ?? null)
            : null;
        if (effectiveDeviceEmployeeNumber) {
          storedRow.deviceEmployeeNumber = effectiveDeviceEmployeeNumber;
        }

        storedRow.createdEmployeeId = result.employee.id;
        storedRow.createdUserId = result.createdUserId;
        storedRow.status =
          result.action === 'UPDATE'
            ? EmployeeImportRowStatusEnum.UPDATED
            : EmployeeImportRowStatusEnum.IMPORTED;
        storedRow.resultData = {
          ...(storedRow.resultData ?? {}),
          final_status: 'IMPORTED',
          status: result.action === 'UPDATE' ? 'UPDATED' : 'IMPORTED',
          employee_id: result.employee.id,
          user_id: result.linkedUserId,
          user_account: {
            ...(previewRow.userAccount ?? {}),
            action:
              result.userAction ??
              previewRow.userAccount?.action ??
              'REUSE_EXISTING_LINKED_USER',
          },
          device_assignment: this.buildDeviceAssignmentPreview(
            storedRow,
            previewRow,
            effectiveDeviceEmployeeNumber,
          ),
        };
        rowResults.push(this.buildRowResult(storedRow));

        if (result.action === 'UPDATE') {
          updatedEmployees += 1;
        } else {
          createdEmployees += 1;
        }

        if (result.createdUserId) {
          createdUsers += 1;
          employeeRoleAssignmentsCompleted += 1;
        } else if (result.userAction === 'REUSE_EXISTING_LINKED_USER') {
          existingUsersReused += 1;
        }

        const deviceCodes = this.parseMultiValue(
          previewRow.normalizedData?.access_device_codes,
        );
        if (deviceCodes.length > 0) {
          deviceAssignmentsCreated += deviceCodes.length;
          deviceSyncPending += deviceCodes.length;
        }
      } catch (error) {
        storedRow.status = EmployeeImportRowStatusEnum.FAILED;
        storedRow.errors = [
          ...(storedRow.errors ?? []),
          error instanceof Error ? error.message : 'Import failed',
        ];
        storedRow.resultData = {
          ...(storedRow.resultData ?? {}),
          final_status: 'IMPORT_FAILED',
          status: 'FAILED',
        };
        if (
          previewRow.userAccount?.action === 'CREATE_NEW_USER' ||
          previewRow.userAccount?.action === 'CANNOT_CREATE_USER'
        ) {
          failedUserCreations += 1;
        }
        rowResults.push(this.buildRowResult(storedRow));

        if (!processValidRowsOnly) {
          batch.status = EmployeeImportBatchStatusEnum.FAILED;
          batch.failureReason =
            error instanceof Error ? error.message : 'Import failed';
          break;
        }
      }
    }

    await this.applyManagerAssignments(
      companyId,
      batch.rows,
      importedEmployeesByNumber,
    );
    await this.rowRepository.save(batch.rows);

    batch.totalRows = batch.rows.length;
    batch.successfulRows = batch.rows.filter((row) =>
      [
        EmployeeImportRowStatusEnum.IMPORTED,
        EmployeeImportRowStatusEnum.UPDATED,
      ].includes(row.status),
    ).length;
    const skippedRows = batch.rows.filter(
      (row) => row.status === EmployeeImportRowStatusEnum.SKIPPED,
    ).length;
    batch.failedRows = batch.rows.filter(
      (row) => row.status === EmployeeImportRowStatusEnum.FAILED,
    ).length;
    batch.warningRows = batch.rows.filter(
      (row) => (row.warnings?.length ?? 0) > 0,
    ).length;
    batch.createdEmployees = createdEmployees;
    batch.updatedEmployees = updatedEmployees;
    batch.createdUsers = createdUsers;
    batch.deviceAssignmentsCreated = deviceAssignmentsCreated;
    batch.deviceSyncPending = deviceSyncPending;
    batch.metadata = {
      ...(batch.metadata ?? {}),
      skipped_rows: skippedRows,
      process_valid_rows_only: processValidRowsOnly,
      selected_row_ids: Array.from(selectedRowIds),
      existing_skipped: existingSkipped,
      invalid_skipped: invalidSkipped,
      duplicate_in_file_skipped: duplicateInFileSkipped,
      excluded_by_user: excludedByUser,
      existing_users_reused: existingUsersReused,
      employee_role_assignments_completed: employeeRoleAssignmentsCompleted,
      user_conflicts: userConflicts,
      failed_user_creations: failedUserCreations,
    };
    batch.completedAt = new Date();
    const summary = {
      totalUploaded: batch.rows.length,
      selectedForImport: selectedRowIds.size,
      successfullyImported: batch.successfulRows,
      usersCreated: createdUsers,
      existingUsersReused,
      employeeRoleAssignmentsCompleted,
      userConflicts,
      failedUserCreations,
      existingSkipped,
      invalidSkipped,
      duplicateInFileSkipped,
      excludedByUser,
      failedDuringImport: batch.failedRows,
      userProvisioningMessage:
        createdUsers > 0
          ? 'Imported employee accounts were created using the configured temporary password. Imported users must change that password before they can continue using the application.'
          : undefined,
    };
    batch.validationSummary = {
      ...(batch.validationSummary ?? {}),
      preview: this.buildPreviewSummary(previewRows),
      result: summary,
    };

    if (batch.status !== EmployeeImportBatchStatusEnum.FAILED) {
      batch.status =
        batch.failedRows > 0 || skippedRows > 0
          ? EmployeeImportBatchStatusEnum.COMPLETED_WITH_ERRORS
          : EmployeeImportBatchStatusEnum.COMPLETED;
    }

    await this.batchRepository.save(batch);

    let hikvisionSyncSummary:
      | {
          scheduled: boolean;
          scheduledFor: string | null;
          message: string;
        }
      | undefined;
    const successfulImportCandidates = batch.rows
      .filter((row) =>
        [
          EmployeeImportRowStatusEnum.IMPORTED,
          EmployeeImportRowStatusEnum.UPDATED,
        ].includes(row.status),
      )
      .filter((row) => Number.isInteger(row.createdEmployeeId))
      .map((row) => ({
        employeeId: row.createdEmployeeId as number,
        employeeNumber: this.optionalString(row.employeeNumber),
        providedDeviceEmployeeNumber: this.optionalString(
          row.normalizedData?.device_employee_number,
        ),
      }));

    if (successfulImportCandidates.length > 0) {
      try {
        const syncSchedule =
          await this.hikvisionImportSyncService.scheduleImportedEmployeesSync({
            companyId,
            importBatchId: batch.batchId,
            importFileName: batch.originalFileName,
            requestedByUserId: actor.id ?? null,
            requestedByCompanyUserId:
              actor.companyMembershipId ??
              batch.uploadedByCompanyUserId ??
              null,
            employees: successfulImportCandidates,
          });

        hikvisionSyncSummary = syncSchedule.scheduled
          ? {
              scheduled: true,
              scheduledFor: syncSchedule.scheduledFor,
              message:
                'Employees were imported successfully. Hikvision synchronization will run automatically in the background at the configured synchronization time.',
            }
          : {
              scheduled: false,
              scheduledFor: null,
              message:
                'Employees were imported successfully. Hikvision synchronization was not queued because automatic synchronization is disabled or no eligible employees were available.',
            };
      } catch (error) {
        this.logger.error(
          `Failed to queue Hikvision synchronization for import batch ${batch.batchId}: ${(error as Error).message}`,
          error instanceof Error ? error.stack : undefined,
        );
        hikvisionSyncSummary = {
          scheduled: false,
          scheduledFor: null,
          message:
            'Employees were imported successfully. Hikvision synchronization could not be queued automatically.',
        };
      }
    }

    return {
      batchId: batch.batchId,
      status: batch.status,
      totalRows: batch.totalRows,
      successfulRows: batch.successfulRows,
      failedRows: batch.failedRows,
      skippedRows,
      warningRows: batch.warningRows,
      createdEmployees: batch.createdEmployees,
      updatedEmployees: batch.updatedEmployees,
      createdUsers: batch.createdUsers,
      deviceAssignmentsCreated: batch.deviceAssignmentsCreated,
      deviceSyncPending: batch.deviceSyncPending,
      summary: hikvisionSyncSummary
        ? {
            ...summary,
            hikvisionSync: hikvisionSyncSummary,
          }
        : summary,
      rows: rowResults,
    };
  }

  async listHistory(companyId: number, query: EmployeeImportHistoryQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [items, total] = await this.batchRepository.findAndCount({
      where: { companyId },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: items.map((item) => this.mapBatch(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async getPreview(companyId: number, batchId: string) {
    const batch = await this.batchRepository.findOne({
      where: { companyId, batchId },
      relations: { rows: true },
    });

    if (!batch) {
      throw new NotFoundException('Employee import batch not found');
    }

    const rows = [...(batch.rows ?? [])]
      .sort((left, right) => left.rowNumber - right.rowNumber)
      .map((row) => this.buildPreviewResponseRow(row, null));
    const storedPreviewSummary =
      batch.validationSummary?.preview &&
      typeof batch.validationSummary.preview === 'object' &&
      !Array.isArray(batch.validationSummary.preview)
        ? (batch.validationSummary.preview as Record<string, unknown>)
        : null;
    const summary =
      storedPreviewSummary ?? this.buildStoredPreviewSummary(rows);
    const readyForImport =
      typeof summary.readyForImport === 'number'
        ? summary.readyForImport
        : rows.filter((row) => row.status === 'READY_FOR_IMPORT').length;
    const invalidRecords =
      typeof summary.invalidRecords === 'number'
        ? summary.invalidRecords
        : rows.filter((row) => row.status === 'INVALID_RECORD').length;
    const duplicateInFileRecords =
      typeof summary.duplicateInFileRecords === 'number'
        ? summary.duplicateInFileRecords
        : rows.filter((row) => row.status === 'DUPLICATE_IN_FILE').length;

    return {
      batchId: batch.batchId,
      previewToken: batch.previewToken,
      status: batch.status,
      importMode: batch.importMode,
      previewExpiresAt: batch.previewExpiresAt,
      process_valid_rows_only:
        (batch.metadata?.process_valid_rows_only as boolean | undefined) ??
        true,
      totalRows: batch.totalRows,
      validRows: readyForImport,
      invalidRows: invalidRecords,
      duplicateRows: duplicateInFileRecords,
      rowsReadyForImport: readyForImport,
      summary,
      rows,
    };
  }

  async getResult(companyId: number, batchId: string) {
    const batch = await this.batchRepository.findOne({
      where: { companyId, batchId },
      relations: { rows: true },
    });

    if (!batch) {
      throw new NotFoundException('Employee import batch not found');
    }

    const rows = [...(batch.rows ?? [])]
      .sort((left, right) => left.rowNumber - right.rowNumber)
      .map((row) => this.buildRowResult(row));
    const previewSummary =
      batch.validationSummary?.preview &&
      typeof batch.validationSummary.preview === 'object' &&
      !Array.isArray(batch.validationSummary.preview)
        ? (batch.validationSummary.preview as Record<string, unknown>)
        : null;
    const resultSummary =
      batch.validationSummary?.result &&
      typeof batch.validationSummary.result === 'object' &&
      !Array.isArray(batch.validationSummary.result)
        ? (batch.validationSummary.result as Record<string, unknown>)
        : null;

    return {
      ...this.mapBatch(batch),
      previewToken: batch.previewToken,
      previewExpiresAt: batch.previewExpiresAt,
      summary: resultSummary ?? null,
      previewSummary: previewSummary ?? null,
      rows,
    };
  }

  async downloadResult(
    companyId: number,
    batchId: string,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const batch = await this.batchRepository.findOne({
      where: { companyId, batchId },
      relations: { rows: true },
    });

    if (!batch) {
      throw new NotFoundException('Employee import batch not found');
    }

    const workbook = new ExcelJS.Workbook();
    const resultSheet = workbook.addWorksheet('Import Results');
    const columns = [
      'row_number',
      ...IMPORT_COLUMNS,
      'status',
      'preview_status',
      'device_assignment_status',
      'device_assignment_message',
      'device_codes',
      'effective_device_employee_number',
      'import_action',
      'employee_id',
      'user_id',
      'matched_by',
      'existing_employee',
      'errors',
      'warnings',
    ];

    resultSheet.addRow(columns);
    resultSheet.getRow(1).font = { bold: true };
    resultSheet.views = [{ state: 'frozen', ySplit: 1 }];
    resultSheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };

    for (const row of batch.rows.sort(
      (left, right) => left.rowNumber - right.rowNumber,
    )) {
      const deviceAssignment =
        (row.resultData?.device_assignment as
          | DeviceAssignmentPreview
          | undefined) ?? this.buildDeviceAssignmentPreview(row, null);
      const output: Record<string, unknown> = {
        row_number: row.rowNumber,
      };

      for (const column of IMPORT_COLUMNS) {
        output[column] = this.exportSafeCellValue(row.rawData[column] ?? '');
      }

      output.status = row.status;
      output.preview_status = row.resultData?.preview_status ?? '';
      output.device_assignment_status = deviceAssignment.status;
      output.device_assignment_message = deviceAssignment.message;
      output.device_codes = deviceAssignment.deviceCodes.join(', ');
      output.effective_device_employee_number =
        deviceAssignment.effectiveDeviceEmployeeNumber ?? '';
      output.import_action = row.importAction ?? '';
      output.employee_id = row.createdEmployeeId ?? '';
      output.user_id = row.createdUserId ?? '';
      output.matched_by = Array.isArray(row.resultData?.matched_by)
        ? (row.resultData?.matched_by as string[]).join(', ')
        : '';
      output.existing_employee =
        row.resultData?.existing_employee &&
        typeof row.resultData.existing_employee === 'object' &&
        !Array.isArray(row.resultData.existing_employee)
          ? ((row.resultData.existing_employee as { fullName?: string })
              .fullName ?? '')
          : '';
      output.errors = (row.errors ?? []).join(' | ');
      output.warnings = (row.warnings ?? []).join(' | ');
      resultSheet.addRow(columns.map((column) => output[column] ?? ''));
    }

    resultSheet.columns.forEach((column) => {
      column.width = 22;
    });

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return {
      buffer,
      fileName: `${batch.batchId}-result.xlsx`,
    };
  }

  private async persistPreviewBatch(
    companyId: number,
    file: UploadedExcelFile,
    dto: EmployeeImportPreviewRequestDto,
    actor: AuthenticatedUser,
    rows: PreviewRow[],
  ): Promise<EmployeeImportBatch> {
    const batchId = this.generateBatchId();
    const previewToken = crypto.randomBytes(24).toString('hex');
    const checksum = crypto
      .createHash('sha256')
      .update(file.buffer)
      .digest('hex');
    const duplicateRows = rows.filter((row) =>
      row.errors.some((error) => error.toLowerCase().includes('duplicate')),
    ).length;

    const batch = this.batchRepository.create({
      batchId,
      companyId,
      previewToken,
      importMode: dto.import_mode ?? EmployeeImportModeEnum.CREATE_ONLY,
      status: EmployeeImportBatchStatusEnum.PREVIEW_READY,
      originalFileName: file.originalname,
      fileSize: String(file.size),
      fileChecksum: checksum,
      uploadedByCompanyUserId: actor.companyMembershipId ?? null,
      previewExpiresAt: new Date(Date.now() + PREVIEW_TTL_MS),
      totalRows: rows.length,
      validRows: rows.filter((row) => row.previewStatus === 'READY_FOR_IMPORT')
        .length,
      invalidRows: rows.filter(
        (row) => row.previewStatus !== 'READY_FOR_IMPORT',
      ).length,
      duplicateRows,
      validationSummary: this.buildValidationSummary(rows),
      metadata: {
        process_valid_rows_only: dto.process_valid_rows_only ?? true,
      },
    });

    const savedBatch = await this.batchRepository.save(batch);
    const rowEntities = rows.map((row) =>
      this.rowRepository.create({
        batchId: savedBatch.id,
        rowNumber: row.rowNumber,
        status: row.errors.length
          ? EmployeeImportRowStatusEnum.INVALID
          : EmployeeImportRowStatusEnum.READY,
        employeeName: row.employeeName,
        employeeNumber: row.employeeNumber,
        deviceEmployeeNumber: row.deviceEmployeeNumber,
        importAction: row.importAction,
        rawData: row.rawData,
        normalizedData: row.normalizedData,
        warnings: row.warnings,
        errors: row.errors,
        matchedEmployeeId: row.matchedEmployeeId,
        resultData: {
          preview_status: row.previewStatus,
          identifier: row.identifier,
          issues: row.issues,
          matched_by: row.matchedBy,
          existing_employee: row.existingEmployee,
          duplicate_in_file: row.duplicateInFile,
          user_account: row.userAccount,
          device_assignment: this.buildDeviceAssignmentPreview(
            {
              rawData: row.rawData,
              normalizedData: row.normalizedData,
              warnings: row.warnings,
              errors: row.errors,
              resultData: null,
              deviceEmployeeNumber: row.deviceEmployeeNumber,
            },
            row,
          ),
        },
      }),
    );
    await this.rowRepository.save(rowEntities);
    savedBatch.rows = rowEntities;
    return savedBatch;
  }

  private validatePreviewRow(
    companyId: number,
    rowNumber: number,
    values: Record<string, unknown>,
    dto: EmployeeImportPreviewRequestDto,
    references: ReferenceData,
  ): PreviewRow {
    const identifier = this.buildPreviewIdentifier(values);
    const row: PreviewRow = {
      rowNumber,
      identifier,
      rawData: values,
      normalizedData: {},
      errors: [],
      warnings: [],
      issues: [],
      importAction: null,
      matchedEmployeeId: null,
      matchedBy: [],
      existingEmployee: null,
      duplicateInFile: [],
      previewStatus: 'READY_FOR_IMPORT',
      employeeNumber: null,
      deviceEmployeeNumber: null,
      employeeName: identifier,
      userAccount: null,
    };
    const normalizedData: Record<string, unknown> = {};
    const warnings: string[] = [];

    const firstName = this.optionalString(values.first_name);
    const middleName = this.optionalString(values.middle_name);
    const lastName = this.optionalString(values.last_name);
    const email = this.optionalString(values.email)?.toLowerCase() ?? null;
    const gender = this.optionalString(values.gender)?.toLowerCase() ?? null;
    const employeeNumber = this.optionalString(values.employee_number);
    const deviceEmployeeNumber = this.optionalString(
      values.device_employee_number,
    );

    if (!firstName) {
      this.addIssue(
        row,
        'first_name',
        values.first_name ?? null,
        'First name is required',
      );
    }
    if (!lastName) {
      this.addIssue(
        row,
        'last_name',
        values.last_name ?? null,
        'Last name is required',
      );
    }
    if (!email) {
      this.addIssue(row, 'email', values.email ?? null, 'Email is required');
    }
    if (!gender) {
      this.addIssue(row, 'gender', values.gender ?? null, 'Gender is required');
    }
    if (
      gender &&
      !GENDER_VALUES.includes(gender as (typeof GENDER_VALUES)[number])
    ) {
      this.addIssue(
        row,
        'gender',
        values.gender ?? null,
        `Gender must be one of: ${GENDER_VALUES.join(', ')}`,
      );
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.addIssue(
        row,
        'email',
        values.email ?? null,
        'Email address format is invalid',
      );
    }

    const employmentTypeErrors: string[] = [];
    const employmentType = this.resolveEnumValue(
      values.employment_type,
      Object.values(EmploymentTypeEnum),
      'employment_type',
      employmentTypeErrors,
    );
    employmentTypeErrors.forEach((message) =>
      this.addIssue(
        row,
        'employment_type',
        values.employment_type ?? null,
        message,
      ),
    );

    const branch = this.resolveBranchReference(
      values.branch_code,
      references.branches,
    );
    const department = this.resolveDepartmentReference(
      values.department_code,
      references.departments,
    );
    const position = this.resolvePositionReference(
      values.position_code,
      references.positions,
    );
    const branchCode = this.optionalString(values.branch_code);
    const departmentCode = this.optionalString(values.department_code);
    const positionCode = this.optionalString(values.position_code);

    if (branchCode && !branch) {
      this.addIssue(
        row,
        'branch_code',
        branchCode,
        `Branch code "${branchCode}" was not found`,
      );
    }
    if (departmentCode && !department) {
      this.addIssue(
        row,
        'department_code',
        departmentCode,
        `Department code "${departmentCode}" was not found`,
      );
    }
    if (positionCode && !position) {
      this.addIssue(
        row,
        'position_code',
        positionCode,
        `Position code "${positionCode}" was not found`,
      );
    }
    if (branch && department?.branch_id && department.branch_id !== branch.id) {
      this.addIssue(
        row,
        'department_code',
        departmentCode,
        'Department code does not belong to the selected branch code',
      );
    }
    if (
      position &&
      department &&
      !this.isPositionAvailableForDepartment(
        position,
        department.id,
        references.departmentPositionMappings,
      )
    ) {
      this.addIssue(
        row,
        'position_code',
        positionCode,
        'Position code does not belong to the selected department code',
      );
    }
    if (
      position &&
      branch &&
      !this.isPositionAvailableForBranch(
        position,
        branch.id,
        references.departments,
        references.departmentPositionMappings,
      )
    ) {
      this.addIssue(
        row,
        'position_code',
        positionCode,
        'Position code does not belong to the selected branch code',
      );
    }

    const matchedEmployee = this.matchExistingEmployee(
      companyId,
      employeeNumber,
      email,
      references,
      row,
    );
    const importMode = dto.import_mode ?? EmployeeImportModeEnum.CREATE_ONLY;
    let importAction: string | null = null;

    if (matchedEmployee) {
      importAction = 'UPDATE';
      row.matchedBy = matchedEmployee.matchedBy;
      row.existingEmployee = matchedEmployee.employee;
      if (importMode === EmployeeImportModeEnum.CREATE_ONLY) {
        this.addIssue(
          row,
          matchedEmployee.matchedBy[0] ?? 'employee',
          employeeNumber ?? email,
          'Employee already exists and create-only mode is enabled',
          'Exclude this row or switch to an update-capable import mode.',
          'existing',
        );
      }
      if (
        employeeNumber &&
        matchedEmployee.employee.employeeNumber &&
        matchedEmployee.employee.employeeNumber !== employeeNumber
      ) {
        this.addIssue(
          row,
          'employee_number',
          employeeNumber,
          'Employee number cannot be changed for an existing employee record',
          undefined,
          'existing',
        );
      }
      if (
        email &&
        matchedEmployee.employee.email?.trim().toLowerCase() !==
          email.toLowerCase()
      ) {
        this.addIssue(
          row,
          'email',
          email,
          'Email cannot be changed for an existing employee record through this import',
          undefined,
          'existing',
        );
      }
    } else {
      importAction = 'CREATE';
      if (importMode === EmployeeImportModeEnum.UPDATE_EXISTING) {
        this.addIssue(
          row,
          'employee',
          employeeNumber ?? email,
          'Existing employee was not found and update-existing mode is enabled',
          'Provide a matching employee number or email that already exists in this company.',
        );
      }
    }

    const employmentDateErrors: string[] = [];
    const employmentDate = this.parseDate(
      values.employment_date,
      'employment_date',
      employmentDateErrors,
    );
    employmentDateErrors.forEach((message) =>
      this.addIssue(
        row,
        'employment_date',
        values.employment_date ?? null,
        message,
        'Use an ISO date like YYYY-MM-DD.',
      ),
    );
    if (employmentDate && employmentDate > this.getTodayIsoDate()) {
      this.addIssue(
        row,
        'employment_date',
        values.employment_date ?? null,
        'Employment date cannot be in the future',
        'Use today or an earlier employment date before importing this row.',
      );
    }

    const deviceCodes = this.parseMultiValue(values.access_device_codes);
    const resolvedDevices: AttendanceDevice[] = [];
    for (const code of deviceCodes) {
      const device =
        references.devices.find(
          (candidate) =>
            candidate.deviceCode.trim().toLowerCase() === code.toLowerCase(),
        ) ?? null;

      if (!device || device.status === AttendanceDeviceStatusEnum.INACTIVE) {
        this.addIssue(
          row,
          'access_device_codes',
          code,
          `Access device code "${code}" does not exist or is inactive.`,
          'Use only active access-device codes from the template reference sheet.',
        );
        continue;
      }

      resolvedDevices.push(device);
    }
    if (
      resolvedDevices.some(
        (device) => device.status === AttendanceDeviceStatusEnum.OFFLINE,
      )
    ) {
      warnings.push(
        'One or more devices are currently offline. Sync will remain pending.',
      );
    }
    if (deviceEmployeeNumber && deviceEmployeeNumber.length > 100) {
      this.addIssue(
        row,
        'device_employee_number',
        deviceEmployeeNumber,
        'Device employee number cannot exceed 100 characters',
      );
    }
    if (resolvedDevices.length > 0 && !deviceEmployeeNumber) {
      warnings.push(
        'Device employee number is blank. HRMS will use the employee number for access-device assignment during import.',
      );
    }
    if (deviceEmployeeNumber && deviceCodes.length === 0) {
      warnings.push(
        'Device employee number was provided without access device codes. It will be ignored during import.',
      );
    }
    if (deviceEmployeeNumber) {
      for (const device of resolvedDevices) {
        const conflictingAssignment = references.deviceAssignments.find(
          (assignment) =>
            assignment.deviceId === device.id &&
            assignment.employeeNo.trim().toLowerCase() ===
              deviceEmployeeNumber.toLowerCase() &&
            assignment.employeeId !== null &&
            assignment.employeeId !== matchedEmployee?.employee.id,
        );
        if (conflictingAssignment) {
          this.addIssue(
            row,
            'device_employee_number',
            deviceEmployeeNumber,
            `Device employee number is already assigned on device ${device.deviceCode}`,
            undefined,
            'existing',
          );
          break;
        }
      }
    }

    normalizedData.first_name = firstName ?? null;
    normalizedData.middle_name = middleName;
    normalizedData.last_name = lastName ?? null;
    normalizedData.employee_number = employeeNumber;
    normalizedData.email = email;
    normalizedData.gender = gender;
    normalizedData.employment_date = employmentDate;
    normalizedData.branch_code = branch?.code ?? null;
    normalizedData.branch_id = branch?.id ?? null;
    normalizedData.department_code = department?.code ?? null;
    normalizedData.department_id = department?.id ?? null;
    normalizedData.position_code = position?.code ?? null;
    normalizedData.position_id = position?.id ?? null;
    normalizedData.employment_type = employmentType;
    normalizedData.access_device_codes = resolvedDevices.map(
      (device) => device.deviceCode,
    );
    normalizedData.device_ids = resolvedDevices.map((device) => device.id);
    normalizedData.device_employee_number = deviceEmployeeNumber;

    row.normalizedData = normalizedData;
    row.warnings = warnings;
    row.importAction = importAction;
    row.matchedEmployeeId = matchedEmployee?.employee.id ?? null;
    row.employeeNumber = employeeNumber;
    row.deviceEmployeeNumber = deviceEmployeeNumber;
    row.employeeName = [firstName, middleName, lastName]
      .filter((value): value is string => Boolean(value))
      .join(' ')
      .trim();
    row.identifier = row.employeeName || identifier;
    row.userAccount = this.buildUserAccountPreview(
      companyId,
      row,
      references,
      email,
    );
    row.previewStatus = this.determinePreviewStatus(row);

    return row;
  }

  private buildEmployeeCreateDto(
    normalizedData: Record<string, unknown>,
  ): CreateEmployeeDto {
    const contacts: EmployeeContactInputDto[] = [
      {
        contact_type: ContactTypeEnum.WORK,
        email: String(normalizedData.email),
        is_primary: true,
        is_verified: false,
      },
    ];

    return {
      employee_no:
        this.optionalString(normalizedData.employee_number) ?? undefined,
      first_name: String(normalizedData.first_name),
      middle_name: this.optionalString(normalizedData.middle_name) ?? undefined,
      last_name: String(normalizedData.last_name),
      preferred_name:
        this.optionalString(normalizedData.preferred_name) ?? undefined,
      gender: String(normalizedData.gender),
      date_of_birth:
        this.optionalString(normalizedData.date_of_birth) ?? undefined,
      marital_status:
        this.optionalString(normalizedData.marital_status) ?? undefined,
      nationality: this.optionalString(normalizedData.nationality) ?? undefined,
      primary_branch_id: this.toNumber(normalizedData.branch_id) ?? undefined,
      primary_department_id:
        this.toNumber(normalizedData.department_id) ?? undefined,
      primary_position_id:
        this.toNumber(normalizedData.position_id) ?? undefined,
      // Employee imports always create active employees.
      employment_status: EmploymentStatusEnum.ACTIVE,
      employment_type:
        (this.optionalString(
          normalizedData.employment_type,
        ) as EmploymentTypeEnum | null) ?? undefined,
      hire_date:
        this.optionalString(normalizedData.employment_date) ?? undefined,
      notes: this.optionalString(normalizedData.notes) ?? undefined,
      metadata: {
        employee_import_account: {
          provisioned: true,
          requires_password_change: true,
          provisioned_at: new Date().toISOString(),
        },
      },
      onboarding: {
        auto_start: false,
      },
      contacts,
      identifications: this.optionalString(normalizedData.national_id)
        ? [
            {
              identification_type: IdentificationTypeEnum.NATIONAL_ID,
              identification_number: String(normalizedData.national_id),
              issued_country:
                this.optionalString(normalizedData.nationality) ?? undefined,
              is_primary: true,
            },
          ]
        : undefined,
      addresses: this.optionalString(normalizedData.address)
        ? [
            {
              address_line_1: String(normalizedData.address),
              address_type: AddressTypeEnum.HOME,
              is_primary: true,
            },
          ]
        : undefined,
      relatives: this.optionalString(normalizedData.emergency_contact_name)
        ? [
            {
              full_name: String(normalizedData.emergency_contact_name),
              relationship: 'emergency_contact',
              phone:
                this.optionalString(normalizedData.emergency_contact_phone) ??
                undefined,
              is_emergency_contact: true,
              is_primary: true,
            },
          ]
        : undefined,
    };
  }

  private buildEmployeeUpdateDto(
    normalizedData: Record<string, unknown>,
  ): Partial<CreateEmployeeDto> {
    const dto: Partial<CreateEmployeeDto> = {};
    if (this.optionalString(normalizedData.first_name)) {
      dto.first_name = String(normalizedData.first_name);
    }
    if (normalizedData.middle_name !== null) {
      dto.middle_name =
        this.optionalString(normalizedData.middle_name) ?? undefined;
    }
    if (this.optionalString(normalizedData.last_name)) {
      dto.last_name = String(normalizedData.last_name);
    }
    if (normalizedData.preferred_name !== null) {
      dto.preferred_name =
        this.optionalString(normalizedData.preferred_name) ?? undefined;
    }
    if (this.optionalString(normalizedData.gender)) {
      dto.gender = String(normalizedData.gender);
    }
    if (normalizedData.date_of_birth !== null) {
      dto.date_of_birth =
        this.optionalString(normalizedData.date_of_birth) ?? undefined;
    }
    if (normalizedData.branch_id !== null) {
      dto.primary_branch_id =
        this.toNumber(normalizedData.branch_id) ?? undefined;
    }
    if (normalizedData.department_id !== null) {
      dto.primary_department_id =
        this.toNumber(normalizedData.department_id) ?? undefined;
    }
    if (normalizedData.position_id !== null) {
      dto.primary_position_id =
        this.toNumber(normalizedData.position_id) ?? undefined;
    }
    if (normalizedData.employee_status !== null) {
      dto.employment_status = this.optionalString(
        normalizedData.employee_status,
      ) as EmploymentStatusEnum;
    }
    if (normalizedData.employment_type !== null) {
      dto.employment_type = this.optionalString(
        normalizedData.employment_type,
      ) as EmploymentTypeEnum;
    }
    if (normalizedData.employment_date !== null) {
      dto.hire_date =
        this.optionalString(normalizedData.employment_date) ?? undefined;
    }
    if (normalizedData.notes !== null) {
      dto.notes = this.optionalString(normalizedData.notes) ?? undefined;
    }
    return dto;
  }

  private buildUserAccountPreview(
    companyId: number,
    row: PreviewRow,
    references: ReferenceData,
    email: string | null,
  ): UserAccountPreview {
    const employeeRole = this.findDefaultEmployeeRole(
      references.roles,
      companyId,
    );
    const roleLabel = employeeRole?.display_name ?? 'Employee';
    const limitation = null;

    if (row.importAction === 'UPDATE') {
      if (!row.existingEmployee?.userId) {
        this.addIssueOnce(
          row,
          'user_account',
          row.employeeNumber ?? email,
          'Existing employee is missing a linked system user account.',
          'Fix the employee-company user relationship before retrying the import.',
          'existing',
        );

        return {
          action: 'CANNOT_CREATE_USER',
          loginIdentifier: email,
          role: roleLabel,
          status: 'INVALID',
          userStatus: null,
          existingUserId: null,
          message:
            'Existing employee does not have a linked system user account.',
          passwordChangeRequiredOnFirstLogin: false,
          limitation,
        };
      }

      return {
        action: 'REUSE_EXISTING_LINKED_USER',
        loginIdentifier: email ?? row.existingEmployee.email,
        role: roleLabel,
        status: row.errors.length > 0 ? 'INVALID' : 'VALID',
        userStatus: 'active',
        existingUserId: row.existingEmployee.userId,
        message:
          'Existing linked system user will be reused without resetting the password.',
        passwordChangeRequiredOnFirstLogin: false,
        limitation,
      };
    }

    if (!email) {
      return {
        action: 'CANNOT_CREATE_USER',
        loginIdentifier: null,
        role: roleLabel,
        status: 'INVALID',
        userStatus: null,
        existingUserId: null,
        message:
          'A system user cannot be created because email login is required and the email address is missing.',
        passwordChangeRequiredOnFirstLogin: false,
        limitation,
      };
    }

    if (row.issues.some((issue) => issue.field === 'email')) {
      return {
        action: 'CANNOT_CREATE_USER',
        loginIdentifier: email,
        role: roleLabel,
        status: 'INVALID',
        userStatus: null,
        existingUserId: null,
        message:
          'A system user cannot be created until the email address issue is fixed.',
        passwordChangeRequiredOnFirstLogin: false,
        limitation,
      };
    }

    const passwordConfigError =
      this.resolveEmployeeImportDefaultPasswordValidationError();
    if (passwordConfigError) {
      this.addIssueOnce(row, 'user_account', email, passwordConfigError);
      return {
        action: 'CANNOT_CREATE_USER',
        loginIdentifier: email,
        role: roleLabel,
        status: 'INVALID',
        userStatus: null,
        existingUserId: null,
        message: passwordConfigError,
        passwordChangeRequiredOnFirstLogin: false,
        limitation,
      };
    }

    if (!employeeRole) {
      const message =
        'The default Employee role is not configured for this company. Employee user accounts cannot be created.';
      this.addIssueOnce(row, 'user_account', email, message);
      return {
        action: 'CANNOT_CREATE_USER',
        loginIdentifier: email,
        role: roleLabel,
        status: 'INVALID',
        userStatus: null,
        existingUserId: null,
        message,
        passwordChangeRequiredOnFirstLogin: true,
        limitation,
      };
    }

    const existingUser = references.users.find(
      (candidate) =>
        candidate.email?.trim().toLowerCase() === email.toLowerCase(),
    );
    if (existingUser) {
      const existingMembership =
        references.companyUsers.find(
          (companyUser) => companyUser.user_id === existingUser.id,
        ) ?? null;
      const linkedEmployee =
        existingMembership === null
          ? null
          : (references.employees.find(
              (employee) => employee.company_user_id === existingMembership.id,
            ) ?? null);
      const message = linkedEmployee
        ? `A user already exists with email ${email}, but the account is linked to a different employee.`
        : `A user already exists with email ${email}.`;
      this.addIssueOnce(row, 'email', email, message, undefined, 'existing');

      return {
        action: 'USER_CONFLICT',
        loginIdentifier: email,
        role: roleLabel,
        status: 'INVALID',
        userStatus: existingUser.status ?? null,
        existingUserId: existingUser.id,
        message,
        passwordChangeRequiredOnFirstLogin: false,
        limitation,
      };
    }

    return {
      action: 'CREATE_NEW_USER',
      loginIdentifier: email,
      role: roleLabel,
      status: 'VALID',
      userStatus: 'active',
      existingUserId: null,
      message:
        'A new active system user will be created and assigned the Employee role.',
      passwordChangeRequiredOnFirstLogin: false,
      limitation,
    };
  }

  private async ensureMembershipForImportRow(
    companyId: number,
    previewRow: PreviewRow,
    manager?: EntityManager,
  ): Promise<{
    membership: CompanyUser;
    createdUserId: number | null;
    linkedUserId: number;
    userAction: UserAccountAction;
  }> {
    const normalizedData = previewRow.normalizedData ?? {};
    const companyUserRepository =
      manager?.getRepository(CompanyUser) ?? this.companyUserRepository;

    if (previewRow.importAction === 'UPDATE') {
      const companyUserId = previewRow.existingEmployee?.companyUserId;
      const linkedUserId = previewRow.existingEmployee?.userId;
      if (!companyUserId || !linkedUserId) {
        throw new BadRequestException(
          'Existing employee is missing a linked system user account.',
        );
      }

      const membership = await companyUserRepository.findOne({
        where: {
          id: companyUserId,
          company_id: companyId,
          status: 'active',
        },
      });

      if (!membership) {
        throw new NotFoundException('Company membership not found');
      }

      return {
        membership,
        createdUserId: null,
        linkedUserId,
        userAction: 'REUSE_EXISTING_LINKED_USER',
      };
    }

    const email = this.optionalString(normalizedData.email)?.toLowerCase();
    const firstName = this.optionalString(normalizedData.first_name);
    const lastName = this.optionalString(normalizedData.last_name);
    if (!email || !firstName || !lastName) {
      throw new BadRequestException(
        'The import row is missing the required employee identity details for user creation.',
      );
    }

    const defaultPassword = this.getRequiredEmployeeImportDefaultPassword();
    const role = await this.getRequiredDefaultEmployeeRole(
      companyId,
      manager?.getRepository(Role) ?? this.roleRepository,
    );

    const account = await this.usersService.ensureEmployeeImportAccount(
      companyId,
      {
        email,
        firstName,
        lastName,
        defaultPassword,
        roleNames: [role.name],
      },
      manager,
    );

    return {
      membership: account.membership,
      createdUserId: account.user.id,
      linkedUserId: account.user.id,
      userAction: 'CREATE_NEW_USER',
    };
  }

  private async applyAssignmentsAndCredentials(
    companyId: number,
    employee: Employee,
    normalizedData: Record<string, unknown>,
    roleId: number | null,
    importedEmployeesByNumber: Map<string, number>,
    assignmentRepo: Repository<EmployeeDeviceAssignment>,
    credentialRepo: Repository<EmployeeAccessCredential>,
  ): Promise<void> {
    void roleId;
    void importedEmployeesByNumber;

    const shiftId = this.toNumber(normalizedData.shift_id);
    if (shiftId) {
      await this.shiftAssignmentsService.create(companyId, {
        employee_id: employee.id,
        shift_id: shiftId,
        effective_from:
          this.optionalString(normalizedData.shift_effective_from) ??
          this.optionalString(normalizedData.employment_date) ??
          new Date().toISOString().slice(0, 10),
      });
    }

    const timetableId = this.toNumber(normalizedData.timetable_id);
    if (timetableId) {
      await this.employeeTimetablesService.create(companyId, {
        employee_id: employee.id,
        timetable_id: timetableId,
        effective_from:
          this.optionalString(normalizedData.timetable_effective_from) ??
          this.optionalString(normalizedData.employment_date) ??
          new Date().toISOString().slice(0, 10),
      });
    }

    const deviceIds =
      (normalizedData.device_ids as number[] | undefined)?.filter((value) =>
        Number.isInteger(value),
      ) ?? [];
    const deviceEmployeeNumber =
      this.optionalString(normalizedData.device_employee_number) ?? null;
    for (const deviceId of deviceIds) {
      let assignment = await assignmentRepo.findOne({
        where: { companyId, employeeId: employee.id, deviceId },
      });

      if (!assignment) {
        assignment = assignmentRepo.create({
          companyId,
          employeeId: employee.id,
          employeeNo: deviceEmployeeNumber ?? employee.employee_no,
          employeeName: [
            employee.first_name,
            employee.middle_name,
            employee.last_name,
          ]
            .filter((value): value is string => Boolean(value))
            .join(' ')
            .trim(),
          deviceId,
          validEnabled: true,
          localUiRight: false,
          closeDelayEnabled: false,
          maxOpenDoorTime: 0,
          openDoorTime: 0,
          syncStatus: EmployeeDeviceAssignmentSyncStatusEnum.PENDING,
          metadata: {
            source: 'employee_excel_import',
            sync_requested: false,
          },
        });
      } else {
        assignment.employeeNo = deviceEmployeeNumber ?? assignment.employeeNo;
        assignment.syncStatus = EmployeeDeviceAssignmentSyncStatusEnum.PENDING;
      }

      await assignmentRepo.save(assignment);
    }

    const cardNumber = this.optionalString(normalizedData.card_number);
    if (cardNumber) {
      let card = await credentialRepo.findOne({
        where: {
          companyId,
          employeeId: employee.id,
          credentialType: EmployeeAccessCredentialTypeEnum.CARD,
          deviceId: IsNull(),
        },
      });
      if (!card) {
        card = credentialRepo.create({
          companyId,
          employeeId: employee.id,
          employeeNo: deviceEmployeeNumber ?? employee.employee_no,
          deviceId: null,
          credentialType: EmployeeAccessCredentialTypeEnum.CARD,
        });
      }

      card.cardNo = cardNumber;
      card.credentialNo = cardNumber;
      card.credentialStatus = EmployeeAccessCredentialStatusEnum.ACTIVE;
      card.source = EmployeeAccessCredentialSourceEnum.MANUAL;
      card.metadata = {
        ...(card.metadata ?? {}),
        import: {
          source: 'employee_excel_import',
          pending_device_ids: deviceIds,
        },
      };
      await credentialRepo.save(card);
    }

    const accessPassword = this.optionalString(normalizedData.access_password);
    if (accessPassword) {
      let passwordCredential = await credentialRepo.findOne({
        where: {
          companyId,
          employeeId: employee.id,
          credentialType: EmployeeAccessCredentialTypeEnum.PASSWORD,
          deviceId: IsNull(),
        },
      });
      if (!passwordCredential) {
        passwordCredential = credentialRepo.create({
          companyId,
          employeeId: employee.id,
          employeeNo: deviceEmployeeNumber ?? employee.employee_no,
          deviceId: null,
          credentialType: EmployeeAccessCredentialTypeEnum.PASSWORD,
        });
      }

      passwordCredential.pinPassword = accessPassword;
      passwordCredential.passwordSet = true;
      passwordCredential.credentialStatus =
        EmployeeAccessCredentialStatusEnum.ACTIVE;
      passwordCredential.source = EmployeeAccessCredentialSourceEnum.MANUAL;
      passwordCredential.metadata = {
        ...(passwordCredential.metadata ?? {}),
        import: {
          source: 'employee_excel_import',
          pending_device_ids: deviceIds,
        },
      };
      await credentialRepo.save(passwordCredential);
    }
  }

  private async applyManagerAssignments(
    companyId: number,
    rows: EmployeeImportRow[],
    importedEmployeesByNumber: Map<string, number>,
  ): Promise<void> {
    const employeeNumbers = rows
      .map((row) => this.optionalString(row.employeeNumber))
      .filter((value): value is string => Boolean(value));
    const employees = employeeNumbers.length
      ? await this.employeeRepository
          .createQueryBuilder('employee')
          .innerJoin('employee.company_user', 'membership')
          .where('membership.company_id = :companyId', { companyId })
          .andWhere('employee.employee_no IN (:...employeeNumbers)', {
            employeeNumbers,
          })
          .getMany()
      : [];

    const employeeMap = new Map(
      employees.map((employee) => [employee.employee_no, employee.id]),
    );
    for (const [employeeNo, id] of importedEmployeesByNumber.entries()) {
      employeeMap.set(employeeNo, id);
    }

    for (const row of rows) {
      if (
        ![
          EmployeeImportRowStatusEnum.IMPORTED,
          EmployeeImportRowStatusEnum.UPDATED,
        ].includes(row.status)
      ) {
        continue;
      }

      const managerEmployeeNumber = this.optionalString(
        row.normalizedData?.manager_employee_number,
      );
      const employeeId = row.createdEmployeeId ?? row.matchedEmployeeId;
      if (!managerEmployeeNumber || !employeeId) {
        continue;
      }

      const managerId = employeeMap.get(managerEmployeeNumber);
      if (!managerId || managerId === employeeId) {
        continue;
      }

      await this.employeeRepository.update(employeeId, {
        reports_to: managerId,
      });
    }
  }

  private applyBatchDuplicateValidation(rows: PreviewRow[]): void {
    this.addDuplicateErrors(rows, 'employeeNumber', 'employee_number');
    this.addDuplicateErrors(
      rows,
      (row) => this.optionalString(row.normalizedData?.email),
      'email',
    );
    this.addDeviceEmployeeNumberDuplicateErrors(rows);
  }

  private applyManagerValidation(
    companyId: number,
    rows: PreviewRow[],
    references: ReferenceData,
  ): void {
    const rowEmployeeNumbers = new Map<string, PreviewRow>();
    rows.forEach((row) => {
      if (row.employeeNumber) {
        rowEmployeeNumbers.set(row.employeeNumber, row);
      }
    });

    const existingEmployeeNumbers = new Set(
      references.employees.map((employee) => employee.employee_no),
    );

    for (const row of rows) {
      const managerEmployeeNumber = this.optionalString(
        row.normalizedData?.manager_employee_number,
      );
      if (!managerEmployeeNumber) {
        continue;
      }

      if (row.employeeNumber && row.employeeNumber === managerEmployeeNumber) {
        this.addIssue(
          row,
          'manager_employee_number',
          managerEmployeeNumber,
          'Manager employee number cannot match the employee row',
        );
        continue;
      }

      if (
        !existingEmployeeNumbers.has(managerEmployeeNumber) &&
        !rowEmployeeNumbers.has(managerEmployeeNumber)
      ) {
        this.addIssue(
          row,
          'manager_employee_number',
          managerEmployeeNumber,
          'Manager employee number was not found in this company',
        );
      }
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const detectCycle = (employeeNumber: string): boolean => {
      if (visited.has(employeeNumber)) {
        return false;
      }
      if (visiting.has(employeeNumber)) {
        return true;
      }

      const row = rowEmployeeNumbers.get(employeeNumber);
      if (!row) {
        visited.add(employeeNumber);
        return false;
      }

      visiting.add(employeeNumber);
      const managerEmployeeNumber = this.optionalString(
        row.normalizedData?.manager_employee_number,
      );
      const hasCycle =
        managerEmployeeNumber && rowEmployeeNumbers.has(managerEmployeeNumber)
          ? detectCycle(managerEmployeeNumber)
          : false;
      visiting.delete(employeeNumber);
      visited.add(employeeNumber);
      return Boolean(hasCycle);
    };

    for (const employeeNumber of rowEmployeeNumbers.keys()) {
      if (detectCycle(employeeNumber)) {
        const row = rowEmployeeNumbers.get(employeeNumber);
        if (row) {
          this.addIssue(
            row,
            'manager_employee_number',
            row.normalizedData?.manager_employee_number ?? null,
            'Manager employee number creates a circular reporting line',
          );
        }
      }
    }

    void companyId;
  }

  private buildPreviewSummary(rows: PreviewRow[]) {
    const readyRows = rows.filter(
      (row) => row.previewStatus === 'READY_FOR_IMPORT',
    );
    const matchedReadyRows = readyRows.filter(
      (row) => row.importAction === 'UPDATE',
    );
    const newReadyRows = readyRows.filter(
      (row) => row.importAction !== 'UPDATE',
    );
    return {
      totalRows: rows.length,
      validNewRecords: newReadyRows.length,
      readyForImport: readyRows.length,
      existingRecords: rows.filter(
        (row) => row.previewStatus === 'EXISTING_RECORD',
      ).length,
      duplicateInFileRecords: rows.filter(
        (row) => row.previewStatus === 'DUPLICATE_IN_FILE',
      ).length,
      invalidRecords: rows.filter(
        (row) => row.previewStatus === 'INVALID_RECORD',
      ).length,
      updateReadyRecords: matchedReadyRows.length,
      selectedByDefault: readyRows.length,
      usersPlannedToCreate: rows.filter(
        (row) => row.userAccount?.action === 'CREATE_NEW_USER',
      ).length,
      existingUsersReused: rows.filter(
        (row) => row.userAccount?.action === 'REUSE_EXISTING_LINKED_USER',
      ).length,
      userConflicts: rows.filter(
        (row) => row.userAccount?.action === 'USER_CONFLICT',
      ).length,
      userCreationBlocked: rows.filter(
        (row) => row.userAccount?.action === 'CANNOT_CREATE_USER',
      ).length,
    };
  }

  private buildStoredPreviewSummary(rows: Record<string, unknown>[]) {
    const readyRows = rows.filter((row) => row.status === 'READY_FOR_IMPORT');
    const matchedReadyRows = readyRows.filter(
      (row) => row.importAction === 'UPDATE',
    );
    const newReadyRows = readyRows.filter(
      (row) => row.importAction !== 'UPDATE',
    );
    return {
      totalRows: rows.length,
      validNewRecords: newReadyRows.length,
      readyForImport: readyRows.length,
      existingRecords: rows.filter((row) => row.status === 'EXISTING_RECORD')
        .length,
      duplicateInFileRecords: rows.filter(
        (row) => row.status === 'DUPLICATE_IN_FILE',
      ).length,
      invalidRecords: rows.filter((row) => row.status === 'INVALID_RECORD')
        .length,
      updateReadyRecords: matchedReadyRows.length,
      selectedByDefault: readyRows.length,
      usersPlannedToCreate: rows.filter(
        (row) => row.userAction === 'CREATE_NEW_USER',
      ).length,
      existingUsersReused: rows.filter(
        (row) => row.userAction === 'REUSE_EXISTING_LINKED_USER',
      ).length,
      userConflicts: rows.filter((row) => row.userAction === 'USER_CONFLICT')
        .length,
      userCreationBlocked: rows.filter(
        (row) => row.userAction === 'CANNOT_CREATE_USER',
      ).length,
    };
  }

  private buildValidationSummary(rows: PreviewRow[]): Record<string, unknown> {
    const previewSummary = this.buildPreviewSummary(rows);
    return {
      ...previewSummary,
      invalidBranches: rows.filter((row) =>
        row.issues.some((issue) => issue.field === 'branch_code'),
      ).length,
      invalidDepartments: rows.filter((row) =>
        row.issues.some((issue) => issue.field === 'department_code'),
      ).length,
      invalidPositions: rows.filter((row) =>
        row.issues.some((issue) => issue.field === 'position_code'),
      ).length,
      invalidDevices: rows.filter((row) =>
        row.issues.some((issue) => issue.field === 'access_device_codes'),
      ).length,
      invalidDates: rows.filter((row) =>
        row.issues.some((issue) => issue.field.includes('date')),
      ).length,
      invalidEmails: rows.filter((row) =>
        row.issues.some((issue) => issue.field === 'email'),
      ).length,
      invalidGenders: rows.filter((row) =>
        row.issues.some((issue) => issue.field === 'gender'),
      ).length,
      invalidEmploymentTypes: rows.filter((row) =>
        row.issues.some((issue) => issue.field === 'employment_type'),
      ).length,
      userConflicts: rows.filter(
        (row) => row.userAccount?.action === 'USER_CONFLICT',
      ).length,
      userCreationBlocked: rows.filter(
        (row) => row.userAccount?.action === 'CANNOT_CREATE_USER',
      ).length,
      missingDeviceEmployeeNumbers: rows.filter((row) =>
        row.issues.some((issue) => issue.field === 'device_employee_number'),
      ).length,
      duplicateRows: previewSummary.duplicateInFileRecords,
      existingEmployees: rows.filter((row) => row.matchedEmployeeId !== null)
        .length,
    };
  }

  private buildDeviceAssignmentPreview(
    storedRow: DeviceAssignmentSourceRow,
    previewRow: PreviewRow | null,
    effectiveDeviceEmployeeNumber?: string | null,
  ): DeviceAssignmentPreview {
    const issues =
      previewRow?.issues ??
      (storedRow.resultData?.issues as RowIssue[] | undefined) ??
      [];
    const warnings = previewRow?.warnings ?? storedRow.warnings ?? [];
    const normalizedData =
      previewRow?.normalizedData ?? storedRow.normalizedData ?? {};
    const rawData =
      previewRow?.rawData ??
      (storedRow.rawData as Record<string, unknown> | null) ??
      {};
    const deviceCodes = Array.isArray(normalizedData.access_device_codes)
      ? (normalizedData.access_device_codes as unknown[])
          .filter(
            (value): value is string =>
              typeof value === 'string' && value.trim().length > 0,
          )
          .map((value) => value.trim())
      : this.parseMultiValue(rawData.access_device_codes);
    const providedDeviceEmployeeNumber =
      previewRow?.deviceEmployeeNumber ??
      this.optionalString(normalizedData.device_employee_number) ??
      this.optionalString(rawData.device_employee_number) ??
      null;
    const effectiveNumber =
      effectiveDeviceEmployeeNumber ??
      (storedRow.resultData?.effective_device_employee_number as
        | string
        | undefined) ??
      (deviceCodes.length > 0
        ? this.optionalString(storedRow.deviceEmployeeNumber)
        : null) ??
      providedDeviceEmployeeNumber;

    const deviceCodeIssue = issues.find(
      (issue) => issue.field === 'access_device_codes',
    );
    if (deviceCodeIssue) {
      return {
        status: 'INVALID_DEVICE_CODE',
        message: deviceCodeIssue.message,
        deviceCodes,
        providedDeviceEmployeeNumber,
        effectiveDeviceEmployeeNumber: effectiveNumber,
      };
    }

    const deviceEmployeeNumberIssue = issues.find(
      (issue) => issue.field === 'device_employee_number',
    );
    if (deviceEmployeeNumberIssue) {
      const lowered = deviceEmployeeNumberIssue.message.toLowerCase();
      return {
        status:
          lowered.includes('already assigned') || lowered.includes('duplicate')
            ? 'DUPLICATE_DEVICE_EMPLOYEE_NUMBER'
            : 'INVALID_DEVICE_EMPLOYEE_NUMBER',
        message: deviceEmployeeNumberIssue.message,
        deviceCodes,
        providedDeviceEmployeeNumber,
        effectiveDeviceEmployeeNumber: effectiveNumber,
      };
    }

    const deviceWarning = warnings.find(
      (warning) =>
        warning.toLowerCase().includes('device employee number') ||
        warning.toLowerCase().includes('device') ||
        warning.toLowerCase().includes('sync will remain pending'),
    );
    if (deviceWarning) {
      return {
        status: 'DEVICE_ASSIGNMENT_WARNING',
        message: deviceWarning,
        deviceCodes,
        providedDeviceEmployeeNumber,
        effectiveDeviceEmployeeNumber: effectiveNumber,
      };
    }

    if (deviceCodes.length > 0) {
      return {
        status: 'DEVICE_ASSIGNMENT_READY',
        message: providedDeviceEmployeeNumber
          ? 'Device assignment is ready.'
          : 'Device assignment is ready and will use the employee number during import.',
        deviceCodes,
        providedDeviceEmployeeNumber,
        effectiveDeviceEmployeeNumber: effectiveNumber,
      };
    }

    return {
      status: 'NO_DEVICE_ASSIGNMENT',
      message: 'No access-device assignment will be created.',
      deviceCodes: [],
      providedDeviceEmployeeNumber,
      effectiveDeviceEmployeeNumber: null,
    };
  }

  private buildPreviewResponseRow(
    storedRow: PreviewResponseRowSource,
    previewRow: PreviewRow | null,
  ): Record<string, unknown> {
    const previewStatus =
      (storedRow.resultData?.preview_status as
        | PreviewRecordStatus
        | undefined) ??
      previewRow?.previewStatus ??
      'INVALID_RECORD';
    const identifier =
      (storedRow.resultData?.identifier as string | undefined) ??
      previewRow?.identifier ??
      storedRow.employeeName ??
      `Row ${storedRow.rowNumber}`;
    const issues =
      (storedRow.resultData?.issues as RowIssue[] | undefined) ??
      previewRow?.issues ??
      [];
    const existingEmployee =
      (storedRow.resultData?.existing_employee as
        | ExistingEmployeeSummary
        | undefined) ??
      previewRow?.existingEmployee ??
      null;
    const duplicateInFile =
      (storedRow.resultData?.duplicate_in_file as
        | DuplicateInFileIssue[]
        | undefined) ??
      previewRow?.duplicateInFile ??
      [];
    const matchedBy =
      (storedRow.resultData?.matched_by as string[] | undefined) ??
      previewRow?.matchedBy ??
      [];
    const deviceAssignment =
      (storedRow.resultData?.device_assignment as
        | DeviceAssignmentPreview
        | undefined) ??
      this.buildDeviceAssignmentPreview(storedRow, previewRow);
    const userAccount =
      (storedRow.resultData?.user_account as UserAccountPreview | undefined) ??
      previewRow?.userAccount ??
      null;

    return {
      rowId: storedRow.id,
      rowNumber: storedRow.rowNumber,
      identifier,
      employeeName: storedRow.employeeName,
      employeeNumber: storedRow.employeeNumber,
      deviceEmployeeNumber: storedRow.deviceEmployeeNumber,
      importAction: storedRow.importAction,
      status: previewStatus,
      selectable: previewStatus === 'READY_FOR_IMPORT',
      selectedByDefault: previewStatus === 'READY_FOR_IMPORT',
      existingEmployee,
      matchedBy,
      duplicateInFile,
      issues,
      errors: storedRow.errors ?? [],
      warnings: storedRow.warnings ?? [],
      userAction: userAccount?.action ?? null,
      loginIdentifier: userAccount?.loginIdentifier ?? null,
      userStatus: userAccount?.userStatus ?? null,
      defaultRole: userAccount?.role ?? null,
      userMessage: userAccount?.message ?? null,
      existingUserId: userAccount?.existingUserId ?? null,
      passwordChangeRequiredOnFirstLogin:
        userAccount?.passwordChangeRequiredOnFirstLogin ?? false,
      authLimitation: userAccount?.limitation ?? null,
      deviceAssignmentStatus: deviceAssignment.status,
      deviceAssignmentMessage: deviceAssignment.message,
      deviceCodes: deviceAssignment.deviceCodes,
      providedDeviceEmployeeNumber:
        deviceAssignment.providedDeviceEmployeeNumber,
      effectiveDeviceEmployeeNumber:
        deviceAssignment.effectiveDeviceEmployeeNumber,
    };
  }

  private buildRowResult(row: EmployeeImportRow): Record<string, unknown> {
    const previewStatus =
      (row.resultData?.preview_status as PreviewRecordStatus | undefined) ??
      'INVALID_RECORD';
    const finalStatus =
      (row.resultData?.final_status as FinalRecordStatus | undefined) ??
      (row.status === EmployeeImportRowStatusEnum.FAILED
        ? 'IMPORT_FAILED'
        : row.status === EmployeeImportRowStatusEnum.IMPORTED ||
            row.status === EmployeeImportRowStatusEnum.UPDATED
          ? 'IMPORTED'
          : previewStatus);
    const deviceAssignment =
      (row.resultData?.device_assignment as
        | DeviceAssignmentPreview
        | undefined) ?? this.buildDeviceAssignmentPreview(row, null);
    const userAccount =
      (row.resultData?.user_account as UserAccountPreview | undefined) ?? null;
    return {
      rowId: row.id,
      rowNumber: row.rowNumber,
      identifier:
        (row.resultData?.identifier as string | undefined) ??
        row.employeeName ??
        `Row ${row.rowNumber}`,
      employeeName: row.employeeName,
      employeeNumber: row.employeeNumber,
      deviceEmployeeNumber: row.deviceEmployeeNumber,
      importAction: row.importAction,
      employeeId: row.createdEmployeeId ?? row.matchedEmployeeId,
      userId:
        (row.resultData?.user_id as number | undefined) ?? row.createdUserId,
      status: finalStatus,
      previewStatus,
      matchedBy: (row.resultData?.matched_by as string[] | undefined) ?? [],
      existingEmployee:
        (row.resultData?.existing_employee as
          | ExistingEmployeeSummary
          | undefined) ?? null,
      duplicateInFile:
        (row.resultData?.duplicate_in_file as
          | DuplicateInFileIssue[]
          | undefined) ?? [],
      issues: (row.resultData?.issues as RowIssue[] | undefined) ?? [],
      errors: row.errors ?? [],
      warnings: row.warnings ?? [],
      userAction: userAccount?.action ?? null,
      loginIdentifier: userAccount?.loginIdentifier ?? null,
      userStatus: userAccount?.userStatus ?? null,
      defaultRole: userAccount?.role ?? null,
      userMessage: userAccount?.message ?? null,
      existingUserId: userAccount?.existingUserId ?? null,
      passwordChangeRequiredOnFirstLogin:
        userAccount?.passwordChangeRequiredOnFirstLogin ?? false,
      authLimitation: userAccount?.limitation ?? null,
      deviceAssignmentStatus: deviceAssignment.status,
      deviceAssignmentMessage: deviceAssignment.message,
      deviceCodes: deviceAssignment.deviceCodes,
      providedDeviceEmployeeNumber:
        deviceAssignment.providedDeviceEmployeeNumber,
      effectiveDeviceEmployeeNumber:
        deviceAssignment.effectiveDeviceEmployeeNumber,
    };
  }

  private resolveSelectedRowIds(
    storedRows: EmployeeImportRow[],
    previewRowsByStoredId: Map<number, PreviewRow>,
    dto: EmployeeImportConfirmDto,
  ): Set<number> {
    const explicitlySelected = new Set(dto.row_ids ?? []);
    const explicitlyExcluded = new Set(dto.excluded_row_ids ?? []);
    const defaultSelected = storedRows
      .filter(
        (row) =>
          previewRowsByStoredId.get(this.getStoredRowKey(row))
            ?.previewStatus === 'READY_FOR_IMPORT',
      )
      .map((row) => this.getStoredRowKey(row));

    const seed =
      explicitlySelected.size > 0
        ? Array.from(explicitlySelected)
        : defaultSelected;
    return new Set(seed.filter((rowId) => !explicitlyExcluded.has(rowId)));
  }

  private getStoredRowKey(
    row: Pick<EmployeeImportRow, 'id' | 'rowNumber'>,
  ): number {
    return typeof row.id === 'number' && Number.isFinite(row.id)
      ? row.id
      : row.rowNumber * -1;
  }

  private describeNonReadyPreviewRow(row: PreviewRow): string {
    switch (row.previewStatus) {
      case 'EXISTING_RECORD':
        return 'Existing employee record was reviewed and skipped';
      case 'DUPLICATE_IN_FILE':
        return 'Duplicate row in the uploaded file was skipped';
      case 'INVALID_RECORD':
      default:
        return 'Row failed validation and was skipped';
    }
  }

  private mapBatch(item: EmployeeImportBatch) {
    return {
      batchId: item.batchId,
      status: item.status,
      importMode: item.importMode,
      originalFileName: item.originalFileName,
      fileSize: Number(item.fileSize),
      totalRows: item.totalRows,
      validRows: item.validRows,
      invalidRows: item.invalidRows,
      duplicateRows: item.duplicateRows,
      successfulRows: item.successfulRows,
      failedRows: item.failedRows,
      skippedRows:
        Number(item.metadata?.skipped_rows) > 0
          ? Number(item.metadata?.skipped_rows)
          : 0,
      warningRows: item.warningRows,
      createdEmployees: item.createdEmployees,
      updatedEmployees: item.updatedEmployees,
      createdUsers: item.createdUsers,
      deviceAssignmentsCreated: item.deviceAssignmentsCreated,
      deviceSyncPending: item.deviceSyncPending,
      startedAt: item.startedAt,
      completedAt: item.completedAt,
      createdAt: item.createdAt,
    };
  }

  private readHeaders(worksheet: ExcelJS.Worksheet): {
    headers: string[];
    unsupportedHeaders: string[];
  } {
    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    const unsupportedHeaders: string[] = [];

    headerRow.eachCell({ includeEmpty: false }, (cell) => {
      const header = this.normalizeHeader(
        this.optionalString(this.readCellValue(cell.value)) ?? '',
      );
      if (!header) {
        return;
      }
      headers.push(header);
      if (!IMPORT_COLUMNS.includes(header as ImportColumn)) {
        unsupportedHeaders.push(header);
      }
    });

    return { headers, unsupportedHeaders };
  }

  private validateHeaders(
    headers: string[],
    unsupportedHeaders: string[],
  ): string[] {
    const errors: string[] = [];
    const seen = new Set<string>();
    for (const header of headers) {
      if (seen.has(header)) {
        errors.push(`Duplicate header "${header}" is not allowed`);
      }
      seen.add(header);
    }

    const missingHeaders = REQUIRED_COLUMNS.filter(
      (column) => !seen.has(column),
    );
    if (missingHeaders.length > 0) {
      errors.push(`Missing required columns: ${missingHeaders.join(', ')}`);
    }
    if (unsupportedHeaders.length > 0) {
      errors.push(
        `Unsupported columns detected: ${Array.from(new Set(unsupportedHeaders)).join(', ')}`,
      );
    }

    return errors;
  }

  private readEmployeeRows(
    worksheet: ExcelJS.Worksheet,
    headers: string[],
  ): Array<{ rowNumber: number; values: Record<string, unknown> }> {
    const rows: Array<{ rowNumber: number; values: Record<string, unknown> }> =
      [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        return;
      }

      const values: Record<string, unknown> = {};
      let hasValue = false;

      headers.forEach((header, index) => {
        const cellValue = this.readCellValue(row.getCell(index + 1).value);
        if (cellValue !== null && cellValue !== '') {
          hasValue = true;
        }
        values[header] = cellValue;
      });

      if (!hasValue) {
        return;
      }

      rows.push({ rowNumber, values });
    });

    return rows;
  }

  private resolveEmployeeWorksheet(
    workbook: ExcelJS.Workbook,
  ): ExcelJS.Worksheet {
    const worksheet =
      workbook.getWorksheet(EMPLOYEE_SHEET) ?? workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException('Employee worksheet was not found');
    }
    return worksheet;
  }

  private async loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    try {
      const arrayBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ) as ArrayBuffer;
      await workbook.xlsx.load(arrayBuffer);
    } catch {
      throw new BadRequestException(
        'The uploaded Excel file could not be read',
      );
    }
    return workbook;
  }

  private assertSupportedFile(file: UploadedExcelFile): void {
    if (!file) {
      throw new BadRequestException('Excel file is required');
    }
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException(
        'Only .xlsx employee import files are supported',
      );
    }
    if (!SUPPORTED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Unsupported Excel MIME type');
    }
    if (!file.buffer?.length) {
      throw new BadRequestException('Uploaded Excel file is empty');
    }
    if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        'Uploaded Excel file exceeds the size limit',
      );
    }
  }

  private async loadReferenceData(companyId: number): Promise<ReferenceData> {
    const [
      branches,
      departments,
      positions,
      departmentPositionMappings,
      shifts,
      timetables,
      devices,
      roles,
      employees,
      companyUsers,
      users,
      identifications,
      deviceAssignments,
      credentials,
    ] = await Promise.all([
      this.branchRepository.find({
        where: { company_id: companyId },
        order: { name: 'ASC' },
      }),
      this.departmentRepository.find({
        where: { company_id: companyId },
        order: { name: 'ASC' },
      }),
      this.positionRepository.find({
        where: { company_id: companyId },
        order: { name: 'ASC' },
      }),
      this.departmentPositionRepository.find({
        where: { company_id: companyId },
        order: { id: 'ASC' },
      }),
      this.shiftRepository.find({
        where: { companyId },
        order: { name: 'ASC' },
      }),
      this.timetableRepository.find({
        where: { companyId },
        order: { name: 'ASC' },
      }),
      this.attendanceDeviceRepository.find({
        where: { companyId },
        order: { deviceName: 'ASC' },
      }),
      this.roleRepository.find({
        where: [{ company_id: companyId }, { company_id: IsNull() }],
        order: { company_id: 'DESC', name: 'ASC' },
      }),
      this.employeeRepository
        .createQueryBuilder('employee')
        .innerJoin('employee.company_user', 'membership')
        .innerJoin('membership.user', 'user')
        .where('membership.company_id = :companyId', { companyId })
        .select([
          'employee.id AS id',
          'employee.employee_no AS employee_no',
          'employee.first_name AS first_name',
          'employee.middle_name AS middle_name',
          'employee.last_name AS last_name',
          'employee.company_user_id AS company_user_id',
          'user.id AS user_id',
          'employee.reports_to AS reports_to',
          'user.email AS email',
          'user.phone AS phone',
        ])
        .getRawMany<ReferenceData['employees'][number]>(),
      this.companyUserRepository.find({
        where: { company_id: companyId, status: 'active' },
      }),
      this.userRepository.find(),
      this.identificationRepository
        .createQueryBuilder('identification')
        .innerJoin('identification.employee', 'employee')
        .innerJoin('employee.company_user', 'membership')
        .where('membership.company_id = :companyId', { companyId })
        .getMany(),
      this.employeeDeviceAssignmentRepository.find({
        where: { companyId },
      }),
      this.credentialRepository.find({
        where: { companyId },
      }),
    ]);

    return {
      branches,
      departments,
      positions,
      departmentPositionMappings,
      shifts,
      timetables,
      devices,
      roles,
      employees,
      companyUsers,
      users,
      identifications,
      deviceAssignments,
      credentials,
    };
  }

  private async applyActorBranchValidation(
    companyId: number,
    actor: AuthenticatedUser,
    branches: Branch[],
  ): Promise<void> {
    const accessibleBranchIds =
      await this.hrAccessService.getAccessibleBranchIds(actor);
    if (accessibleBranchIds === null) {
      return;
    }

    const inaccessible = branches.filter(
      (branch) => !accessibleBranchIds.includes(branch.id),
    );
    if (inaccessible.length === branches.length && branches.length > 0) {
      throw new BadRequestException(
        'You do not have access to import employees into any available branch in this company',
      );
    }

    void companyId;
  }

  private isPositionAvailableForDepartment(
    position: Position,
    departmentId: number,
    mappings: DepartmentPosition[],
  ): boolean {
    if (position.department_id === departmentId) {
      return true;
    }

    const hasMappings = mappings.some(
      (mapping) => mapping.position_id === position.id,
    );

    if (!hasMappings) {
      return position.department_id === null;
    }

    return mappings.some(
      (mapping) =>
        mapping.position_id === position.id &&
        mapping.department_id === departmentId,
    );
  }

  private isPositionAvailableForBranch(
    position: Position,
    branchId: number,
    departments: Department[],
    mappings: DepartmentPosition[],
  ): boolean {
    if (position.branch_id === branchId) {
      return true;
    }

    const hasMappings = mappings.some(
      (mapping) => mapping.position_id === position.id,
    );

    if (!hasMappings) {
      return position.branch_id === null;
    }

    const branchDepartmentIds = new Set(
      departments
        .filter((department) => department.branch_id === branchId)
        .map((department) => department.id),
    );

    return mappings.some(
      (mapping) =>
        mapping.position_id === position.id &&
        branchDepartmentIds.has(mapping.department_id),
    );
  }

  private addReferenceSheet(
    workbook: ExcelJS.Workbook,
    name: string,
    columns: string[],
    rows: Array<Record<string, unknown>>,
  ) {
    const sheet = workbook.addWorksheet(name);
    sheet.addRow(columns);
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    for (const row of rows) {
      sheet.addRow(columns.map((column) => row[column] ?? ''));
    }
    sheet.columns.forEach((column) => {
      column.width = 22;
    });
  }

  private addListValidationFromSheet(
    workbook: ExcelJS.Workbook,
    employeeSheet: ExcelJS.Worksheet,
    column: ImportColumn,
    sourceSheetName: string,
    sourceColumnNumber: number,
    definedName: string,
    overrides?: Partial<ExcelJS.DataValidation>,
  ): void {
    const sourceSheet = workbook.getWorksheet(sourceSheetName);
    if (!sourceSheet) {
      return;
    }

    const lastRow = Math.max(sourceSheet.rowCount, 2);
    const columnLetter = this.getExcelColumnLetter(sourceColumnNumber);
    workbook.definedNames.add(
      `'${sourceSheetName}'!$${columnLetter}$2:$${columnLetter}$${lastRow}`,
      definedName,
    );

    const employeeColumnIndex = IMPORT_COLUMNS.indexOf(column) + 1;
    if (employeeColumnIndex <= 0) {
      return;
    }

    for (
      let rowNumber = 2;
      rowNumber <= TEMPLATE_VALIDATION_ROW_COUNT;
      rowNumber += 1
    ) {
      employeeSheet
        .getRow(rowNumber)
        .getCell(employeeColumnIndex).dataValidation = {
        type: 'list',
        allowBlank: true,
        showErrorMessage: true,
        formulae: [definedName],
        ...overrides,
      };
    }
  }

  private getExcelColumnLetter(columnNumber: number): string {
    let current = columnNumber;
    let letters = '';
    while (current > 0) {
      const remainder = (current - 1) % 26;
      letters = String.fromCharCode(65 + remainder) + letters;
      current = Math.floor((current - 1) / 26);
    }
    return letters;
  }

  private generateBatchId(): string {
    const date = new Date();
    const yyyymmdd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    return `IMPORT-${yyyymmdd}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  }

  private resolveBranchReference(
    value: unknown,
    branches: Branch[],
  ): Branch | null {
    const text = this.optionalString(value);
    if (!text) return null;
    return (
      branches.find(
        (branch) => branch.code?.trim().toLowerCase() === text.toLowerCase(),
      ) ?? null
    );
  }

  private resolveDepartmentReference(
    value: unknown,
    departments: Department[],
  ): Department | null {
    const text = this.optionalString(value);
    if (!text) return null;
    return (
      departments.find(
        (department) =>
          department.code?.trim().toLowerCase() === text.toLowerCase(),
      ) ?? null
    );
  }

  private resolvePositionReference(
    value: unknown,
    positions: Position[],
  ): Position | null {
    const text = this.optionalString(value);
    if (!text) return null;
    return (
      positions.find(
        (position) =>
          position.code?.trim().toLowerCase() === text.toLowerCase(),
      ) ?? null
    );
  }

  private resolveShiftReference(value: unknown, shifts: Shift[]): Shift | null {
    const text = this.optionalString(value);
    if (!text) return null;
    return (
      shifts.find(
        (shift) =>
          shift.status === ShiftStatusEnum.ACTIVE &&
          (String(shift.id) === text ||
            shift.code.trim().toLowerCase() === text.toLowerCase() ||
            shift.name.trim().toLowerCase() === text.toLowerCase()),
      ) ?? null
    );
  }

  private resolveTimetableReference(
    value: unknown,
    timetables: Timetable[],
  ): Timetable | null {
    const text = this.optionalString(value);
    if (!text) return null;
    return (
      timetables.find(
        (timetable) =>
          timetable.status === TimetableStatusEnum.ACTIVE &&
          (String(timetable.id) === text ||
            timetable.code.trim().toLowerCase() === text.toLowerCase() ||
            timetable.name.trim().toLowerCase() === text.toLowerCase()),
      ) ?? null
    );
  }

  private resolveRoleReference(value: unknown, roles: Role[]): Role | null {
    const text = this.optionalString(value);
    if (!text) return null;
    return (
      roles.find(
        (role) =>
          String(role.id) === text ||
          role.name.trim().toLowerCase() === text.toLowerCase() ||
          role.display_name.trim().toLowerCase() === text.toLowerCase(),
      ) ?? null
    );
  }

  private matchExistingEmployee(
    companyId: number,
    employeeNumber: string | null,
    email: string | null,
    references: ReferenceData,
    row: PreviewRow,
  ): ExistingEmployeeMatch | null {
    const matches = new Map<
      number,
      { employee: ReferenceData['employees'][number]; matchedBy: Set<string> }
    >();

    if (employeeNumber) {
      const employee = references.employees.find(
        (item) =>
          item.employee_no.trim().toLowerCase() ===
          employeeNumber.toLowerCase(),
      );
      if (employee) {
        const existing = matches.get(employee.id) ?? {
          employee,
          matchedBy: new Set<string>(),
        };
        existing.matchedBy.add('employee_number');
        matches.set(employee.id, existing);
      }
    }
    if (email) {
      const employee = references.employees.find(
        (item) => item.email?.trim().toLowerCase() === email.toLowerCase(),
      );
      if (employee) {
        const existing = matches.get(employee.id) ?? {
          employee,
          matchedBy: new Set<string>(),
        };
        existing.matchedBy.add('email');
        matches.set(employee.id, existing);
      }
    }

    if (matches.size > 1) {
      this.addIssue(
        row,
        'employee',
        employeeNumber ?? email,
        'This row matches different existing employees across employee number and email',
        'Ensure employee number and email belong to the same employee before importing.',
        'existing',
      );
      return null;
    }

    void companyId;
    const matched = Array.from(matches.values())[0] ?? null;
    if (!matched) {
      return null;
    }

    const employee = matched.employee;
    return {
      employee: {
        id: employee.id,
        companyUserId: employee.company_user_id,
        userId: employee.user_id,
        employeeNumber: this.optionalString(employee.employee_no),
        fullName: [
          employee.first_name,
          employee.middle_name,
          employee.last_name,
        ]
          .filter((value): value is string =>
            Boolean(this.optionalString(value)),
          )
          .join(' ')
          .trim(),
        email: this.optionalString(employee.email),
        phone: this.optionalString(employee.phone),
      },
      matchedBy: Array.from(matched.matchedBy),
    };
  }

  private resolveEnumValue(
    rawValue: unknown,
    allowedValues: string[],
    field: string,
    errors: string[],
  ): string | null {
    const normalized = this.optionalString(rawValue)?.toLowerCase() ?? null;
    if (!normalized) return null;
    if (!allowedValues.includes(normalized)) {
      errors.push(`${field} must be one of: ${allowedValues.join(', ')}`);
      return null;
    }
    return normalized;
  }

  private parseDate(
    rawValue: unknown,
    field: string,
    errors: string[],
  ): string | null {
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      return null;
    }

    if (rawValue instanceof Date && !Number.isNaN(rawValue.getTime())) {
      return rawValue.toISOString().slice(0, 10);
    }

    const text = this.optionalString(rawValue);
    if (!text) {
      return null;
    }

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
      errors.push(`${field} is not a valid date`);
      return null;
    }

    return parsed.toISOString().slice(0, 10);
  }

  private getTodayIsoDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private parseBoolean(value: unknown, defaultValue: boolean): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    const text = this.optionalString(value);
    if (!text) {
      return defaultValue;
    }

    if (['true', '1', 'yes', 'y'].includes(text.toLowerCase())) {
      return true;
    }
    if (['false', '0', 'no', 'n'].includes(text.toLowerCase())) {
      return false;
    }

    return defaultValue;
  }

  private parseMultiValue(value: unknown): string[] {
    const text = this.optionalString(value);
    if (!text) return [];
    return Array.from(
      new Set(
        text
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
      ),
    );
  }

  private addDuplicateErrors(
    rows: PreviewRow[],
    key: keyof PreviewRow | ((row: PreviewRow) => string | null),
    label: string,
  ): void {
    const groups = new Map<string, PreviewRow[]>();
    rows.forEach((row) => {
      const value =
        typeof key === 'function'
          ? key(row)
          : this.optionalString(row[key] as unknown);
      if (!value) {
        return;
      }
      const items = groups.get(value.toLowerCase()) ?? [];
      items.push(row);
      groups.set(value.toLowerCase(), items);
    });

    groups.forEach((items, value) => {
      if (items.length <= 1) {
        return;
      }
      const duplicateIssue: DuplicateInFileIssue = {
        field: label,
        value,
        rowNumbers: items
          .map((row) => row.rowNumber)
          .sort((left, right) => left - right),
        identifiers: items.map((row) => row.identifier),
      };
      items.forEach((row) => {
        row.duplicateInFile.push(duplicateIssue);
        this.addIssue(
          row,
          label,
          value,
          `Duplicate ${label} "${value}" was found more than once in this import file`,
          'Keep only one row for each duplicate value, or exclude the extra rows.',
          'duplicate',
        );
      });
    });
  }

  private addDeviceEmployeeNumberDuplicateErrors(rows: PreviewRow[]): void {
    const groups = new Map<string, PreviewRow[]>();

    rows.forEach((row) => {
      const employeeNumber = this.optionalString(row.deviceEmployeeNumber);
      const deviceCodes =
        (row.normalizedData?.access_device_codes as string[] | undefined) ?? [];

      if (!employeeNumber || deviceCodes.length === 0) {
        return;
      }

      for (const deviceCode of deviceCodes) {
        const key = `${deviceCode.toLowerCase()}::${employeeNumber.toLowerCase()}`;
        const items = groups.get(key) ?? [];
        items.push(row);
        groups.set(key, items);
      }
    });

    groups.forEach((items, key) => {
      if (items.length <= 1) {
        return;
      }

      const [deviceCode, deviceEmployeeNumber] = key.split('::');
      const duplicateIssue: DuplicateInFileIssue = {
        field: 'device_employee_number',
        value: deviceEmployeeNumber,
        rowNumbers: items
          .map((row) => row.rowNumber)
          .sort((left, right) => left - right),
        identifiers: items.map((row) => row.identifier),
      };
      items.forEach((row) => {
        row.duplicateInFile.push(duplicateIssue);
        this.addIssue(
          row,
          'device_employee_number',
          deviceEmployeeNumber,
          `Duplicate device employee number "${deviceEmployeeNumber}" was found for access device "${deviceCode}" in this import file`,
          'Use a unique device employee number per device, or exclude the extra rows.',
          'duplicate',
        );
      });
    });
  }

  private addIssue(
    row: PreviewRow,
    field: string,
    value: unknown,
    message: string,
    suggestion?: string,
    type: RowIssue['type'] = 'validation',
  ): void {
    row.errors = row.errors ?? [];
    row.issues = row.issues ?? [];
    row.errors.push(message);
    row.issues.push({
      field,
      value,
      message,
      suggestion,
      type,
    });
  }

  private addIssueOnce(
    row: PreviewRow,
    field: string,
    value: unknown,
    message: string,
    suggestion?: string,
    type: RowIssue['type'] = 'validation',
  ): void {
    const exists = (row.issues ?? []).some(
      (issue) => issue.field === field && issue.message === message,
    );
    if (exists) {
      return;
    }

    this.addIssue(row, field, value, message, suggestion, type);
  }

  private buildPreviewIdentifier(values: Record<string, unknown>): string {
    const firstName = this.optionalString(values.first_name);
    const middleName = this.optionalString(values.middle_name);
    const lastName = this.optionalString(values.last_name);
    const fullName = [firstName, middleName, lastName]
      .filter((value): value is string => Boolean(value))
      .join(' ')
      .trim();
    return (
      fullName ||
      this.optionalString(values.employee_number) ||
      this.optionalString(values.email) ||
      'Employee row'
    );
  }

  private determinePreviewStatus(row: PreviewRow): PreviewRecordStatus {
    if ((row.issues ?? []).some((issue) => issue.type === 'duplicate')) {
      return 'DUPLICATE_IN_FILE';
    }
    if (row.matchedEmployeeId !== null && row.importAction !== 'UPDATE') {
      return 'EXISTING_RECORD';
    }
    if (row.errors.length > 0) {
      return 'INVALID_RECORD';
    }
    return 'READY_FOR_IMPORT';
  }

  private findDefaultEmployeeRole(
    roles: Role[],
    companyId: number,
  ): Role | null {
    return (
      roles.find(
        (role) =>
          role.company_id === companyId &&
          role.name.trim().toUpperCase() === 'EMPLOYEE',
      ) ??
      roles.find(
        (role) =>
          role.company_id === null &&
          role.name.trim().toUpperCase() === 'EMPLOYEE',
      ) ??
      null
    );
  }

  private resolveEmployeeImportDefaultPasswordValidationError(): string | null {
    const defaultPassword = this.optionalString(
      this.configService.get<string>('EMPLOYEE_IMPORT_DEFAULT_PASSWORD'),
    );
    if (!defaultPassword) {
      return (
        'Employee import cannot create user accounts because ' +
        'EMPLOYEE_IMPORT_DEFAULT_PASSWORD is missing or does not meet the password policy.'
      );
    }

    const dto = new ResetPasswordDto();
    dto.token = 'employee-import';
    dto.new_password = defaultPassword;
    const validationErrors = validateSync(dto);
    if (validationErrors.length > 0) {
      return (
        'Employee import cannot create user accounts because ' +
        'EMPLOYEE_IMPORT_DEFAULT_PASSWORD is missing or does not meet the password policy.'
      );
    }

    return null;
  }

  private getRequiredEmployeeImportDefaultPassword(): string {
    const validationError =
      this.resolveEmployeeImportDefaultPasswordValidationError();
    if (validationError) {
      throw new BadRequestException(validationError);
    }

    return String(
      this.configService.get<string>('EMPLOYEE_IMPORT_DEFAULT_PASSWORD'),
    ).trim();
  }

  private async getRequiredDefaultEmployeeRole(
    companyId: number,
    repository: Repository<Role>,
  ): Promise<Role> {
    const role =
      (await repository.findOne({
        where: [
          { company_id: companyId, name: 'EMPLOYEE' },
          { company_id: IsNull(), name: 'EMPLOYEE' },
        ],
        order: {
          company_id: 'DESC',
        },
      })) ?? null;

    if (!role) {
      throw new BadRequestException(
        'The default Employee role is not configured for this company. Employee user accounts cannot be created.',
      );
    }

    return role;
  }

  private normalizeHeader(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private readCellValue(
    value: ExcelJS.CellValue | null | undefined,
  ): string | number | Date | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      return value;
    }
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === 'object') {
      if ('result' in value && value.result !== undefined) {
        return this.readCellValue(value.result as ExcelJS.CellValue);
      }
      if ('text' in value && typeof value.text === 'string') {
        return value.text;
      }
      if ('richText' in value && Array.isArray(value.richText)) {
        return value.richText.map((item) => item.text).join('');
      }
      if ('hyperlink' in value && typeof value.text === 'string') {
        return value.text;
      }
    }

    return null;
  }

  private optionalString(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    const normalized =
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
        ? String(value).trim()
        : '';
    return normalized.length > 0 ? normalized : null;
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private exportSafeCellValue(value: unknown): string | number {
    const text = this.optionalString(value);
    if (!text) {
      return '';
    }
    if (/^[=+\-@]/.test(text)) {
      return `'${text}`;
    }
    return text;
  }
}
