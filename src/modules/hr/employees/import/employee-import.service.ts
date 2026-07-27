import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import ExcelJS from 'exceljs';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { hashPassword } from '../../../../common/utils/hash.util';
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

type UploadedExcelFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type PreviewRow = {
  rowNumber: number;
  rawData: Record<string, unknown>;
  normalizedData: Record<string, unknown> | null;
  errors: string[];
  warnings: string[];
  importAction: string | null;
  matchedEmployeeId: number | null;
  employeeNumber: string | null;
  deviceEmployeeNumber: string | null;
  employeeName: string | null;
};

type ReferenceData = {
  branches: Branch[];
  departments: Department[];
  positions: Position[];
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
const PREVIEW_TTL_MS = 30 * 60 * 1000;

const IMPORT_COLUMNS = [
  'first_name',
  'middle_name',
  'last_name',
  'preferred_name',
  'employee_number',
  'email',
  'phone_number',
  'gender',
  'date_of_birth',
  'employment_date',
  'branch_code',
  'department_code',
  'position_code',
  'manager_employee_number',
  'employment_type',
  'employee_status',
  'shift_code',
  'shift_effective_from',
  'timetable_code',
  'timetable_effective_from',
  'access_device_codes',
  'device_employee_number',
  'card_number',
  'access_password',
  'create_system_user',
  'user_role',
  'temporary_password',
  'national_id',
  'marital_status',
  'nationality',
  'address',
  'emergency_contact_name',
  'emergency_contact_phone',
  'notes',
] as const;

type ImportColumn = (typeof IMPORT_COLUMNS)[number];

const REQUIRED_COLUMNS: ImportColumn[] = [
  'first_name',
  'last_name',
  'email',
  'phone_number',
  'gender',
];

@Injectable()
export class EmployeeImportService {
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
  ) {}

  async downloadTemplate(
    companyId: number,
    actor: AuthenticatedUser,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const workbook = new ExcelJS.Workbook();
    const employeeSheet = workbook.addWorksheet(EMPLOYEE_SHEET);
    const instructionsSheet = workbook.addWorksheet(INSTRUCTIONS_SHEET);
    const references = await this.loadReferenceData(companyId);

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
      '',
      '',
      'jane.doe@example.com',
      '+255712345678',
      'female',
      '1994-01-10',
      '2026-07-24',
      references.branches[0]?.code ?? '',
      references.departments[0]?.code ?? '',
      references.positions[0]?.code ?? '',
      '',
      EmploymentTypeEnum.FULL_TIME,
      EmploymentStatusEnum.ONBOARDING,
      references.shifts[0]?.code ?? '',
      '2026-07-24',
      references.timetables[0]?.code ?? '',
      '2026-07-24',
      references.devices[0]?.deviceCode ?? '',
      '',
      '',
      '',
      'true',
      references.roles[0]?.name ?? 'EMPLOYEE',
      'Temp#2026Pass',
      '',
      '',
      '',
      '',
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
      ['Boolean values', 'Use true or false.'],
      ['Gender values', 'Use male or female.'],
      [
        'Employee status values',
        Object.values(EmploymentStatusEnum).join(', '),
      ],
      ['Employment type values', Object.values(EmploymentTypeEnum).join(', ')],
      [
        'Access devices',
        'Separate multiple device codes with commas. Device employee number is required when devices are supplied.',
      ],
      [
        'Lookup strategy',
        'Use branch, department, position, shift, timetable, role, and device codes where possible. Numeric IDs are also accepted.',
      ],
      [
        'Unique values',
        'Employee number is unique per company. Email and phone are globally unique for users. Device employee number must be unique per device. Card number cannot be reused by another employee.',
      ],
      [
        'Optional blanks',
        'Blank optional cells are ignored. In update mode, blank cells do not clear existing values.',
      ],
      [
        'Existing employee matching',
        'Rows are matched using employee number, email, phone, or national ID. CREATE_ONLY rejects matches, UPDATE_EXISTING requires a match.',
      ],
      [
        'System users',
        'The current HRMS schema always links employees to company users. When create_system_user is false, the import creates an inactive placeholder user and membership without roles.',
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
      references.branches.map((branch) => ({
        code: branch.code ?? '',
        name: branch.name,
        status: branch.status,
      })),
    );
    this.addReferenceSheet(
      workbook,
      'Departments',
      ['code', 'name', 'branch_code', 'status'],
      references.departments.map((department) => ({
        code: department.code ?? '',
        name: department.name,
        branch_code:
          references.branches.find(
            (branch) => branch.id === department.branch_id,
          )?.code ?? '',
        status: department.status,
      })),
    );
    this.addReferenceSheet(
      workbook,
      'Positions',
      ['code', 'name', 'department_code', 'branch_code', 'status'],
      references.positions.map((position) => ({
        code: position.code ?? '',
        name: position.name,
        department_code:
          references.departments.find(
            (department) => department.id === position.department_id,
          )?.code ?? '',
        branch_code:
          references.branches.find((branch) => branch.id === position.branch_id)
            ?.code ?? '',
        status: position.status,
      })),
    );
    this.addReferenceSheet(
      workbook,
      'Shifts',
      ['code', 'name', 'status'],
      references.shifts.map((shift) => ({
        code: shift.code,
        name: shift.name,
        status: shift.status,
      })),
    );
    this.addReferenceSheet(
      workbook,
      'Timetables',
      ['code', 'name', 'status'],
      references.timetables.map((timetable) => ({
        code: timetable.code,
        name: timetable.name,
        status: timetable.status,
      })),
    );
    this.addReferenceSheet(
      workbook,
      'Access Devices',
      ['device_code', 'device_name', 'status'],
      references.devices.map((device) => ({
        device_code: device.deviceCode,
        device_name: device.deviceName,
        status: device.status,
      })),
    );
    this.addReferenceSheet(
      workbook,
      'Roles',
      ['name', 'display_name'],
      references.roles.map((role) => ({
        name: role.name,
        display_name: role.display_name,
      })),
    );
    this.addReferenceSheet(
      workbook,
      'Employment Types',
      ['value'],
      Object.values(EmploymentTypeEnum).map((value) => ({ value })),
    );
    this.addReferenceSheet(
      workbook,
      'Employee Statuses',
      ['value'],
      Object.values(EmploymentStatusEnum).map((value) => ({ value })),
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

    if (headerErrors.length > 0) {
      rows.forEach((row) => {
        row.errors.push(...headerErrors);
        row.importAction = null;
        row.normalizedData = null;
      });
    }

    const batch = await this.persistPreviewBatch(
      companyId,
      file,
      dto,
      actor,
      rows,
    );

    return {
      batchId: batch.batchId,
      previewToken: batch.previewToken,
      status: batch.status,
      importMode: batch.importMode,
      totalRows: batch.totalRows,
      validRows: batch.validRows,
      invalidRows: batch.invalidRows,
      duplicateRows: batch.duplicateRows,
      rowsReadyForImport: batch.validRows,
      summary: batch.validationSummary,
      rows: rows.map((row) => ({
        rowNumber: row.rowNumber,
        employeeName: row.employeeName,
        employeeNumber: row.employeeNumber,
        deviceEmployeeNumber: row.deviceEmployeeNumber,
        importAction: row.importAction,
        status: row.errors.length
          ? EmployeeImportRowStatusEnum.INVALID
          : EmployeeImportRowStatusEnum.READY,
        errors: row.errors,
        warnings: row.warnings,
      })),
    };
  }

  async confirmImport(
    companyId: number,
    dto: EmployeeImportConfirmDto,
    actor: AuthenticatedUser,
  ): Promise<EmployeeImportResponseDto & { rows: Record<string, unknown>[] }> {
    const batch = await this.batchRepository.findOne({
      where: {
        companyId,
        previewToken: dto.preview_token.trim(),
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

    const invalidRows = previewRows.filter((row) => row.errors.length > 0);
    const processValidRowsOnly = dto.process_valid_rows_only ?? true;

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
    let deviceAssignmentsCreated = 0;
    let deviceSyncPending = 0;

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

      if (previewRow.errors.length > 0) {
        storedRow.status = EmployeeImportRowStatusEnum.INVALID;
        if (!processValidRowsOnly) {
          storedRow.resultData = {
            status: 'FAILED',
            reason: 'Validation failed',
          };
          rowResults.push(this.buildRowResult(storedRow));
          continue;
        }

        storedRow.status = EmployeeImportRowStatusEnum.SKIPPED;
        storedRow.resultData = {
          status: 'SKIPPED',
          reason: 'Validation failed',
        };
        rowResults.push(this.buildRowResult(storedRow));
        continue;
      }

      try {
        const result = await this.dataSource.transaction(async (manager) => {
          const normalizedData = previewRow.normalizedData ?? {};
          const importAction = previewRow.importAction ?? 'CREATE';
          const createSystemUser =
            (normalizedData.create_system_user as boolean | undefined) ?? true;
          const role = await this.resolveRole(
            normalizedData.user_role,
            companyId,
            manager.getRepository(Role),
          );

          let employeeId: number;
          let createdUserId: number | null = null;

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
            const companyUser = await this.ensureMembershipForImportRow(
              companyId,
              normalizedData,
              actor,
              manager.getRepository(User),
              manager.getRepository(CompanyUser),
              createSystemUser,
              role?.id ?? null,
              manager,
            );

            createdUserId = companyUser.user_id;
            if (!previewRow.matchedEmployeeId) {
              const creation = await this.employeesService.createForCompanyUser(
                companyId,
                companyUser.id,
                this.buildEmployeeCreateDto(normalizedData),
                actor,
                manager,
              );
              employeeId = creation.employeeId;
            } else {
              employeeId = previewRow.matchedEmployeeId;
              await this.employeesService.update(
                companyId,
                employeeId,
                this.buildEmployeeUpdateDto(normalizedData),
                actor,
              );
            }
          }

          const employee = await manager.getRepository(Employee).findOneOrFail({
            where: { id: employeeId },
          });

          await this.applyAssignmentsAndCredentials(
            companyId,
            employee,
            normalizedData,
            role?.id ?? null,
            importedEmployeesByNumber,
            manager.getRepository(EmployeeDeviceAssignment),
            manager.getRepository(EmployeeAccessCredential),
          );

          return {
            employee,
            createdUserId,
            action: importAction,
          };
        });

        const employeeNumber = result.employee.employee_no?.trim();
        if (employeeNumber) {
          importedEmployeesByNumber.set(employeeNumber, result.employee.id);
        }

        storedRow.createdEmployeeId = result.employee.id;
        storedRow.createdUserId = result.createdUserId;
        storedRow.status =
          result.action === 'UPDATE'
            ? EmployeeImportRowStatusEnum.UPDATED
            : EmployeeImportRowStatusEnum.IMPORTED;
        storedRow.resultData = {
          status: result.action === 'UPDATE' ? 'UPDATED' : 'IMPORTED',
          employee_id: result.employee.id,
          user_id: result.createdUserId,
        };
        rowResults.push(this.buildRowResult(storedRow));

        if (result.action === 'UPDATE') {
          updatedEmployees += 1;
        } else {
          createdEmployees += 1;
        }

        if (result.createdUserId) {
          createdUsers += 1;
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
        storedRow.resultData = { status: 'FAILED' };
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
    batch.completedAt = new Date();

    if (batch.status !== EmployeeImportBatchStatusEnum.FAILED) {
      batch.status =
        batch.failedRows > 0
          ? EmployeeImportBatchStatusEnum.COMPLETED_WITH_ERRORS
          : EmployeeImportBatchStatusEnum.COMPLETED;
    }

    await this.batchRepository.save(batch);

    return {
      batchId: batch.batchId,
      status: batch.status,
      totalRows: batch.totalRows,
      successfulRows: batch.successfulRows,
      failedRows: batch.failedRows,
      warningRows: batch.warningRows,
      createdEmployees: batch.createdEmployees,
      updatedEmployees: batch.updatedEmployees,
      createdUsers: batch.createdUsers,
      deviceAssignmentsCreated: batch.deviceAssignmentsCreated,
      deviceSyncPending: batch.deviceSyncPending,
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
      'import_action',
      'employee_id',
      'user_id',
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
      const output: Record<string, unknown> = {
        row_number: row.rowNumber,
      };

      for (const column of IMPORT_COLUMNS) {
        output[column] = this.exportSafeCellValue(row.rawData[column] ?? '');
      }

      output.status = row.status;
      output.import_action = row.importAction ?? '';
      output.employee_id = row.createdEmployeeId ?? '';
      output.user_id = row.createdUserId ?? '';
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
      validRows: rows.filter((row) => row.errors.length === 0).length,
      invalidRows: rows.filter((row) => row.errors.length > 0).length,
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
    const errors: string[] = [];
    const warnings: string[] = [];
    const normalizedData: Record<string, unknown> = {};

    const firstName = this.optionalString(values.first_name);
    const middleName = this.optionalString(values.middle_name);
    const lastName = this.optionalString(values.last_name);
    const preferredName = this.optionalString(values.preferred_name);
    const email = this.optionalString(values.email)?.toLowerCase() ?? null;
    const phoneNumber = this.optionalString(values.phone_number);
    const gender = this.optionalString(values.gender)?.toLowerCase() ?? null;
    const employeeNumber = this.optionalString(values.employee_number);
    const deviceEmployeeNumber = this.optionalString(
      values.device_employee_number,
    );
    const nationalId = this.optionalString(values.national_id);
    const createSystemUser = this.parseBoolean(values.create_system_user, true);
    const userRole = this.optionalString(values.user_role);

    if (!firstName) errors.push('first_name is required');
    if (!lastName) errors.push('last_name is required');
    if (!email) errors.push('email is required');
    if (!phoneNumber) errors.push('phone_number is required');
    if (!gender) errors.push('gender is required');
    if (gender && !['male', 'female'].includes(gender)) {
      errors.push('gender must be male or female');
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push('email is not valid');
    }
    if (
      phoneNumber &&
      !/^\+?[0-9]{8,20}$/.test(phoneNumber.replace(/\s+/g, ''))
    ) {
      errors.push('phone_number is not valid');
    }

    const employmentStatus = this.resolveEnumValue(
      values.employee_status,
      Object.values(EmploymentStatusEnum),
      'employee_status',
      errors,
    );
    const employmentType = this.resolveEnumValue(
      values.employment_type,
      Object.values(EmploymentTypeEnum),
      'employment_type',
      errors,
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
    const shift = this.resolveShiftReference(
      values.shift_code,
      references.shifts,
    );
    const timetable = this.resolveTimetableReference(
      values.timetable_code,
      references.timetables,
    );
    const role = this.resolveRoleReference(values.user_role, references.roles);
    const managerEmployeeNumber = this.optionalString(
      values.manager_employee_number,
    );

    if (this.optionalString(values.branch_code) && !branch) {
      errors.push('branch_code does not match any active branch');
    }
    if (this.optionalString(values.department_code) && !department) {
      errors.push('department_code does not match any active department');
    }
    if (this.optionalString(values.position_code) && !position) {
      errors.push('position_code does not match any active position');
    }
    if (this.optionalString(values.shift_code) && !shift) {
      errors.push('shift_code does not match any active shift');
    }
    if (this.optionalString(values.timetable_code) && !timetable) {
      errors.push('timetable_code does not match any active timetable');
    }
    if (userRole && !role) {
      errors.push('user_role does not match any company role');
    }
    if (branch && department?.branch_id && department.branch_id !== branch.id) {
      errors.push(
        'department_code does not belong to the selected branch_code',
      );
    }
    if (
      position &&
      department &&
      position.department_id &&
      position.department_id !== department.id
    ) {
      errors.push(
        'position_code does not belong to the selected department_code',
      );
    }
    if (
      position &&
      branch &&
      position.branch_id &&
      position.branch_id !== branch.id
    ) {
      errors.push('position_code does not belong to the selected branch_code');
    }

    const matchedEmployee = this.matchExistingEmployee(
      companyId,
      employeeNumber,
      email,
      phoneNumber,
      nationalId,
      references,
      errors,
    );
    const importMode = dto.import_mode ?? EmployeeImportModeEnum.CREATE_ONLY;
    let importAction: string | null = null;

    if (matchedEmployee) {
      importAction = 'UPDATE';
      if (importMode === EmployeeImportModeEnum.CREATE_ONLY) {
        errors.push('employee already exists and CREATE_ONLY mode is enabled');
      }
      if (
        employeeNumber &&
        matchedEmployee.employee_no &&
        matchedEmployee.employee_no !== employeeNumber
      ) {
        errors.push(
          'employee_number cannot be changed for an existing employee record',
        );
      }
    } else {
      importAction = 'CREATE';
      if (importMode === EmployeeImportModeEnum.UPDATE_EXISTING) {
        errors.push(
          'existing employee was not found and UPDATE_EXISTING mode is enabled',
        );
      }
    }

    const dateOfBirth = this.parseDate(
      values.date_of_birth,
      'date_of_birth',
      errors,
    );
    const employmentDate = this.parseDate(
      values.employment_date,
      'employment_date',
      errors,
    );
    const shiftEffectiveFrom = this.parseDate(
      values.shift_effective_from,
      'shift_effective_from',
      errors,
    );
    const timetableEffectiveFrom = this.parseDate(
      values.timetable_effective_from,
      'timetable_effective_from',
      errors,
    );

    const deviceCodes = this.parseMultiValue(values.access_device_codes);
    const resolvedDevices = deviceCodes
      .map((code) =>
        references.devices.find(
          (device) =>
            device.deviceCode.toLowerCase() === code.toLowerCase() ||
            String(device.id) === code,
        ),
      )
      .filter((device): device is AttendanceDevice => Boolean(device));
    if (
      deviceCodes.length > 0 &&
      resolvedDevices.length !== deviceCodes.length
    ) {
      errors.push('One or more access_device_codes are invalid');
    }
    if (
      resolvedDevices.some(
        (device) => device.status === AttendanceDeviceStatusEnum.INACTIVE,
      )
    ) {
      errors.push('Inactive access devices cannot be assigned during import');
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
    if (resolvedDevices.length > 0 && !deviceEmployeeNumber) {
      errors.push(
        'device_employee_number is required when access_device_codes are provided',
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
            assignment.employeeId !== matchedEmployee?.id,
        );
        if (conflictingAssignment) {
          errors.push(
            `device_employee_number is already assigned on device ${device.deviceCode}`,
          );
          break;
        }
      }
    }

    const cardNumber = this.optionalString(values.card_number);
    if (cardNumber) {
      const conflictingCard = references.credentials.find(
        (credential) =>
          credential.cardNo?.trim().toLowerCase() ===
            cardNumber.toLowerCase() &&
          credential.employeeId !== null &&
          credential.employeeId !== matchedEmployee?.id &&
          credential.credentialStatus !==
            EmployeeAccessCredentialStatusEnum.DELETED,
      );
      if (conflictingCard) {
        errors.push('card_number is already assigned to another employee');
      }
    }

    if (!createSystemUser && userRole) {
      warnings.push(
        'user_role is ignored when create_system_user is false because the placeholder membership is created without roles.',
      );
    }

    normalizedData.first_name = firstName ?? null;
    normalizedData.middle_name = middleName;
    normalizedData.last_name = lastName ?? null;
    normalizedData.preferred_name = preferredName;
    normalizedData.employee_number = employeeNumber;
    normalizedData.email = email;
    normalizedData.phone_number = phoneNumber;
    normalizedData.gender = gender;
    normalizedData.date_of_birth = dateOfBirth;
    normalizedData.employment_date = employmentDate;
    normalizedData.branch_code = branch?.code ?? null;
    normalizedData.branch_id = branch?.id ?? null;
    normalizedData.department_code = department?.code ?? null;
    normalizedData.department_id = department?.id ?? null;
    normalizedData.position_code = position?.code ?? null;
    normalizedData.position_id = position?.id ?? null;
    normalizedData.manager_employee_number = managerEmployeeNumber;
    normalizedData.employment_type = employmentType;
    normalizedData.employee_status = employmentStatus;
    normalizedData.shift_code = shift?.code ?? null;
    normalizedData.shift_id = shift?.id ?? null;
    normalizedData.shift_effective_from = shiftEffectiveFrom;
    normalizedData.timetable_code = timetable?.code ?? null;
    normalizedData.timetable_id = timetable?.id ?? null;
    normalizedData.timetable_effective_from = timetableEffectiveFrom;
    normalizedData.access_device_codes = resolvedDevices.map(
      (device) => device.deviceCode,
    );
    normalizedData.device_ids = resolvedDevices.map((device) => device.id);
    normalizedData.device_employee_number = deviceEmployeeNumber;
    normalizedData.card_number = cardNumber;
    normalizedData.access_password = this.optionalString(
      values.access_password,
    );
    normalizedData.create_system_user = createSystemUser;
    normalizedData.user_role = createSystemUser
      ? (role?.name ?? userRole)
      : null;
    normalizedData.temporary_password = this.optionalString(
      values.temporary_password,
    );
    normalizedData.national_id = nationalId;
    normalizedData.marital_status = this.optionalString(values.marital_status);
    normalizedData.nationality = this.optionalString(values.nationality);
    normalizedData.address = this.optionalString(values.address);
    normalizedData.emergency_contact_name = this.optionalString(
      values.emergency_contact_name,
    );
    normalizedData.emergency_contact_phone = this.optionalString(
      values.emergency_contact_phone,
    );
    normalizedData.notes = this.optionalString(values.notes);

    return {
      rowNumber,
      rawData: values,
      normalizedData,
      errors,
      warnings,
      importAction,
      matchedEmployeeId: matchedEmployee?.id ?? null,
      employeeNumber,
      deviceEmployeeNumber,
      employeeName: [firstName, middleName, lastName]
        .filter((value): value is string => Boolean(value))
        .join(' ')
        .trim(),
    };
  }

  private buildEmployeeCreateDto(
    normalizedData: Record<string, unknown>,
  ): CreateEmployeeDto {
    const contacts: EmployeeContactInputDto[] = [
      {
        contact_type: ContactTypeEnum.WORK,
        email: String(normalizedData.email),
        phone_number: String(normalizedData.phone_number),
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
      employment_status:
        (this.optionalString(
          normalizedData.employee_status,
        ) as EmploymentStatusEnum | null) ?? undefined,
      employment_type:
        (this.optionalString(
          normalizedData.employment_type,
        ) as EmploymentTypeEnum | null) ?? undefined,
      hire_date:
        this.optionalString(normalizedData.employment_date) ?? undefined,
      notes: this.optionalString(normalizedData.notes) ?? undefined,
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

  private async ensureMembershipForImportRow(
    companyId: number,
    normalizedData: Record<string, unknown>,
    actor: AuthenticatedUser,
    userRepo: Repository<User>,
    companyUserRepo: Repository<CompanyUser>,
    createSystemUser: boolean,
    roleId: number | null,
    manager?: EntityManager,
  ): Promise<CompanyUser> {
    const email = String(normalizedData.email).trim().toLowerCase();
    const phone = String(normalizedData.phone_number).trim();
    const firstName = String(normalizedData.first_name).trim();
    const lastName = String(normalizedData.last_name).trim();

    const existingByEmail = await userRepo.findOne({ where: { email } });
    const existingByPhone = await userRepo.findOne({ where: { phone } });

    if (
      existingByEmail &&
      existingByPhone &&
      existingByEmail.id !== existingByPhone.id
    ) {
      throw new ConflictException(
        'Email and phone belong to different existing users',
      );
    }

    let user = existingByEmail ?? existingByPhone ?? null;
    if (!user) {
      const temporaryPassword =
        this.optionalString(normalizedData.temporary_password) ??
        this.generateTemporaryPassword();
      user = await userRepo.save(
        userRepo.create({
          user_no: await this.usersService.generateUserNo(),
          first_name: firstName,
          last_name: lastName,
          phone,
          email,
          password: await hashPassword(temporaryPassword),
          status: createSystemUser ? 'active' : 'inactive',
          user_type: 'COMPANY_USER',
          is_email_verified: createSystemUser,
        }),
      );
    } else if (!createSystemUser && user.status !== 'inactive') {
      user.status = 'inactive';
      await userRepo.save(user);
    }

    let membership = await companyUserRepo.findOne({
      where: { company_id: companyId, user_id: user.id, status: 'active' },
    });
    if (!membership) {
      if (createSystemUser) {
        await this.companiesService.addUserToCompany(
          user.id,
          companyId,
          roleId ? { roleIds: [roleId] } : undefined,
          manager,
        );
      } else {
        membership = await companyUserRepo.save(
          companyUserRepo.create({
            company_id: companyId,
            user_id: user.id,
            status: 'active',
            is_default: false,
          }),
        );
      }
    }

    membership =
      membership ??
      (await companyUserRepo.findOne({
        where: { company_id: companyId, user_id: user.id, status: 'active' },
      }));

    if (!membership) {
      throw new NotFoundException('Company membership could not be created');
    }

    return membership;
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
    this.addDuplicateErrors(
      rows,
      (row) => this.optionalString(row.normalizedData?.phone_number),
      'phone_number',
    );
    this.addDuplicateErrors(
      rows,
      'deviceEmployeeNumber',
      'device_employee_number',
    );
    this.addDuplicateErrors(
      rows,
      (row) => this.optionalString(row.normalizedData?.card_number),
      'card_number',
    );
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
        row.errors.push(
          'manager_employee_number cannot match the employee row',
        );
        continue;
      }

      if (
        !existingEmployeeNumbers.has(managerEmployeeNumber) &&
        !rowEmployeeNumbers.has(managerEmployeeNumber)
      ) {
        row.errors.push(
          'manager_employee_number was not found in this company',
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
          row.errors.push(
            'manager_employee_number creates a circular reporting line',
          );
        }
      }
    }

    void companyId;
  }

  private buildValidationSummary(rows: PreviewRow[]): Record<string, unknown> {
    return {
      missingBranches: rows.filter((row) =>
        row.errors.some((error) => error.includes('branch_code')),
      ).length,
      missingDepartments: rows.filter((row) =>
        row.errors.some((error) => error.includes('department_code')),
      ).length,
      missingPositions: rows.filter((row) =>
        row.errors.some((error) => error.includes('position_code')),
      ).length,
      missingDevices: rows.filter((row) =>
        row.errors.some((error) => error.includes('access_device_codes')),
      ).length,
      invalidDates: rows.filter((row) =>
        row.errors.some((error) => error.toLowerCase().includes('date')),
      ).length,
      invalidEmails: rows.filter((row) =>
        row.errors.some((error) => error.includes('email')),
      ).length,
      invalidPhones: rows.filter((row) =>
        row.errors.some((error) => error.includes('phone_number')),
      ).length,
      duplicateRows: rows.filter((row) =>
        row.errors.some((error) => error.toLowerCase().includes('duplicate')),
      ).length,
      existingEmployees: rows.filter((row) => row.matchedEmployeeId !== null)
        .length,
    };
  }

  private buildRowResult(row: EmployeeImportRow): Record<string, unknown> {
    return {
      rowNumber: row.rowNumber,
      employeeName: row.employeeName,
      employeeNumber: row.employeeNumber,
      deviceEmployeeNumber: row.deviceEmployeeNumber,
      importAction: row.importAction,
      employeeId: row.createdEmployeeId ?? row.matchedEmployeeId,
      userId: row.createdUserId,
      status: row.status,
      errors: row.errors ?? [],
      warnings: row.warnings ?? [],
    };
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
        (branch) =>
          String(branch.id) === text ||
          branch.code?.trim().toLowerCase() === text.toLowerCase() ||
          branch.name.trim().toLowerCase() === text.toLowerCase(),
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
          String(department.id) === text ||
          department.code?.trim().toLowerCase() === text.toLowerCase() ||
          department.name.trim().toLowerCase() === text.toLowerCase(),
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
          String(position.id) === text ||
          position.code?.trim().toLowerCase() === text.toLowerCase() ||
          position.name.trim().toLowerCase() === text.toLowerCase(),
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

  private async resolveRole(
    value: unknown,
    companyId: number,
    repository: Repository<Role>,
  ): Promise<Role | null> {
    const text = this.optionalString(value);
    if (!text) {
      return null;
    }
    return (
      (await repository.findOne({
        where: [
          { id: Number.isFinite(Number(text)) ? Number(text) : -1 },
          { name: text, company_id: companyId },
          { name: text, company_id: IsNull() },
        ],
      })) ?? null
    );
  }

  private matchExistingEmployee(
    companyId: number,
    employeeNumber: string | null,
    email: string | null,
    phoneNumber: string | null,
    nationalId: string | null,
    references: ReferenceData,
    errors: string[],
  ) {
    const matches = new Map<number, ReferenceData['employees'][number]>();

    if (employeeNumber) {
      const employee = references.employees.find(
        (item) =>
          item.employee_no.trim().toLowerCase() ===
          employeeNumber.toLowerCase(),
      );
      if (employee) matches.set(employee.id, employee);
    }
    if (email) {
      const employee = references.employees.find(
        (item) => item.email?.trim().toLowerCase() === email.toLowerCase(),
      );
      if (employee) matches.set(employee.id, employee);
    }
    if (phoneNumber) {
      const employee = references.employees.find(
        (item) => item.phone?.trim() === phoneNumber,
      );
      if (employee) matches.set(employee.id, employee);
    }
    if (nationalId) {
      const identification = references.identifications.find(
        (item) =>
          item.identification_type === IdentificationTypeEnum.NATIONAL_ID &&
          item.identification_number.trim().toLowerCase() ===
            nationalId.toLowerCase(),
      );
      if (identification) {
        const employee = references.employees.find(
          (item) => item.id === identification.employee_id,
        );
        if (employee) matches.set(employee.id, employee);
      }
    }

    if (matches.size > 1) {
      errors.push(
        'Row matches different existing employees across employee_number, email, phone_number, or national_id',
      );
      return null;
    }

    void companyId;
    return Array.from(matches.values())[0] ?? null;
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
      items.forEach((row) => {
        row.errors.push(
          `Duplicate ${label} "${value}" found in the import file`,
        );
      });
    });
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

  private generateTemporaryPassword(): string {
    return `Temp#${crypto.randomBytes(6).toString('base64url')}1`;
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
