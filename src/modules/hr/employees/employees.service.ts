import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  HttpException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { SortDirection } from '../../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { resolveAuditContext } from '../../../common/request-context/request-context';
import type { AuditRequestContext } from '../../../common/interfaces/audit-request-context.interface';
import { hashPassword } from '../../../common/utils/hash.util';
import { hasPermission } from '../../../common/utils/permission.util';
import { normalizeTanzaniaOrUgandaPhone } from '../../../common/utils/tanzania-phone.util';
import { CompaniesService } from '../../companies/companies.service';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { FilesService } from '../../files/files.service';
import { Base64FileDto } from '../../files/dtos/base64-file.dto';
import {
  HR_PRIVATE_DOCUMENT_MAX_BYTES,
  HR_PRIVATE_DOCUMENT_MIME_TYPES,
} from '../../files/file-policy';
import { SecurityEventOutcome } from '../../security/enums/security-event-outcome.enum';
import { SecurityEventType } from '../../security/enums/security-event-type.enum';
import { SecurityEventsService } from '../../security/security-events.service';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/users.service';
import { Branch } from '../branches/entities/branch.entity';
import { CostCenter } from '../cost-centers/entities/cost-center.entity';
import { DefaultAvatarsService } from '../default-avatars/default-avatars.service';
import { Department } from '../departments/entities/department.entity';
import { EmployeeAttendanceReadinessService } from '../launch-readiness/employee-attendance-readiness.service';
import { LeaveBalanceService } from '../leave/services/leave-balance.service';
import {
  OnboardingCreationResult,
  OnboardingService,
} from '../onboarding/onboarding.service';
import { Position } from '../positions/entities/position.entity';
import { EmployeeGrade } from '../grades/entities/employee-grade.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { PositionAvailabilityService } from '../shared/position-availability.service';
import { buildPaginationMeta, formatDateOnly } from '../shared/hr.utils';
import { AddEmployeeDocumentDto } from './dtos/add-employee-document.dto';
import { ChangeEmployeeStatusDto } from './dtos/change-employee-status.dto';
import { CreateEmployeeAddressDto } from './dtos/create-employee-address.dto';
import { CreateEmployeeAcademicQualificationDto } from './dtos/create-employee-academic-qualification.dto';
import { CreateEmployeeBankAccountDto } from './dtos/create-employee-bank-account.dto';
import { CreateEmployeeContactDto } from './dtos/create-employee-contact.dto';
import { CreateEmployeeDto } from './dtos/create-employee.dto';
import { CreateEmployeeExperienceDto } from './dtos/create-employee-experience.dto';
import { CreateEmployeeIdentificationDto } from './dtos/create-employee-identification.dto';
import { CreateEmployeeProfessionalQualificationDto } from './dtos/create-employee-professional-qualification.dto';
import { CreateEmployeeRelativeDto } from './dtos/create-employee-relative.dto';
import { EmployeeAddressInputDto } from './dtos/employee-address-input.dto';
import { EmployeeAcademicQualificationInputDto } from './dtos/employee-academic-qualification-input.dto';
import { EmployeeBankAccountInputDto } from './dtos/employee-bank-account-input.dto';
import { EmployeeContactInputDto } from './dtos/employee-contact-input.dto';
import { EmployeeDepartmentInputDto } from './dtos/employee-department-input.dto';
import {
  EmployeeListResponseDto,
  EmployeeListRow,
} from './dtos/employee-list-response.dto';
import { EmployeeExperienceInputDto } from './dtos/employee-experience-input.dto';
import { EmployeeIdentificationInputDto } from './dtos/employee-identification-input.dto';
import { EmployeeProfessionalQualificationInputDto } from './dtos/employee-professional-qualification-input.dto';
import { EmployeeQueryDto } from './dtos/employee-query.dto';
import { EmployeeRelativeInputDto } from './dtos/employee-relative-input.dto';
import { UpdateEmployeeAddressDto } from './dtos/update-employee-address.dto';
import { UpdateEmployeeAcademicQualificationDto } from './dtos/update-employee-academic-qualification.dto';
import { UpdateEmployeeBankAccountDto } from './dtos/update-employee-bank-account.dto';
import { UpdateEmployeeContactDto } from './dtos/update-employee-contact.dto';
import { UpdateEmployeeDto } from './dtos/update-employee.dto';
import { UpdateEmployeeExperienceDto } from './dtos/update-employee-experience.dto';
import { UpdateEmployeeIdentificationDto } from './dtos/update-employee-identification.dto';
import { UpdateEmployeeProfessionalQualificationDto } from './dtos/update-employee-professional-qualification.dto';
import { UpdateEmployeeRelativeDto } from './dtos/update-employee-relative.dto';
import { ContactTypeEnum } from './enums/contact-type.enum';
import { EmployeeConfirmationStatusEnum } from './enums/employee-confirmation-status.enum';
import { EmployeePositionAssignmentTypeEnum } from './enums/employee-position-assignment-type.enum';
import { EmployeePositionStatusEnum } from './enums/employee-position-status.enum';
import { EmploymentStatusEnum } from './enums/employment-status.enum';
import { EmploymentTypeEnum } from './enums/employment-type.enum';
import { IdentificationTypeEnum } from './enums/identification-type.enum';
import { EmployeeAddress } from './entities/employee-address.entity';
import { EmployeeBankAccount } from './entities/employee-bank-account.entity';
import { EmployeePayrollProfile } from '../payroll/entities/employee-payroll-profile.entity';
import { EmployeeContact } from './entities/employee-contact.entity';
import { EmployeeDepartment } from './entities/employee-department.entity';
import { EmployeeDocument } from './entities/employee-document.entity';
import { EmployeePosition } from './entities/employee-position.entity';
import { EmployeeExperience } from './entities/employee-experience.entity';
import { EmployeeIdentification } from './entities/employee-identification.entity';
import { EmployeeAcademicQualification } from './entities/employee-academic-qualification.entity';
import { EmployeeProfessionalQualification } from './entities/employee-professional-qualification.entity';
import { EmployeeRelative } from './entities/employee-relative.entity';
import { Employee } from './entities/employee.entity';
import { ProfileImageSourceEnum } from './enums/profile-image-source.enum';
import { EmployeeAssignmentService } from './employee-assignment.service';
import { EmployeeLifecycleService } from './employee-lifecycle.service';
import { EmployeeNumberService } from './employee-number.service';

type EmployeeMutationDto = CreateEmployeeDto | UpdateEmployeeDto;
const EMPTY_AUDIT_CONTEXT: AuditRequestContext = {
  ipAddress: null,
  userAgent: null,
  requestId: null,
};
const ARCHIVED_CONTACT_NOTE_PREFIX = '[ARCHIVED_CONTACT]';
const ARCHIVED_ADDRESS_PREFIX = '[ARCHIVED_ADDRESS]';
const ARCHIVED_RELATIVE_PREFIX = '[ARCHIVED_RELATIVE]';
const ARCHIVED_IDENTIFICATION_PREFIX = '[ARCHIVED_IDENTIFICATION]';
const ARCHIVED_DOCUMENT_NOTE_PREFIX = '[ARCHIVED_DOCUMENT]';
const ARCHIVED_BANK_ACCOUNT_STATUS = 'ARCHIVED';
const ARCHIVED_ACADEMIC_QUALIFICATION_PREFIX = '[ARCHIVED_ACADEMIC]';
const ARCHIVED_PROFESSIONAL_QUALIFICATION_PREFIX = '[ARCHIVED_PROFESSIONAL]';
const ARCHIVED_EXPERIENCE_PREFIX = '[ARCHIVED_EXPERIENCE]';
const HISTORICAL_EMPLOYMENT_STATUSES = new Set<EmploymentStatusEnum>([
  EmploymentStatusEnum.INACTIVE,
  EmploymentStatusEnum.RESIGNED,
  EmploymentStatusEnum.TERMINATED,
  EmploymentStatusEnum.RETIRED,
  EmploymentStatusEnum.EXITED,
]);

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeDepartment)
    private readonly employeeDepartmentRepository: Repository<EmployeeDepartment>,
    @InjectRepository(EmployeeDocument)
    private readonly employeeDocumentRepository: Repository<EmployeeDocument>,
    @InjectRepository(EmployeeContact)
    private readonly employeeContactRepository: Repository<EmployeeContact>,
    @InjectRepository(EmployeeAddress)
    private readonly employeeAddressRepository: Repository<EmployeeAddress>,
    @InjectRepository(EmployeeRelative)
    private readonly employeeRelativeRepository: Repository<EmployeeRelative>,
    @InjectRepository(EmployeeIdentification)
    private readonly employeeIdentificationRepository: Repository<EmployeeIdentification>,
    @InjectRepository(EmployeeBankAccount)
    private readonly employeeBankAccountRepository: Repository<EmployeeBankAccount>,
    @InjectRepository(EmployeeAcademicQualification)
    private readonly employeeAcademicQualificationRepository: Repository<EmployeeAcademicQualification>,
    @InjectRepository(EmployeeProfessionalQualification)
    private readonly employeeProfessionalQualificationRepository: Repository<EmployeeProfessionalQualification>,
    @InjectRepository(EmployeeExperience)
    private readonly employeeExperienceRepository: Repository<EmployeeExperience>,
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
    @InjectRepository(EmployeePosition)
    private readonly employeePositionRepository: Repository<EmployeePosition>,
    private readonly companiesService: CompaniesService,
    private readonly usersService: UsersService,
    private readonly hrAccessService: HrAccessService,
    private readonly positionAvailabilityService: PositionAvailabilityService,
    private readonly onboardingService: OnboardingService,
    private readonly leaveBalanceService: LeaveBalanceService,
    private readonly attendanceReadinessService: EmployeeAttendanceReadinessService,
    private readonly filesService: FilesService,
    private readonly defaultAvatarsService: DefaultAvatarsService,
    private readonly securityEventsService: SecurityEventsService,
    private readonly employeeNumberService: EmployeeNumberService,
    private readonly employeeAssignmentService: EmployeeAssignmentService,
    private readonly employeeLifecycleService: EmployeeLifecycleService,
  ) {}

  private getEmployeeRepository(manager?: EntityManager): Repository<Employee> {
    return manager?.getRepository(Employee) ?? this.employeeRepository;
  }

  private getEmployeeDepartmentRepository(
    manager?: EntityManager,
  ): Repository<EmployeeDepartment> {
    return (
      manager?.getRepository(EmployeeDepartment) ??
      this.employeeDepartmentRepository
    );
  }

  private getEmployeeDocumentRepository(
    manager?: EntityManager,
  ): Repository<EmployeeDocument> {
    return (
      manager?.getRepository(EmployeeDocument) ??
      this.employeeDocumentRepository
    );
  }

  private getEmployeeContactRepository(
    manager?: EntityManager,
  ): Repository<EmployeeContact> {
    return (
      manager?.getRepository(EmployeeContact) ?? this.employeeContactRepository
    );
  }

  private getEmployeeAddressRepository(
    manager?: EntityManager,
  ): Repository<EmployeeAddress> {
    return (
      manager?.getRepository(EmployeeAddress) ?? this.employeeAddressRepository
    );
  }

  private getEmployeeRelativeRepository(
    manager?: EntityManager,
  ): Repository<EmployeeRelative> {
    return (
      manager?.getRepository(EmployeeRelative) ??
      this.employeeRelativeRepository
    );
  }

  private getEmployeeIdentificationRepository(
    manager?: EntityManager,
  ): Repository<EmployeeIdentification> {
    return (
      manager?.getRepository(EmployeeIdentification) ??
      this.employeeIdentificationRepository
    );
  }

  private getEmployeeBankAccountRepository(
    manager?: EntityManager,
  ): Repository<EmployeeBankAccount> {
    return (
      manager?.getRepository(EmployeeBankAccount) ??
      this.employeeBankAccountRepository
    );
  }

  private getEmployeeAcademicQualificationRepository(
    manager?: EntityManager,
  ): Repository<EmployeeAcademicQualification> {
    return (
      manager?.getRepository(EmployeeAcademicQualification) ??
      this.employeeAcademicQualificationRepository
    );
  }

  private getEmployeeProfessionalQualificationRepository(
    manager?: EntityManager,
  ): Repository<EmployeeProfessionalQualification> {
    return (
      manager?.getRepository(EmployeeProfessionalQualification) ??
      this.employeeProfessionalQualificationRepository
    );
  }

  private getEmployeeExperienceRepository(
    manager?: EntityManager,
  ): Repository<EmployeeExperience> {
    return (
      manager?.getRepository(EmployeeExperience) ??
      this.employeeExperienceRepository
    );
  }

  private getCompanyUserRepository(
    manager?: EntityManager,
  ): Repository<CompanyUser> {
    return manager?.getRepository(CompanyUser) ?? this.companyUserRepository;
  }

  private getUserRepository(manager?: EntityManager): Repository<User> {
    return manager?.getRepository(User) ?? this.userRepository;
  }

  private getBranchRepository(manager?: EntityManager): Repository<Branch> {
    return manager?.getRepository(Branch) ?? this.branchRepository;
  }

  private getDepartmentRepository(
    manager?: EntityManager,
  ): Repository<Department> {
    return manager?.getRepository(Department) ?? this.departmentRepository;
  }

  private getPositionRepository(manager?: EntityManager): Repository<Position> {
    return manager?.getRepository(Position) ?? this.positionRepository;
  }

  private getEmployeePositionRepository(
    manager?: EntityManager,
  ): Repository<EmployeePosition> {
    return (
      manager?.getRepository(EmployeePosition) ??
      this.employeePositionRepository
    );
  }

  private getEmployeeGradeRepository(
    manager?: EntityManager,
  ): Repository<EmployeeGrade> {
    return (
      manager?.getRepository(EmployeeGrade) ??
      this.dataSource.getRepository(EmployeeGrade)
    );
  }

  private getCostCenterRepository(
    manager?: EntityManager,
  ): Repository<CostCenter> {
    return (
      manager?.getRepository(CostCenter) ??
      this.dataSource.getRepository(CostCenter)
    );
  }

  private normalizeOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private normalizeDocumentMetadata(
    value: unknown,
  ): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private assertDateOrder(
    startDate: string,
    endDate: string,
    message: string,
  ): void {
    if (new Date(startDate) > new Date(endDate)) {
      throw new BadRequestException(message);
    }
  }

  private buildEmployeeDisplayName(
    employee: Pick<Employee, 'first_name' | 'middle_name' | 'last_name'>,
  ): string {
    return [employee.first_name, employee.middle_name, employee.last_name]
      .map((value) => this.normalizeOptionalString(value))
      .filter((value): value is string => Boolean(value))
      .join(' ');
  }

  private sortPrimaryFirst<T extends { id: number; is_primary: boolean }>(
    items?: T[] | null,
  ): T[] {
    return [...(items ?? [])].sort((left, right) => {
      if (left.is_primary !== right.is_primary) {
        return Number(right.is_primary) - Number(left.is_primary);
      }

      return left.id - right.id;
    });
  }

  private ensureSinglePrimary(
    items: Array<{ is_primary?: boolean }>,
    message: string,
  ): void {
    const primaryCount = items.filter((item) => item.is_primary).length;
    if (primaryCount > 1) {
      throw new BadRequestException(message);
    }
  }

  private ensureSinglePrimaryPerGroup<T>(
    items: T[],
    getGroupKey: (item: T) => string,
    message: string,
  ): void {
    const primaryCounts = new Map<string, number>();

    items.forEach((item) => {
      if (!(item as { is_primary?: boolean }).is_primary) {
        return;
      }

      const key = getGroupKey(item);
      primaryCounts.set(key, (primaryCounts.get(key) ?? 0) + 1);
    });

    for (const count of primaryCounts.values()) {
      if (count > 1) {
        throw new BadRequestException(message);
      }
    }
  }

  private mapBranch(branch?: Branch | null) {
    if (!branch) {
      return null;
    }

    return {
      id: branch.id,
      name: branch.name,
      code: branch.code,
      city: branch.city,
      country: branch.country,
      status: branch.status,
    };
  }

  private mapDepartment(department?: Department | null) {
    if (!department) {
      return null;
    }

    return {
      id: department.id,
      name: department.name,
      code: department.code,
      description: department.description,
      status: department.status,
      branch: this.mapBranch(department.branch),
      parent: department.parent
        ? {
            id: department.parent.id,
            name: department.parent.name,
            branch_id: department.parent.branch_id,
            status: department.parent.status,
          }
        : null,
    };
  }

  private mapPosition(position?: Position | null) {
    if (!position) {
      return null;
    }

    return {
      id: position.id,
      name: position.name,
      code: position.code,
      branch_id: position.branch_id,
      department_id: position.department_id,
      reports_to_position_id: position.reports_to_position_id,
      level: position.level,
      is_manager: position.is_manager,
      headcount: position.headcount,
      is_active: position.is_active,
      description: position.description,
      status: position.status,
    };
  }

  private mapGrade(grade?: EmployeeGrade | null) {
    if (!grade) {
      return null;
    }

    return {
      id: grade.id,
      code: grade.code,
      name: grade.name,
      level: grade.level,
      description: grade.description,
      status: grade.status,
    };
  }

  private mapCostCenter(costCenter?: CostCenter | null) {
    if (!costCenter) {
      return null;
    }

    return {
      id: costCenter.id,
      code: costCenter.code,
      name: costCenter.name,
      branch_id: costCenter.branch_id,
      department_id: costCenter.department_id,
      description: costCenter.description,
      status: costCenter.status,
    };
  }

  private mapMembership(membership?: CompanyUser | null) {
    if (!membership) {
      return null;
    }

    return {
      id: membership.id,
      company_id: membership.company_id,
      user_id: membership.user_id,
      status: membership.status,
      is_default: membership.is_default,
      user: membership.user
        ? {
            id: membership.user.id,
            user_no: membership.user.user_no,
            first_name: membership.user.first_name,
            last_name: membership.user.last_name,
            phone: membership.user.phone,
            email: membership.user.email,
            profile_photo_url: membership.employee?.profile_photo_url ?? null,
            status: membership.user.status,
            user_type: membership.user.user_type,
          }
        : null,
    };
  }

  private mapMembershipWithoutAccessDetails(membership?: CompanyUser | null) {
    if (!membership) {
      return null;
    }

    return {
      id: membership.id,
      company_id: membership.company_id,
      user_id: membership.user_id,
      status: membership.status,
      is_default: membership.is_default,
      user: membership.user
        ? {
            id: membership.user.id,
            user_no: membership.user.user_no,
            first_name: membership.user.first_name,
            last_name: membership.user.last_name,
            phone: membership.user.phone,
            email: membership.user.email,
            profile_photo_url: membership.employee?.profile_photo_url ?? null,
            status: membership.user.status,
            user_type: membership.user.user_type,
          }
        : null,
    };
  }

  private mapDocument(document: EmployeeDocument) {
    return {
      id: document.id,
      employee_id: document.employee_id,
      type: document.type,
      title: document.title,
      classification: document.classification,
      file_url: `/api/employees/${document.employee_id}/documents/${document.id}/download`,
      original_file_name: document.original_file_name,
      mime_type: document.mime_type,
      file_size: document.file_size,
      notes: document.notes,
      metadata: document.metadata,
      retention_until: document.retention_until,
      download_count: document.download_count,
      last_downloaded_at: document.last_downloaded_at,
      last_downloaded_by_company_user_id:
        document.last_downloaded_by_company_user_id,
      uploaded_at: document.uploaded_at,
      uploaded_by_company_user_id: document.uploaded_by_company_user_id,
      uploaded_by: document.uploaded_by?.user
        ? {
            id: document.uploaded_by.user.id,
            user_no: document.uploaded_by.user.user_no,
            first_name: document.uploaded_by.user.first_name,
            last_name: document.uploaded_by.user.last_name,
            email: document.uploaded_by.user.email,
            profile_photo_url:
              document.uploaded_by.employee?.profile_photo_url ?? null,
          }
        : null,
    };
  }

  private mapContact(contact: EmployeeContact) {
    return {
      id: contact.id,
      employee_id: contact.employee_id,
      contact_type: contact.contact_type,
      phone_number: contact.phone_number,
      email: contact.email,
      is_primary: contact.is_primary,
      is_verified: contact.is_verified,
      notes: contact.notes,
      created_at: contact.created_at,
      updated_at: contact.updated_at,
    };
  }

  private mapAddress(address: EmployeeAddress) {
    return {
      id: address.id,
      employee_id: address.employee_id,
      address_line_1: address.address_line_1,
      address_line_2: address.address_line_2,
      city: address.city,
      state: address.state,
      country: address.country,
      postal_code: address.postal_code,
      address_type: address.address_type,
      is_primary: address.is_primary,
      created_at: address.created_at,
      updated_at: address.updated_at,
    };
  }

  private mapRelative(relative: EmployeeRelative) {
    return {
      id: relative.id,
      employee_id: relative.employee_id,
      full_name: relative.full_name,
      relationship: relative.relationship,
      phone: relative.phone,
      email: relative.email,
      address: relative.address,
      occupation: relative.occupation,
      is_emergency_contact: relative.is_emergency_contact,
      is_primary: relative.is_primary,
      created_at: relative.created_at,
      updated_at: relative.updated_at,
    };
  }

  private mapIdentification(identification: EmployeeIdentification) {
    return {
      id: identification.id,
      employee_id: identification.employee_id,
      identification_type: identification.identification_type,
      identification_number: identification.identification_number,
      issued_country: identification.issued_country,
      issue_date: identification.issue_date,
      issuing_authority: identification.issuing_authority,
      document_url: identification.document_url,
      expiry_date: identification.expiry_date,
      is_primary: identification.is_primary,
      is_verified: identification.is_verified,
      verified_at: identification.verified_at,
      verified_by_company_user_id: identification.verified_by_company_user_id,
      created_at: identification.created_at,
      updated_at: identification.updated_at,
    };
  }

  private mapBankAccount(bankAccount: EmployeeBankAccount) {
    return {
      id: bankAccount.id,
      employee_id: bankAccount.employee_id,
      bank_name: bankAccount.bank_name,
      account_name: bankAccount.account_name,
      account_number: bankAccount.account_number,
      branch_name: bankAccount.branch_name,
      bank_code: bankAccount.bank_code,
      bank_branch_code: bankAccount.bank_branch_code,
      account_currency: bankAccount.account_currency,
      account_type: bankAccount.account_type,
      swift_code: bankAccount.swift_code,
      mobile_money_provider: bankAccount.mobile_money_provider,
      verification_status: bankAccount.verification_status,
      verified_at: bankAccount.verified_at,
      verified_by_company_user_id: bankAccount.verified_by_company_user_id,
      effective_from: bankAccount.effective_from,
      effective_to: bankAccount.effective_to,
      is_primary: bankAccount.is_primary,
      created_at: bankAccount.created_at,
      updated_at: bankAccount.updated_at,
    };
  }

  private isArchivedDocument(document: EmployeeDocument): boolean {
    return document.notes?.startsWith(ARCHIVED_DOCUMENT_NOTE_PREFIX) ?? false;
  }

  private isArchivedContact(contact: EmployeeContact): boolean {
    return contact.notes?.startsWith(ARCHIVED_CONTACT_NOTE_PREFIX) ?? false;
  }

  private isArchivedAddress(address: EmployeeAddress): boolean {
    return address.address_line_1?.startsWith(ARCHIVED_ADDRESS_PREFIX) ?? false;
  }

  private isArchivedRelative(relative: EmployeeRelative): boolean {
    return relative.relationship?.startsWith(ARCHIVED_RELATIVE_PREFIX) ?? false;
  }

  private isArchivedIdentification(
    identification: EmployeeIdentification,
  ): boolean {
    return (
      identification.identification_number?.startsWith(
        ARCHIVED_IDENTIFICATION_PREFIX,
      ) ?? false
    );
  }

  private isArchivedBankAccount(bankAccount: EmployeeBankAccount): boolean {
    return bankAccount.verification_status === ARCHIVED_BANK_ACCOUNT_STATUS;
  }

  private isArchivedAcademicQualification(
    qualification: EmployeeAcademicQualification,
  ): boolean {
    return (
      qualification.field_of_study?.startsWith(
        ARCHIVED_ACADEMIC_QUALIFICATION_PREFIX,
      ) ?? false
    );
  }

  private isArchivedProfessionalQualification(
    qualification: EmployeeProfessionalQualification,
  ): boolean {
    return (
      qualification.programme_name?.startsWith(
        ARCHIVED_PROFESSIONAL_QUALIFICATION_PREFIX,
      ) ?? false
    );
  }

  private isArchivedExperienceDetail(
    experienceDetail: EmployeeExperience,
  ): boolean {
    return (
      experienceDetail.job_title?.startsWith(ARCHIVED_EXPERIENCE_PREFIX) ??
      false
    );
  }

  private buildArchiveAuditNote(
    prefix: string,
    actor: AuthenticatedUser,
    existingNotes?: string | null,
  ): string {
    const archiveNote = `${prefix} archived_at=${new Date().toISOString()} archived_by_company_user_id=${actor.companyMembershipId ?? 'unknown'}`;

    if (!existingNotes) {
      return archiveNote;
    }

    return `${archiveNote}\n${existingNotes}`;
  }

  private buildArchivedFieldValue(
    prefix: string,
    value: string | null | undefined,
    maxLength: number,
  ): string {
    const normalizedValue = this.normalizeOptionalString(value);
    const archivedValue = normalizedValue
      ? `${prefix} ${normalizedValue}`
      : prefix;

    return archivedValue.slice(0, maxLength);
  }

  private buildArchivedUniqueFieldValue(
    prefix: string,
    uniqueToken: string,
    value: string | null | undefined,
    maxLength: number,
  ): string {
    const normalizedValue = this.normalizeOptionalString(value);
    const archivedValue = normalizedValue
      ? `${prefix} ${uniqueToken} ${normalizedValue}`
      : `${prefix} ${uniqueToken}`;

    return archivedValue.slice(0, maxLength);
  }

  private mapAcademicQualification(
    academicQualification: EmployeeAcademicQualification,
  ) {
    return {
      id: academicQualification.id,
      employee_id: academicQualification.employee_id,
      country_of_residence: academicQualification.country_of_residence,
      education_level: academicQualification.education_level,
      institution_name: academicQualification.institution_name,
      degree_or_certificate: academicQualification.degree_or_certificate,
      field_of_study: academicQualification.field_of_study,
      start_date: academicQualification.start_date,
      end_date: academicQualification.end_date,
      academic_certificate_document_url:
        academicQualification.academic_certificate_document_url,
      uploaded_by_company_user_id:
        academicQualification.uploaded_by_company_user_id,
      uploaded_at: academicQualification.uploaded_at,
      updated_at: academicQualification.updated_at,
      uploaded_by: academicQualification.uploaded_by?.user
        ? {
            id: academicQualification.uploaded_by.user.id,
            user_no: academicQualification.uploaded_by.user.user_no,
            first_name: academicQualification.uploaded_by.user.first_name,
            last_name: academicQualification.uploaded_by.user.last_name,
            email: academicQualification.uploaded_by.user.email,
            profile_photo_url:
              academicQualification.uploaded_by.employee?.profile_photo_url ??
              null,
          }
        : null,
    };
  }

  private mapProfessionalQualification(
    professionalQualification: EmployeeProfessionalQualification,
  ) {
    return {
      id: professionalQualification.id,
      employee_id: professionalQualification.employee_id,
      country_of_residence: professionalQualification.country_of_residence,
      institution_name: professionalQualification.institution_name,
      programme_name: professionalQualification.programme_name,
      issuing_organization: professionalQualification.issuing_organization,
      issue_date: professionalQualification.issue_date,
      expiry_date: professionalQualification.expiry_date,
      professional_certificate_document_url:
        professionalQualification.professional_certificate_document_url,
      uploaded_by_company_user_id:
        professionalQualification.uploaded_by_company_user_id,
      uploaded_at: professionalQualification.uploaded_at,
      updated_at: professionalQualification.updated_at,
      uploaded_by: professionalQualification.uploaded_by?.user
        ? {
            id: professionalQualification.uploaded_by.user.id,
            user_no: professionalQualification.uploaded_by.user.user_no,
            first_name: professionalQualification.uploaded_by.user.first_name,
            last_name: professionalQualification.uploaded_by.user.last_name,
            email: professionalQualification.uploaded_by.user.email,
            profile_photo_url:
              professionalQualification.uploaded_by.employee
                ?.profile_photo_url ?? null,
          }
        : null,
    };
  }

  private mapExperienceDetail(experienceDetail: EmployeeExperience) {
    return {
      id: experienceDetail.id,
      employee_id: experienceDetail.employee_id,
      company_name: experienceDetail.company_name,
      job_title: experienceDetail.job_title,
      responsibilities_description:
        experienceDetail.responsibilities_description,
      start_date: experienceDetail.start_date,
      end_date: experienceDetail.end_date,
      currently_working: experienceDetail.currently_working,
      created_at: experienceDetail.created_at,
      updated_at: experienceDetail.updated_at,
    };
  }

  private async mapEmployee(employee: Employee, includeDocuments = false) {
    const companyId = employee.company_id;
    const resolvedAvatar =
      await this.defaultAvatarsService.resolveEmployeeProfileAvatar(
        companyId ?? 0,
        employee,
      );
    const managerAvatar = employee.manager
      ? await this.defaultAvatarsService.resolveEmployeeProfileAvatar(
          companyId,
          employee.manager,
        )
      : null;

    return {
      id: employee.id,
      company_user_id: employee.company_user_id,
      employee_no: employee.employee_no,
      first_name: employee.first_name,
      middle_name: employee.middle_name,
      last_name: employee.last_name,
      preferred_name: employee.preferred_name,
      gender: employee.gender,
      date_of_birth: employee.date_of_birth,
      marital_status: employee.marital_status,
      nationality: employee.nationality,
      profile_photo_url: resolvedAvatar.profile_photo_url,
      uploaded_profile_photo_url: resolvedAvatar.uploaded_profile_photo_url,
      profile_photo_source: resolvedAvatar.profile_photo_source,
      profile_picture:
        this.defaultAvatarsService.buildProfilePicturePayload(resolvedAvatar),
      profile_image_source:
        employee.profile_image_source ?? ProfileImageSourceEnum.UPLOADED,
      default_avatar_id: employee.default_avatar_id,
      selected_default_avatar: resolvedAvatar.selected_default_avatar,
      company_id: employee.company_id,
      primary_branch_id: employee.primary_branch_id,
      primary_department_id: employee.primary_department_id,
      primary_position_id: employee.primary_position_id,
      position_id: employee.primary_position_id,
      grade_id: employee.grade_id,
      cost_center_id: employee.cost_center_id,
      employment_status: employee.employment_status,
      employment_type: employee.employment_type,
      hire_date: employee.hire_date,
      probation_start_date: employee.probation_start_date,
      probation_end_date: employee.probation_end_date,
      confirmation_due_date: employee.confirmation_due_date,
      confirmation_date: employee.confirmation_date,
      confirmation_status: employee.confirmation_status,
      confirmed_by_company_user_id: employee.confirmed_by_company_user_id,
      confirmation_notes: employee.confirmation_notes,
      exit_date: employee.exit_date,
      reports_to: employee.reports_to,
      exit_reason: employee.exit_reason,
      notes: employee.notes,
      metadata: employee.metadata,
      status_changed_at: employee.status_changed_at,
      status_changed_by_company_user_id:
        employee.status_changed_by_company_user_id,
      created_at: employee.created_at,
      updated_at: employee.updated_at,
      primary_branch: this.mapBranch(employee.primary_branch),
      primary_department: this.mapDepartment(employee.primary_department),
      primary_position: this.mapPosition(employee.primary_position),
      position: this.mapPosition(employee.primary_position),
      grade: this.mapGrade(employee.grade),
      cost_center: this.mapCostCenter(employee.cost_center),
      manager: employee.manager
        ? {
            id: employee.manager.id,
            employee_no: employee.manager.employee_no,
            first_name: employee.manager.first_name,
            last_name: employee.manager.last_name,
            profile_photo_url: managerAvatar?.profile_photo_url ?? null,
            uploaded_profile_photo_url:
              managerAvatar?.uploaded_profile_photo_url ?? null,
            profile_photo_source: managerAvatar?.profile_photo_source ?? 'none',
            company_user: this.mapMembershipWithoutAccessDetails(
              employee.manager.company_user,
            ),
          }
        : null,
      departments:
        employee.department_assignments?.map((assignment) => ({
          id: assignment.id,
          department_id: assignment.department_id,
          is_primary: assignment.is_primary,
          department: this.mapDepartment(assignment.department),
        })) ?? [],
      position_assignments:
        employee.position_assignments?.map((assignment) => ({
          id: assignment.id,
          position_id: assignment.position_id,
          is_primary: assignment.is_primary,
          start_date: assignment.start_date,
          end_date: assignment.end_date,
          assignment_type: assignment.assignment_type,
          status: assignment.status,
          notes: assignment.notes,
          position: this.mapPosition(assignment.position),
        })) ?? [],
      contacts: this.sortPrimaryFirst(
        employee.contacts?.filter(
          (contact) => !this.isArchivedContact(contact),
        ),
      ).map((contact) => this.mapContact(contact)),
      addresses: this.sortPrimaryFirst(
        employee.addresses?.filter(
          (address) => !this.isArchivedAddress(address),
        ),
      ).map((address) => this.mapAddress(address)),
      relatives: this.sortPrimaryFirst(
        employee.relatives?.filter(
          (relative) => !this.isArchivedRelative(relative),
        ),
      ).map((relative) => this.mapRelative(relative)),
      identifications: this.sortPrimaryFirst(
        employee.identifications?.filter(
          (identification) => !this.isArchivedIdentification(identification),
        ),
      ).map((identification) => this.mapIdentification(identification)),
      bank_accounts: this.sortPrimaryFirst(
        employee.bank_accounts.filter(
          (bankAccount) => !this.isArchivedBankAccount(bankAccount),
        ),
      ).map((bankAccount) => this.mapBankAccount(bankAccount)),
      academic_qualifications:
        employee.academic_qualifications
          ?.filter(
            (academicQualification) =>
              !this.isArchivedAcademicQualification(academicQualification),
          )
          .map((academicQualification) =>
            this.mapAcademicQualification(academicQualification),
          ) ?? [],
      professional_qualifications:
        employee.professional_qualifications
          ?.filter(
            (professionalQualification) =>
              !this.isArchivedProfessionalQualification(
                professionalQualification,
              ),
          )
          .map((professionalQualification) =>
            this.mapProfessionalQualification(professionalQualification),
          ) ?? [],
      experience_details:
        employee.experience_details
          ?.filter(
            (experienceDetail) =>
              !this.isArchivedExperienceDetail(experienceDetail),
          )
          .map((experienceDetail) =>
            this.mapExperienceDetail(experienceDetail),
          ) ?? [],
      company_user: this.mapMembership(employee.company_user),
      documents: includeDocuments
        ? (employee.documents
            ?.filter((document) => !this.isArchivedDocument(document))
            .map((document) => this.mapDocument(document)) ?? [])
        : undefined,
    };
  }

  private buildEmployeeRelations(includeDocuments = false) {
    return {
      company_user: {
        user: true,
        employee: {
          default_avatar: true,
        },
      },
      default_avatar: true,
      primary_branch: true,
      primary_department: {
        branch: true,
        parent: true,
      },
      primary_position: true,
      grade: true,
      cost_center: true,
      manager: {
        company_user: {
          user: true,
          employee: {
            default_avatar: true,
          },
        },
        default_avatar: true,
      },
      department_assignments: {
        department: {
          branch: true,
          parent: true,
        },
      },
      position_assignments: {
        position: true,
      },
      contacts: true,
      addresses: true,
      relatives: true,
      identifications: true,
      bank_accounts: true,
      academic_qualifications: {
        uploaded_by: {
          user: true,
          employee: true,
        },
      },
      professional_qualifications: {
        uploaded_by: {
          user: true,
          employee: true,
        },
      },
      experience_details: true,
      ...(includeDocuments
        ? {
            documents: {
              uploaded_by: {
                user: true,
                employee: true,
              },
            },
          }
        : {}),
    };
  }

  private async findMembershipByUserId(
    companyId: number,
    userId: number,
    manager?: EntityManager,
  ): Promise<CompanyUser | null> {
    const repository = this.getCompanyUserRepository(manager);

    return repository.findOne({
      where: {
        company_id: companyId,
        user_id: userId,
        status: 'active',
      },
      relations: {
        user: true,
        employee: {
          default_avatar: true,
        },
        role_assignments: {
          role: {
            permissions: true,
          },
        },
        permission_assignments: {
          permission: true,
        },
      },
    });
  }

  private async findMembershipByCompanyUserId(
    companyId: number,
    companyUserId: number,
    manager?: EntityManager,
  ): Promise<CompanyUser | null> {
    const repository = this.getCompanyUserRepository(manager);

    return repository.findOne({
      where: {
        id: companyUserId,
        company_id: companyId,
        status: 'active',
      },
      relations: {
        user: true,
        employee: {
          default_avatar: true,
        },
        role_assignments: {
          role: {
            permissions: true,
          },
        },
        permission_assignments: {
          permission: true,
        },
      },
    });
  }

  private getPrimaryContactValue(
    contacts: EmployeeContactInputDto[] | undefined,
    field: 'email' | 'phone_number',
  ): string | null {
    if (!contacts?.length) {
      return null;
    }

    const primaryContact = contacts.find(
      (contact) => contact.is_primary && contact[field],
    );

    if (primaryContact?.[field]) {
      return primaryContact[field];
    }

    const anyContact = contacts.find((contact) => contact[field]);
    return anyContact?.[field] ?? null;
  }

  private async resolveCompanyMembershipForEmployeeCreation(
    companyId: number,
    createEmployeeDto: CreateEmployeeDto,
    manager?: EntityManager,
  ): Promise<CompanyUser> {
    const userRepository = this.getUserRepository(manager);

    const email = this.getPrimaryContactValue(
      createEmployeeDto.contacts,
      'email',
    );
    const phone = normalizeTanzaniaOrUgandaPhone(
      this.getPrimaryContactValue(createEmployeeDto.contacts, 'phone_number'),
    );

    if (!email || !phone) {
      throw new BadRequestException(
        'Employee contact details must include an email and a valid Tanzanian (+255) or Ugandan (+256) phone number',
      );
    }

    const existingByEmail = await userRepository.findOne({
      where: { email },
    });
    const existingByPhone = await userRepository.findOne({
      where: { phone },
    });

    if (
      existingByEmail &&
      existingByPhone &&
      existingByEmail.id !== existingByPhone.id
    ) {
      throw new ConflictException(
        'Email and phone belong to different existing users',
      );
    }

    if (existingByEmail && existingByEmail.phone !== phone) {
      throw new ConflictException(
        'This email already exists with a different phone number',
      );
    }

    if (existingByPhone && existingByPhone.email !== email) {
      throw new ConflictException(
        'This phone number already exists with a different email address',
      );
    }

    const user =
      existingByEmail ??
      existingByPhone ??
      (await userRepository.save(
        userRepository.create({
          user_no: await this.usersService.generateUserNo(manager),
          first_name: createEmployeeDto.first_name,
          last_name: createEmployeeDto.last_name,
          phone,
          email,
          password: await hashPassword(randomBytes(32).toString('base64url')),
          status: 'active',
          user_type: 'COMPANY_USER',
          is_email_verified: false,
        }),
      ));

    let membership = await this.findMembershipByUserId(
      companyId,
      user.id,
      manager,
    );

    if (!membership) {
      await this.companiesService.addUserToCompany(
        user.id,
        companyId,
        undefined,
        manager,
      );
      membership = await this.findMembershipByUserId(
        companyId,
        user.id,
        manager,
      );
    }

    if (!membership) {
      throw new NotFoundException('Company membership could not be created');
    }

    return membership;
  }

  private async findEmployeeByIdOrFail(
    companyId: number,
    employeeId: number,
  ): Promise<Employee> {
    const employee = await this.employeeRepository.findOne({
      where: {
        id: employeeId,
        company_id: companyId,
      },
      relations: this.buildEmployeeRelations(true),
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  private async generateNextEmployeeNo(
    companyId: number,
    manager?: EntityManager,
  ): Promise<string> {
    const repository = this.getEmployeeRepository(manager);
    const databaseType = this.dataSource.options.type;
    const numericPatternCondition =
      databaseType === 'postgres'
        ? "employee.employee_no ~ '^[0-9]+$'"
        : "employee.employee_no REGEXP '^[0-9]+$'";
    const numericCastExpression =
      databaseType === 'postgres'
        ? 'MAX(CAST(employee.employee_no AS INTEGER))'
        : 'MAX(CAST(employee.employee_no AS UNSIGNED))';

    const result = await repository
      .createQueryBuilder('employee')
      .innerJoin('employee.company_user', 'membership')
      .where('membership.company_id = :companyId', { companyId })
      .andWhere(numericPatternCondition)
      .select(numericCastExpression, 'max')
      .getRawOne<{ max: number | null }>();

    const nextSeq = result?.max ? result.max + 1 : 1;

    return String(nextSeq).padStart(6, '0');
  }

  private async assertUniqueEmployeeNumber(
    companyId: number,
    employeeNo: string,
    excludeEmployeeId?: number,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getEmployeeRepository(manager);
    const qb = repository
      .createQueryBuilder('employee')
      .innerJoin('employee.company_user', 'membership')
      .where('membership.company_id = :companyId', { companyId })
      .andWhere('employee.employee_no = :employeeNo', { employeeNo });

    if (excludeEmployeeId) {
      qb.andWhere('employee.id != :employeeId', {
        employeeId: excludeEmployeeId,
      });
    }

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException(
        `Employee number "${employeeNo}" already exists in this company`,
      );
    }
  }

  private normalizeOptionalEmployeeNumber(value: string | null | undefined) {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private normalizeDepartmentInputs(
    departments: EmployeeDepartmentInputDto[] | undefined,
    primaryDepartmentId: number | null | undefined,
    existingAssignments: EmployeeDepartment[] = [],
  ): EmployeeDepartmentInputDto[] {
    const inputs =
      departments !== undefined
        ? departments.map((department) => ({
            department_id: department.department_id,
            is_primary: department.is_primary ?? false,
          }))
        : existingAssignments.map((assignment) => ({
            department_id: assignment.department_id,
            is_primary: assignment.is_primary,
          }));

    const unique = new Map<number, EmployeeDepartmentInputDto>();
    inputs.forEach((input) => {
      unique.set(input.department_id, input);
    });

    const normalized = Array.from(unique.values());

    if (primaryDepartmentId === null) {
      return normalized.map((input) => ({
        ...input,
        is_primary: false,
      }));
    }

    if (typeof primaryDepartmentId === 'number') {
      if (
        !normalized.some((input) => input.department_id === primaryDepartmentId)
      ) {
        normalized.push({
          department_id: primaryDepartmentId,
          is_primary: true,
        });
      }

      return normalized.map((input) => ({
        ...input,
        is_primary: input.department_id === primaryDepartmentId,
      }));
    }

    const primaryInputs = normalized.filter((input) => input.is_primary);
    if (primaryInputs.length > 1) {
      throw new BadRequestException(
        'Only one employee department assignment can be primary',
      );
    }

    if (primaryInputs.length === 0 && normalized.length === 1) {
      normalized[0].is_primary = true;
    }

    return normalized;
  }

  private normalizeContactInputs(
    contacts: EmployeeContactInputDto[],
  ): EmployeeContactInputDto[] {
    const normalized = contacts.map((contact) => ({
      contact_type: contact.contact_type,
      phone_number:
        this.normalizeOptionalString(contact.phone_number) ?? undefined,
      email:
        this.normalizeOptionalString(contact.email)?.toLowerCase() ?? undefined,
      is_primary: contact.is_primary ?? false,
      is_verified: contact.is_verified ?? false,
      notes: this.normalizeOptionalString(contact.notes) ?? undefined,
    }));

    normalized.forEach((contact) => {
      if (!contact.phone_number && !contact.email) {
        throw new BadRequestException(
          'Each employee contact must include at least a phone number or an email address',
        );
      }
    });

    this.ensureSinglePrimaryPerGroup(
      normalized,
      (contact) => contact.contact_type,
      'Only one primary contact is allowed per contact type',
    );

    const grouped = new Map<ContactTypeEnum, EmployeeContactInputDto[]>();
    normalized.forEach((contact) => {
      const items = grouped.get(contact.contact_type) ?? [];
      items.push(contact);
      grouped.set(contact.contact_type, items);
    });

    grouped.forEach((items) => {
      if (items.length === 1 && !items[0].is_primary) {
        items[0].is_primary = true;
      }
    });

    return normalized;
  }

  private normalizeAddressInputs(
    addresses: EmployeeAddressInputDto[],
  ): EmployeeAddressInputDto[] {
    const normalized = addresses.map((address) => ({
      address_line_1:
        this.normalizeOptionalString(address.address_line_1) ?? undefined,
      address_line_2:
        this.normalizeOptionalString(address.address_line_2) ?? undefined,
      city: this.normalizeOptionalString(address.city) ?? undefined,
      state: this.normalizeOptionalString(address.state) ?? undefined,
      country: this.normalizeOptionalString(address.country) ?? undefined,
      postal_code:
        this.normalizeOptionalString(address.postal_code) ?? undefined,
      address_type: address.address_type,
      is_primary: address.is_primary ?? false,
    }));

    normalized.forEach((address) => {
      if (
        !address.address_line_1 &&
        !address.address_line_2 &&
        !address.city &&
        !address.state &&
        !address.country &&
        !address.postal_code
      ) {
        throw new BadRequestException(
          'Each employee address must include at least one address field',
        );
      }
    });

    this.ensureSinglePrimary(
      normalized,
      'Only one primary address is allowed per employee',
    );

    if (normalized.length === 1 && !normalized[0].is_primary) {
      normalized[0].is_primary = true;
    }

    return normalized;
  }

  private normalizeRelativeInputs(
    relatives: EmployeeRelativeInputDto[],
  ): EmployeeRelativeInputDto[] {
    const normalized = relatives.map((relative) => ({
      full_name: relative.full_name.trim(),
      relationship: relative.relationship.trim(),
      phone: this.normalizeOptionalString(relative.phone) ?? undefined,
      email:
        this.normalizeOptionalString(relative.email)?.toLowerCase() ??
        undefined,
      address: this.normalizeOptionalString(relative.address) ?? undefined,
      occupation:
        this.normalizeOptionalString(relative.occupation) ?? undefined,
      is_emergency_contact: relative.is_emergency_contact ?? false,
      is_primary: relative.is_primary ?? false,
    }));

    this.ensureSinglePrimary(
      normalized,
      'Only one primary relative or emergency contact is allowed per employee',
    );

    if (normalized.length === 1 && !normalized[0].is_primary) {
      normalized[0].is_primary = true;
    }

    return normalized;
  }

  private normalizeIdentificationInputs(
    identifications: EmployeeIdentificationInputDto[],
  ): EmployeeIdentificationInputDto[] {
    const normalized = identifications.map((identification) => ({
      identification_type: identification.identification_type,
      identification_number: identification.identification_number.trim(),
      issued_country:
        this.normalizeOptionalString(identification.issued_country) ??
        undefined,
      issue_date: identification.issue_date,
      issuing_authority:
        this.normalizeOptionalString(identification.issuing_authority) ??
        undefined,
      document_url:
        this.normalizeOptionalString(identification.document_url) ?? undefined,
      expiry_date: identification.expiry_date,
      is_primary: identification.is_primary ?? false,
    }));

    this.ensureSinglePrimaryPerGroup(
      normalized,
      (identification) => identification.identification_type,
      'Only one primary identification is allowed per identification type',
    );

    const grouped = new Map<
      IdentificationTypeEnum,
      EmployeeIdentificationInputDto[]
    >();
    normalized.forEach((identification) => {
      const items = grouped.get(identification.identification_type) ?? [];
      items.push(identification);
      grouped.set(identification.identification_type, items);
    });

    grouped.forEach((items) => {
      if (items.length === 1 && !items[0].is_primary) {
        items[0].is_primary = true;
      }
    });

    return normalized;
  }

  private normalizeBankAccountInputs(
    bankAccounts: EmployeeBankAccountInputDto[],
    employee: Pick<Employee, 'first_name' | 'middle_name' | 'last_name'>,
  ): EmployeeBankAccountInputDto[] {
    const employeeName = this.buildEmployeeDisplayName(employee);
    const normalized = bankAccounts.map((bankAccount) => ({
      bank_name:
        this.normalizeOptionalString(bankAccount.bank_name) ?? undefined,
      account_name:
        this.normalizeOptionalString(bankAccount.account_name) ??
        (employeeName || undefined),
      account_number: bankAccount.account_number.trim(),
      branch_name:
        this.normalizeOptionalString(bankAccount.branch_name) ?? undefined,
      bank_code:
        this.normalizeOptionalString(bankAccount.bank_code)?.toUpperCase() ??
        undefined,
      bank_branch_code:
        this.normalizeOptionalString(bankAccount.bank_branch_code) ?? undefined,
      account_currency:
        this.normalizeOptionalString(
          bankAccount.account_currency,
        )?.toUpperCase() ?? 'TZS',
      account_type:
        this.normalizeOptionalString(bankAccount.account_type) ?? undefined,
      swift_code:
        this.normalizeOptionalString(bankAccount.swift_code) ?? undefined,
      mobile_money_provider:
        this.normalizeOptionalString(bankAccount.mobile_money_provider) ??
        undefined,
      verification_status: 'PENDING',
      effective_from:
        this.normalizeOptionalString(bankAccount.effective_from) ?? undefined,
      effective_to:
        this.normalizeOptionalString(bankAccount.effective_to) ?? undefined,
      is_primary: bankAccount.is_primary ?? false,
    }));

    normalized.forEach((bankAccount) => {
      if (!bankAccount.bank_name && !bankAccount.mobile_money_provider) {
        throw new BadRequestException(
          'Each bank account must include either a bank name or a mobile money provider',
        );
      }
    });

    this.ensureSinglePrimary(
      normalized,
      'Only one primary bank account is allowed per employee',
    );

    if (normalized.length === 1 && !normalized[0].is_primary) {
      normalized[0].is_primary = true;
    }

    return normalized;
  }

  private normalizeAcademicQualificationInputs(
    academicQualifications: EmployeeAcademicQualificationInputDto[],
  ): EmployeeAcademicQualificationInputDto[] {
    const normalized = academicQualifications.map((academicQualification) => ({
      country_of_residence: academicQualification.country_of_residence.trim(),
      education_level: academicQualification.education_level.trim(),
      institution_name: academicQualification.institution_name.trim(),
      degree_or_certificate: academicQualification.degree_or_certificate.trim(),
      field_of_study: academicQualification.field_of_study.trim(),
      start_date: academicQualification.start_date,
      end_date: academicQualification.end_date,
      academic_certificate_document_url:
        academicQualification.academic_certificate_document_url.trim(),
    }));

    normalized.forEach((academicQualification) => {
      this.assertDateOrder(
        academicQualification.start_date,
        academicQualification.end_date,
        'Academic qualification end_date cannot be before start_date',
      );
    });

    return normalized;
  }

  private normalizeProfessionalQualificationInputs(
    professionalQualifications: EmployeeProfessionalQualificationInputDto[],
  ): EmployeeProfessionalQualificationInputDto[] {
    const normalized = professionalQualifications.map(
      (professionalQualification) => ({
        country_of_residence:
          professionalQualification.country_of_residence.trim(),
        institution_name: professionalQualification.institution_name.trim(),
        programme_name: professionalQualification.programme_name.trim(),
        issuing_organization:
          professionalQualification.issuing_organization.trim(),
        issue_date: professionalQualification.issue_date,
        expiry_date: professionalQualification.expiry_date,
        professional_certificate_document_url:
          professionalQualification.professional_certificate_document_url.trim(),
      }),
    );

    normalized.forEach((professionalQualification) => {
      if (professionalQualification.expiry_date) {
        this.assertDateOrder(
          professionalQualification.issue_date,
          professionalQualification.expiry_date,
          'Professional qualification expiry_date cannot be before issue_date',
        );
      }
    });

    return normalized;
  }

  private normalizeExperienceInputs(
    experienceDetails: EmployeeExperienceInputDto[],
  ): EmployeeExperienceInputDto[] {
    const normalized = experienceDetails.map((experienceDetail) => {
      const currentlyWorking = experienceDetail.currently_working ?? false;

      return {
        company_name: experienceDetail.company_name.trim(),
        job_title: experienceDetail.job_title.trim(),
        responsibilities_description:
          experienceDetail.responsibilities_description.trim(),
        start_date: experienceDetail.start_date,
        end_date: currentlyWorking ? undefined : experienceDetail.end_date,
        currently_working: currentlyWorking,
      };
    });

    normalized.forEach((experienceDetail) => {
      if (experienceDetail.currently_working) {
        return;
      }

      if (!experienceDetail.end_date) {
        throw new BadRequestException(
          'Experience end_date is required when currently_working is false',
        );
      }

      this.assertDateOrder(
        experienceDetail.start_date,
        experienceDetail.end_date,
        'Experience end_date cannot be before start_date',
      );
    });

    return normalized;
  }

  private async resolveBranch(
    companyId: number,
    branchId: number | null | undefined,
    actor: AuthenticatedUser,
    manager?: EntityManager,
  ): Promise<Branch | null> {
    if (!branchId) {
      return null;
    }

    const branch = await this.getBranchRepository(manager).findOne({
      where: {
        id: branchId,
        company_id: companyId,
      },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    await this.hrAccessService.assertCanAccessBranch(actor, branch.id);
    return branch;
  }

  private async resolvePosition(
    companyId: number,
    positionId: number | null | undefined,
    actor: AuthenticatedUser,
    manager?: EntityManager,
  ): Promise<Position | null> {
    if (!positionId) {
      return null;
    }

    const position = await this.getPositionRepository(manager).findOne({
      where: {
        id: positionId,
        company_id: companyId,
      },
    });

    if (!position) {
      throw new NotFoundException('Position not found');
    }

    if (position.branch_id) {
      await this.hrAccessService.assertCanAccessBranch(
        actor,
        position.branch_id,
      );
    }

    return position;
  }

  private async resolveManager(
    companyId: number,
    managerEmployeeId: number | null | undefined,
    actor: AuthenticatedUser,
    currentEmployeeId?: number,
    manager?: EntityManager,
  ): Promise<Employee | null> {
    if (!managerEmployeeId) {
      return null;
    }

    if (currentEmployeeId && currentEmployeeId === managerEmployeeId) {
      throw new BadRequestException('An employee cannot report to themselves');
    }

    const repository = this.getEmployeeRepository(manager);
    const employee = await repository.findOne({
      where: {
        id: managerEmployeeId,
        company_user: {
          company_id: companyId,
        },
      },
      relations: {
        primary_branch: true,
        department_assignments: {
          department: true,
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Reporting manager not found');
    }

    await this.hrAccessService.assertCanAccessEmployee(actor, employee);
    return employee;
  }

  private async resolveDepartmentAssignments(
    companyId: number,
    departments: EmployeeDepartmentInputDto[] | undefined,
    primaryDepartmentId: number | null | undefined,
    actor: AuthenticatedUser,
    existingAssignments: EmployeeDepartment[] = [],
    manager?: EntityManager,
  ): Promise<{
    assignments: Array<{ department: Department; is_primary: boolean }>;
    primaryDepartment: Department | null;
  }> {
    const normalized = this.normalizeDepartmentInputs(
      departments,
      primaryDepartmentId,
      existingAssignments,
    );

    if (!normalized.length) {
      return {
        assignments: [],
        primaryDepartment: null,
      };
    }

    const departmentsById = await this.getDepartmentRepository(manager).find({
      where: normalized.map((assignment) => ({
        id: assignment.department_id,
        company_id: companyId,
      })),
      relations: {
        branch: true,
        parent: true,
      },
    });

    if (departmentsById.length !== normalized.length) {
      throw new NotFoundException(
        'One or more employee departments were not found',
      );
    }

    const entityMap = new Map(
      departmentsById.map((department) => [department.id, department]),
    );

    for (const department of departmentsById) {
      if (department.branch_id) {
        await this.hrAccessService.assertCanAccessBranch(
          actor,
          department.branch_id,
        );
      }
    }

    const assignments = normalized.map((assignment) => ({
      department: entityMap.get(assignment.department_id)!,
      is_primary: assignment.is_primary ?? false,
    }));

    return {
      primaryDepartment:
        assignments.find((assignment) => assignment.is_primary)?.department ??
        null,
      assignments,
    };
  }

  private async resolveEmployeeGrade(
    companyId: number,
    gradeId: number | null | undefined,
    manager?: EntityManager,
  ): Promise<EmployeeGrade | null> {
    if (gradeId == null) {
      return null;
    }

    const grade = await this.getEmployeeGradeRepository(manager).findOne({
      where: { id: gradeId, company_id: companyId },
    });

    if (!grade) {
      throw new NotFoundException('Employee grade not found');
    }

    return grade;
  }

  private async resolveCostCenter(
    companyId: number,
    costCenterId: number | null | undefined,
    actor: AuthenticatedUser,
    manager?: EntityManager,
  ): Promise<CostCenter | null> {
    if (costCenterId == null) {
      return null;
    }

    const costCenter = await this.getCostCenterRepository(manager).findOne({
      where: { id: costCenterId, company_id: companyId },
    });

    if (!costCenter) {
      throw new NotFoundException('Cost center not found');
    }

    if (costCenter.branch_id) {
      await this.hrAccessService.assertCanAccessBranch(
        actor,
        costCenter.branch_id,
      );
    }

    if (costCenter.department_id) {
      await this.hrAccessService.assertCanAccessDepartment(
        actor,
        costCenter.department_id,
      );
    }

    return costCenter;
  }

  private buildEmployeeAuditSnapshot(employee: Partial<Employee>) {
    return {
      company_user_id: employee.company_user_id ?? null,
      employee_no: employee.employee_no ?? null,
      first_name: employee.first_name ?? null,
      middle_name: employee.middle_name ?? null,
      last_name: employee.last_name ?? null,
      preferred_name: employee.preferred_name ?? null,
      gender: employee.gender ?? null,
      date_of_birth: employee.date_of_birth ?? null,
      marital_status: employee.marital_status ?? null,
      nationality: employee.nationality ?? null,
      employment_type: employee.employment_type ?? null,
      hire_date: employee.hire_date ?? null,
      notes: employee.notes ?? null,
      metadata: employee.metadata ?? null,
      default_avatar_id: employee.default_avatar_id ?? null,
      profile_image_source: employee.profile_image_source ?? null,
      identifications:
        employee.identifications?.map((value) => ({
          id: value.id,
          type: value.identification_type,
          number_masked: this.maskAuditNumber(value.identification_number),
          verified: value.is_verified,
        })) ?? null,
      bank_accounts:
        employee.bank_accounts?.map((value) => this.bankAuditSnapshot(value)) ??
        null,
    };
  }

  private maskAuditNumber(value: string | null | undefined): string | null {
    return value
      ? `${'*'.repeat(Math.max(value.length - 4, 0))}${value.slice(-4)}`
      : null;
  }

  private bankAuditSnapshot(value: EmployeeBankAccount) {
    return {
      id: value.id,
      bank_name: value.bank_name,
      account_number_masked: this.maskAuditNumber(value.account_number),
      verification_status: value.verification_status,
      verified_by_company_user_id: value.verified_by_company_user_id,
    };
  }

  private async assertIdentifierAvailable(
    companyId: number,
    employeeId: number,
    type: IdentificationTypeEnum,
    rawNumber: string,
    manager?: EntityManager,
  ): Promise<void> {
    if (
      ![
        IdentificationTypeEnum.NATIONAL_ID,
        IdentificationTypeEnum.TAX_ID,
      ].includes(type)
    )
      return;
    const number = rawNumber.replace(/[^0-9]/g, '');
    const length = type === IdentificationTypeEnum.NATIONAL_ID ? 20 : 9;
    if (number.length !== length || !/^[0-9\s-]+$/.test(rawNumber)) {
      throw new BadRequestException(
        `${type === IdentificationTypeEnum.NATIONAL_ID ? 'NIDA' : 'TIN'} must contain ${length} digits`,
      );
    }
    const repository = this.getEmployeeIdentificationRepository(manager);
    const duplicate = await repository
      .createQueryBuilder('identification')
      .innerJoin(
        Employee,
        'employee',
        'employee.id = identification.employee_id',
      )
      .where('employee.company_id = :companyId', { companyId })
      .andWhere('identification.employee_id <> :employeeId', { employeeId })
      .andWhere('identification.identification_type = :type', { type })
      .andWhere('identification.identification_number NOT LIKE :archived', {
        archived: `${ARCHIVED_IDENTIFICATION_PREFIX}%`,
      })
      .andWhere(
        "regexp_replace(identification.identification_number, '[^0-9]', '', 'g') = :number",
        { number },
      )
      .getOne();
    if (duplicate)
      throw new ConflictException(
        'This identifier belongs to another employee in the company',
      );
    if (type === IdentificationTypeEnum.TAX_ID) {
      const payrollDuplicate = await (manager ?? this.dataSource.manager)
        .getRepository(EmployeePayrollProfile)
        .createQueryBuilder('profile')
        .where('profile.companyId = :companyId', { companyId })
        .andWhere('profile.employeeId <> :employeeId', { employeeId })
        .andWhere(
          "regexp_replace(profile.taxpayerIdentificationNumber, '[^0-9]', '', 'g') = :number",
          { number },
        )
        .getOne();
      if (payrollDuplicate)
        throw new ConflictException(
          'This TIN belongs to another employee in the company',
        );
    }
  }

  private buildEmployeeEntityPayload(
    dto: Record<string, unknown>,
    branch: Branch | null,
    primaryDepartment: Department | null,
    primaryPosition: Position | null,
    managerEmployee: Employee | null,
  ): Partial<Employee> {
    const payload: Partial<Employee> = {};

    const directFields: Array<keyof Employee> = [
      'employee_no',
      'first_name',
      'middle_name',
      'last_name',
      'preferred_name',
      'gender',
      'date_of_birth',
      'marital_status',
      'nationality',
      'profile_photo_url',
      'profile_image_source',
      'default_avatar_id',
      'employment_status',
      'employment_type',
      'hire_date',
      'probation_start_date',
      'probation_end_date',
      'confirmation_due_date',
      'confirmation_date',
      'confirmation_status',
      'confirmation_notes',
      'exit_date',
      'exit_reason',
      'notes',
      'metadata',
    ];

    for (const field of directFields) {
      if (field in dto) {
        if (dto[field] === undefined) {
          continue;
        }

        if (field === 'gender') {
          payload.gender = this.normalizeGender(dto[field]);
          continue;
        }

        (payload as Record<string, unknown>)[field] = dto[field];
      }
    }

    if ('primary_branch_id' in dto) {
      payload.primary_branch_id = branch?.id ?? null;
    }

    if ('primary_department_id' in dto || 'departments' in dto) {
      payload.primary_department_id = primaryDepartment?.id ?? null;
    }

    if ('primary_position_id' in dto || 'position_id' in dto) {
      payload.primary_position_id = primaryPosition?.id ?? null;
    }

    if ('reports_to' in dto) {
      payload.reports_to = managerEmployee?.id ?? null;
    }

    return payload;
  }

  private normalizeGender(value: unknown): 'male' | 'female' {
    if (typeof value !== 'string') {
      throw new BadRequestException('gender is required');
    }

    const normalized = value.trim().toLowerCase();
    if (normalized !== 'male' && normalized !== 'female') {
      throw new BadRequestException('gender must be either "male" or "female"');
    }

    return normalized;
  }

  private isDataUrlProfilePhoto(value: unknown): value is string {
    return (
      typeof value === 'string' &&
      value.trim().toLowerCase().startsWith('data:image/')
    );
  }

  private buildBase64ProfilePhotoFile(
    value: string,
    employee: Employee,
  ): Base64FileDto {
    const mimeTypeMatch = value.match(/^data:([^;]+);base64,/i);
    const mimeType = mimeTypeMatch?.[1]?.trim().toLowerCase() ?? 'image/png';
    const extensionMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    const extension = extensionMap[mimeType];

    if (!extension) {
      throw new BadRequestException(
        'profile_photo_url must be a JPEG, PNG, or WEBP image.',
      );
    }

    const normalizedPayload = value
      .trim()
      .replace(/^data:[^;]+;base64,/i, '')
      .replace(/\s+/g, '');
    const buffer = Buffer.from(normalizedPayload, 'base64');

    return {
      fileName: `employee-${employee.employee_no || employee.id || 'profile'}.${extension}`,
      fileSize: buffer.length,
      mimeType,
      fileString: value.trim(),
    };
  }

  private async applyProfileImageSelection(
    companyId: number,
    employee: Employee,
    dto: Partial<EmployeeMutationDto>,
  ) {
    const previousManagedProfilePhoto = employee.profile_photo_url;

    if ('default_avatar_id' in dto) {
      const requestedAvatarId = dto.default_avatar_id ?? null;
      if (requestedAvatarId === null) {
        employee.default_avatar_id = null;
        employee.default_avatar = null;
      } else {
        const selectedAvatar =
          await this.defaultAvatarsService.assertAvatarAvailableForEmployee(
            companyId,
            requestedAvatarId,
            employee.gender,
          );
        employee.default_avatar_id = selectedAvatar.id;
        employee.default_avatar = selectedAvatar;
      }
    }

    if ('profile_photo_url' in dto && dto.profile_photo_url !== undefined) {
      const requestedProfilePhotoUrl: unknown = dto.profile_photo_url;

      if (this.isDataUrlProfilePhoto(requestedProfilePhotoUrl)) {
        const storedFile = await this.filesService.saveBase64File(
          this.buildBase64ProfilePhotoFile(requestedProfilePhotoUrl, employee),
          {
            directorySegments: ['profile-photos', `company-${companyId}`],
            fileNamePrefix: `employee-${employee.employee_no || employee.id || 'profile'}`,
            allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
          },
        );

        employee.profile_photo_url = storedFile.publicPath;
      } else {
        employee.profile_photo_url =
          typeof requestedProfilePhotoUrl === 'string'
            ? requestedProfilePhotoUrl.trim() || null
            : null;
      }
    }

    if (employee.default_avatar_id) {
      employee.profile_image_source = ProfileImageSourceEnum.DEFAULT_AVATAR;
    } else if (this.isDataUrlProfilePhoto(dto.profile_photo_url)) {
      employee.profile_image_source = ProfileImageSourceEnum.UPLOADED;
    } else if (!employee.profile_photo_url) {
      employee.profile_image_source = null;
    } else {
      employee.profile_image_source = ProfileImageSourceEnum.UPLOADED;
    }

    if (
      employee.profile_image_source === ProfileImageSourceEnum.DEFAULT_AVATAR &&
      !employee.default_avatar_id
    ) {
      throw new BadRequestException(
        'A default avatar must be selected before using it as the profile image.',
      );
    }

    if (
      previousManagedProfilePhoto &&
      previousManagedProfilePhoto !== employee.profile_photo_url &&
      employee.profile_photo_url?.startsWith('/uploads/profile-photos/')
    ) {
      await this.filesService.removeManagedFile(previousManagedProfilePhoto);
    }
  }

  private async saveDepartmentAssignments(
    employeeId: number,
    assignments: Array<{ department: Department; is_primary: boolean }>,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getEmployeeDepartmentRepository(manager);
    await repository.delete({ employee_id: employeeId });

    if (!assignments.length) {
      return;
    }

    await repository.save(
      assignments.map((assignment) =>
        repository.create({
          employee_id: employeeId,
          department_id: assignment.department.id,
          is_primary: assignment.is_primary,
        }),
      ),
    );
  }

  private getTodayDate(): string {
    return formatDateOnly(new Date());
  }

  private async syncPrimaryPositionAssignments(
    companyId: number,
    employee: Employee,
    primaryPosition: Position | null,
    actor: AuthenticatedUser,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getEmployeePositionRepository(manager);
    const today = this.getTodayDate();

    await repository
      .createQueryBuilder()
      .update(EmployeePosition)
      .set({
        is_primary: false,
        status: EmployeePositionStatusEnum.COMPLETED,
        end_date: today,
        ended_by_company_user_id: actor.companyMembershipId ?? null,
      })
      .where('company_id = :companyId', { companyId })
      .andWhere('employee_id = :employeeId', { employeeId: employee.id })
      .andWhere('is_primary = :isPrimary', { isPrimary: true })
      .andWhere('status = :status', {
        status: EmployeePositionStatusEnum.ACTIVE,
      })
      .andWhere('end_date IS NULL')
      .execute();

    if (!primaryPosition) {
      return;
    }

    const existingQuery = repository
      .createQueryBuilder('employeePosition')
      .where('employeePosition.company_id = :companyId', { companyId })
      .andWhere('employeePosition.employee_id = :employeeId', {
        employeeId: employee.id,
      })
      .andWhere('employeePosition.position_id = :positionId', {
        positionId: primaryPosition.id,
      })
      .andWhere('employeePosition.is_primary = :isPrimary', { isPrimary: true })
      .andWhere('employeePosition.status = :status', {
        status: EmployeePositionStatusEnum.ACTIVE,
      })
      .andWhere('employeePosition.end_date IS NULL');

    const existing = await existingQuery.getOne();

    if (existing) {
      return;
    }

    await repository.save(
      repository.create({
        company_id: companyId,
        employee_id: employee.id,
        position_id: primaryPosition.id,
        is_primary: true,
        start_date: employee.hire_date ?? today,
        end_date: null,
        assignment_type: EmployeePositionAssignmentTypeEnum.PRIMARY,
        status: EmployeePositionStatusEnum.ACTIVE,
        notes: 'Auto-synced from employee primary position',
        assignment_reason: 'Initial employee assignment',
        assigned_by_company_user_id: actor.companyMembershipId ?? null,
      }),
    );
  }

  private async saveEmployeeContacts(
    employeeId: number,
    contacts: EmployeeContactInputDto[],
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getEmployeeContactRepository(manager);
    await repository.delete({ employee_id: employeeId });

    if (!contacts.length) {
      return;
    }

    await repository.save(
      contacts.map((contact) =>
        repository.create({
          employee_id: employeeId,
          contact_type: contact.contact_type,
          phone_number: contact.phone_number ?? null,
          email: contact.email ?? null,
          is_primary: contact.is_primary ?? false,
          is_verified: contact.is_verified ?? false,
          notes: contact.notes ?? null,
        }),
      ),
    );
  }

  private async saveEmployeeAddresses(
    employeeId: number,
    addresses: EmployeeAddressInputDto[],
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getEmployeeAddressRepository(manager);
    await repository.delete({ employee_id: employeeId });

    if (!addresses.length) {
      return;
    }

    await repository.save(
      addresses.map((address) =>
        repository.create({
          employee_id: employeeId,
          address_line_1: address.address_line_1 ?? null,
          address_line_2: address.address_line_2 ?? null,
          city: address.city ?? null,
          state: address.state ?? null,
          country: address.country ?? null,
          postal_code: address.postal_code ?? null,
          address_type: address.address_type,
          is_primary: address.is_primary ?? false,
        }),
      ),
    );
  }

  private async saveEmployeeRelatives(
    employeeId: number,
    relatives: EmployeeRelativeInputDto[],
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getEmployeeRelativeRepository(manager);
    await repository.delete({ employee_id: employeeId });

    if (!relatives.length) {
      return;
    }

    await repository.save(
      relatives.map((relative) =>
        repository.create({
          employee_id: employeeId,
          full_name: relative.full_name,
          relationship: relative.relationship,
          phone: relative.phone ?? null,
          email: relative.email ?? null,
          address: relative.address ?? null,
          occupation: relative.occupation ?? null,
          is_emergency_contact: relative.is_emergency_contact ?? false,
          is_primary: relative.is_primary ?? false,
        }),
      ),
    );
  }

  private async saveEmployeeIdentifications(
    companyId: number,
    employeeId: number,
    identifications: EmployeeIdentificationInputDto[],
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getEmployeeIdentificationRepository(manager);
    for (const identification of identifications) {
      await this.assertIdentifierAvailable(
        companyId,
        employeeId,
        identification.identification_type,
        identification.identification_number,
        manager,
      );
    }
    await repository.delete({ employee_id: employeeId });

    if (!identifications.length) {
      return;
    }

    await repository.save(
      identifications.map((identification) =>
        repository.create({
          employee_id: employeeId,
          identification_type: identification.identification_type,
          identification_number: identification.identification_number,
          issued_country: identification.issued_country ?? null,
          issue_date: identification.issue_date ?? null,
          issuing_authority: identification.issuing_authority ?? null,
          document_url: identification.document_url ?? null,
          expiry_date: identification.expiry_date ?? null,
          is_primary: identification.is_primary ?? false,
          is_verified: false,
          verified_at: null,
          verified_by_company_user_id: null,
        }),
      ),
    );
  }

  private async saveEmployeeBankAccounts(
    employeeId: number,
    bankAccounts: EmployeeBankAccountInputDto[],
    actor: AuthenticatedUser,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getEmployeeBankAccountRepository(manager);
    await repository.delete({ employee_id: employeeId });

    if (!bankAccounts.length) {
      return;
    }

    await repository.save(
      bankAccounts.map((bankAccount) =>
        repository.create({
          employee_id: employeeId,
          bank_name: bankAccount.bank_name ?? null,
          account_name: bankAccount.account_name ?? null,
          account_number: bankAccount.account_number,
          branch_name: bankAccount.branch_name ?? null,
          bank_code: bankAccount.bank_code ?? null,
          bank_branch_code: bankAccount.bank_branch_code ?? null,
          account_currency: bankAccount.account_currency ?? 'TZS',
          account_type: bankAccount.account_type ?? null,
          swift_code: bankAccount.swift_code ?? null,
          mobile_money_provider: bankAccount.mobile_money_provider ?? null,
          verification_status: 'PENDING',
          created_by_company_user_id: actor.companyMembershipId ?? null,
          effective_from: bankAccount.effective_from ?? null,
          effective_to: bankAccount.effective_to ?? null,
          is_primary: bankAccount.is_primary ?? false,
        }),
      ),
    );
  }

  private async saveEmployeeAcademicQualifications(
    employeeId: number,
    academicQualifications: EmployeeAcademicQualificationInputDto[],
    actor: AuthenticatedUser,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getEmployeeAcademicQualificationRepository(manager);
    await repository.delete({ employee_id: employeeId });

    if (!academicQualifications.length) {
      return;
    }

    await repository.save(
      academicQualifications.map((academicQualification) =>
        repository.create({
          employee_id: employeeId,
          country_of_residence: academicQualification.country_of_residence,
          education_level: academicQualification.education_level,
          institution_name: academicQualification.institution_name,
          degree_or_certificate: academicQualification.degree_or_certificate,
          field_of_study: academicQualification.field_of_study,
          start_date: academicQualification.start_date,
          end_date: academicQualification.end_date,
          academic_certificate_document_url:
            academicQualification.academic_certificate_document_url,
          uploaded_by_company_user_id: actor.companyMembershipId ?? null,
        }),
      ),
    );
  }

  private async saveEmployeeProfessionalQualifications(
    employeeId: number,
    professionalQualifications: EmployeeProfessionalQualificationInputDto[],
    actor: AuthenticatedUser,
    manager?: EntityManager,
  ): Promise<void> {
    const repository =
      this.getEmployeeProfessionalQualificationRepository(manager);
    await repository.delete({ employee_id: employeeId });

    if (!professionalQualifications.length) {
      return;
    }

    await repository.save(
      professionalQualifications.map((professionalQualification) =>
        repository.create({
          employee_id: employeeId,
          country_of_residence: professionalQualification.country_of_residence,
          institution_name: professionalQualification.institution_name,
          programme_name: professionalQualification.programme_name,
          issuing_organization: professionalQualification.issuing_organization,
          issue_date: professionalQualification.issue_date,
          expiry_date: professionalQualification.expiry_date ?? null,
          professional_certificate_document_url:
            professionalQualification.professional_certificate_document_url,
          uploaded_by_company_user_id: actor.companyMembershipId ?? null,
        }),
      ),
    );
  }

  private async saveEmployeeExperienceDetails(
    employeeId: number,
    experienceDetails: EmployeeExperienceInputDto[],
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getEmployeeExperienceRepository(manager);
    await repository.delete({ employee_id: employeeId });

    if (!experienceDetails.length) {
      return;
    }

    await repository.save(
      experienceDetails.map((experienceDetail) =>
        repository.create({
          employee_id: employeeId,
          company_name: experienceDetail.company_name,
          job_title: experienceDetail.job_title,
          responsibilities_description:
            experienceDetail.responsibilities_description,
          start_date: experienceDetail.start_date,
          end_date: experienceDetail.end_date ?? null,
          currently_working: experienceDetail.currently_working ?? false,
        }),
      ),
    );
  }

  private normalizeStatusFields(
    dto: Partial<
      Pick<Employee, 'employment_status' | 'exit_date' | 'exit_reason'>
    >,
  ): Partial<
    Pick<Employee, 'employment_status' | 'exit_date' | 'exit_reason'>
  > {
    const normalized = { ...dto };

    if (
      normalized.employment_status &&
      [EmploymentStatusEnum.TERMINATED, EmploymentStatusEnum.EXITED].includes(
        normalized.employment_status,
      )
    ) {
      if (!normalized.exit_date) {
        normalized.exit_date = formatDateOnly(new Date());
      }
    }

    if (
      normalized.employment_status &&
      ![EmploymentStatusEnum.TERMINATED, EmploymentStatusEnum.EXITED].includes(
        normalized.employment_status,
      )
    ) {
      normalized.exit_date = null;
      if (normalized.exit_reason === undefined) {
        normalized.exit_reason = null;
      }
    }

    return normalized;
  }

  private async persistEmployee(
    companyId: number,
    employee: Employee,
    dto: Partial<EmployeeMutationDto>,
    actor: AuthenticatedUser,
    manager?: EntityManager,
  ): Promise<Employee> {
    const lifecycleFields = dto as Partial<
      Pick<Employee, 'employment_status' | 'exit_date' | 'exit_reason'>
    >;
    const numberedFields = dto as { employee_no?: string | null };

    const normalizedStatus = this.normalizeStatusFields({
      employment_status: lifecycleFields.employment_status,
      exit_date: lifecycleFields.exit_date,
      exit_reason: lifecycleFields.exit_reason,
    });

    const branch =
      'primary_branch_id' in dto
        ? await this.resolveBranch(
            companyId,
            dto.primary_branch_id,
            actor,
            manager,
          )
        : (employee.primary_branch ?? null);

    const { assignments, primaryDepartment } =
      'departments' in dto || 'primary_department_id' in dto
        ? await this.resolveDepartmentAssignments(
            companyId,
            dto.departments,
            dto.primary_department_id,
            actor,
            employee.department_assignments ?? [],
            manager,
          )
        : {
            assignments:
              employee.department_assignments?.map((assignment) => ({
                department: assignment.department,
                is_primary: assignment.is_primary,
              })) ?? [],
            primaryDepartment: employee.primary_department ?? null,
          };

    const requestedPrimaryPositionId =
      'primary_position_id' in dto
        ? dto.primary_position_id
        : 'position_id' in dto
          ? dto.position_id
          : undefined;

    const primaryPosition =
      requestedPrimaryPositionId !== undefined
        ? await this.resolvePosition(
            companyId,
            requestedPrimaryPositionId,
            actor,
            manager,
          )
        : (employee.primary_position ?? null);

    if (
      primaryPosition &&
      primaryDepartment?.id &&
      !(await this.positionAvailabilityService.isPositionAvailableForDepartment(
        companyId,
        primaryPosition,
        primaryDepartment.id,
      ))
    ) {
      throw new BadRequestException(
        'primary_position_id does not belong to the selected primary_department_id',
      );
    }

    if (
      primaryPosition &&
      branch?.id &&
      !(await this.positionAvailabilityService.isPositionAvailableForBranch(
        companyId,
        primaryPosition,
        branch.id,
      ))
    ) {
      throw new BadRequestException(
        'primary_position_id does not belong to the selected primary_branch_id',
      );
    }

    const managerEmployee =
      'reports_to' in dto
        ? await this.resolveManager(
            companyId,
            dto.reports_to,
            actor,
            employee.id || undefined,
            manager,
          )
        : (employee.manager ?? null);

    const grade =
      'grade_id' in dto
        ? await this.resolveEmployeeGrade(companyId, dto.grade_id, manager)
        : null;

    const costCenter =
      'cost_center_id' in dto
        ? await this.resolveCostCenter(
            companyId,
            dto.cost_center_id,
            actor,
            manager,
          )
        : null;

    const normalizedEmployeeNo = this.normalizeOptionalEmployeeNumber(
      numberedFields.employee_no,
    );

    if ('employee_no' in dto && normalizedEmployeeNo) {
      await this.assertUniqueEmployeeNumber(
        companyId,
        normalizedEmployeeNo,
        employee.id || undefined,
        manager,
      );
    }

    const payload = this.buildEmployeeEntityPayload(
      {
        ...dto,
        employee_no:
          'employee_no' in dto
            ? normalizedEmployeeNo
            : numberedFields.employee_no,
        ...normalizedStatus,
      },
      branch,
      primaryDepartment,
      primaryPosition,
      managerEmployee,
    );

    Object.assign(employee, payload);
    employee.company_id = companyId;
    if ('grade_id' in dto) {
      employee.grade_id = grade?.id ?? null;
    }
    if ('cost_center_id' in dto) {
      employee.cost_center_id = costCenter?.id ?? null;
    }
    employee.gender = this.normalizeGender(employee.gender);
    await this.applyProfileImageSelection(companyId, employee, dto);

    if (
      employee.confirmation_status === EmployeeConfirmationStatusEnum.CONFIRMED
    ) {
      employee.confirmed_by_company_user_id = actor.companyMembershipId ?? null;
      employee.confirmation_date =
        employee.confirmation_date ?? this.getTodayDate();
    } else if ('confirmation_status' in dto) {
      employee.confirmed_by_company_user_id = null;
      if (!('confirmation_date' in dto)) {
        employee.confirmation_date = null;
      }
    }

    if (!employee.probation_start_date && employee.probation_end_date) {
      employee.probation_start_date = employee.hire_date ?? this.getTodayDate();
    }

    if (
      !employee.primary_branch_id &&
      primaryDepartment?.branch_id &&
      !('primary_branch_id' in dto)
    ) {
      employee.primary_branch_id = primaryDepartment.branch_id;
    }

    const normalizedContacts =
      'contacts' in dto && dto.contacts !== undefined
        ? this.normalizeContactInputs(dto.contacts)
        : undefined;
    const normalizedAddresses =
      'addresses' in dto && dto.addresses !== undefined
        ? this.normalizeAddressInputs(dto.addresses)
        : undefined;
    const normalizedRelatives =
      'relatives' in dto && dto.relatives !== undefined
        ? this.normalizeRelativeInputs(dto.relatives)
        : undefined;
    const normalizedIdentifications =
      'identifications' in dto && dto.identifications !== undefined
        ? this.normalizeIdentificationInputs(dto.identifications)
        : undefined;
    const normalizedBankAccounts =
      'bank_accounts' in dto && dto.bank_accounts !== undefined
        ? this.normalizeBankAccountInputs(dto.bank_accounts, employee)
        : undefined;
    const normalizedAcademicQualifications =
      'academic_qualifications' in dto &&
      dto.academic_qualifications !== undefined
        ? this.normalizeAcademicQualificationInputs(dto.academic_qualifications)
        : undefined;
    const normalizedProfessionalQualifications =
      'professional_qualifications' in dto &&
      dto.professional_qualifications !== undefined
        ? this.normalizeProfessionalQualificationInputs(
            dto.professional_qualifications,
          )
        : undefined;
    const normalizedExperienceDetails =
      'experience_details' in dto && dto.experience_details !== undefined
        ? this.normalizeExperienceInputs(dto.experience_details)
        : undefined;

    const saved = await this.getEmployeeRepository(manager).save(employee);

    if ('departments' in dto || 'primary_department_id' in dto) {
      await this.saveDepartmentAssignments(saved.id, assignments, manager);
    }

    if ('primary_position_id' in dto || 'position_id' in dto) {
      await this.syncPrimaryPositionAssignments(
        companyId,
        saved,
        primaryPosition,
        actor,
        manager,
      );
    }

    if (normalizedContacts !== undefined) {
      await this.saveEmployeeContacts(saved.id, normalizedContacts, manager);
    }

    if (normalizedAddresses !== undefined) {
      await this.saveEmployeeAddresses(saved.id, normalizedAddresses, manager);
    }

    if (normalizedRelatives !== undefined) {
      await this.saveEmployeeRelatives(saved.id, normalizedRelatives, manager);
    }

    if (normalizedIdentifications !== undefined) {
      await this.saveEmployeeIdentifications(
        companyId,
        saved.id,
        normalizedIdentifications,
        manager,
      );
    }

    if (normalizedBankAccounts !== undefined) {
      await this.saveEmployeeBankAccounts(
        saved.id,
        normalizedBankAccounts,
        actor,
        manager,
      );
    }

    if (normalizedAcademicQualifications !== undefined) {
      await this.saveEmployeeAcademicQualifications(
        saved.id,
        normalizedAcademicQualifications,
        actor,
        manager,
      );
    }

    if (normalizedProfessionalQualifications !== undefined) {
      await this.saveEmployeeProfessionalQualifications(
        saved.id,
        normalizedProfessionalQualifications,
        actor,
        manager,
      );
    }

    if (normalizedExperienceDetails !== undefined) {
      await this.saveEmployeeExperienceDetails(
        saved.id,
        normalizedExperienceDetails,
        manager,
      );
    }

    return saved;
  }

  private async initializeCurrentYearLeaveBalances(
    companyId: number,
    employee: Pick<
      Employee,
      | 'id'
      | 'employment_status'
      | 'primary_department_id'
      | 'primary_position_id'
      | 'primary_branch_id'
    >,
    manager: EntityManager,
  ): Promise<void> {
    if (employee.employment_status !== EmploymentStatusEnum.ACTIVE) {
      return;
    }

    const fiscalYear = this.leaveBalanceService.getFiscalYearFromDate(
      new Date(),
    );

    await this.leaveBalanceService.ensureBalancesForEmployeeYear(
      companyId,
      employee,
      fiscalYear,
      manager,
    );
  }

  async create(
    companyId: number,
    createEmployeeDto: CreateEmployeeDto,
    actor: AuthenticatedUser,
    context: AuditRequestContext = EMPTY_AUDIT_CONTEXT,
  ) {
    const creation = await this.dataSource.transaction(async (manager) => {
      const membership = await this.resolveCompanyMembershipForEmployeeCreation(
        companyId,
        createEmployeeDto,
        manager,
      );

      return this.createForCompanyUserMembership(
        companyId,
        membership,
        { ...createEmployeeDto, onboarding: { auto_start: false } },
        actor,
        context,
        manager,
      );
    });

    // Employee creation has committed. Optional onboarding must not hide it.
    let onboardingRequest: OnboardingCreationResult | null = null;
    const warnings: string[] = [];
    if (
      createEmployeeDto.onboarding &&
      createEmployeeDto.onboarding.auto_start !== false
    ) {
      try {
        onboardingRequest =
          await this.onboardingService.startOnboardingForEmployee(
            companyId,
            {
              ...createEmployeeDto.onboarding,
              employee_id: creation.employeeId,
            },
            actor,
          );
        if (onboardingRequest.warning) {
          warnings.push(
            onboardingRequest.warning.replace(
              'Onboarding saved',
              'Employee created; onboarding saved',
            ),
          );
        }
      } catch (error) {
        this.logger.warn(
          `Onboarding could not start for employee ${creation.employeeId}`,
        );
        const reason =
          error instanceof HttpException && error.getStatus() < 500
            ? error.message
            : 'Onboarding could not start';
        warnings.push(`${reason}. Employee created.`);
      }
    }

    const employee = await this.findOne(
      companyId,
      creation.employeeId,
      actor,
    ).catch(() => {
      warnings.push('Employee created; full profile could not be loaded.');
      return creation.employee;
    });

    return {
      ...employee,
      onboarding_request: onboardingRequest
        ? {
            id: onboardingRequest.id,
            status: onboardingRequest.status,
            onboarding_no: onboardingRequest.onboarding_no,
          }
        : null,
      warning: warnings.length ? warnings.join(' ') : null,
      warning_details: onboardingRequest?.warning_details ?? [],
    };
  }

  async createInTransaction(
    companyId: number,
    createEmployeeDto: CreateEmployeeDto,
    actor: AuthenticatedUser,
    manager: EntityManager,
    options: { allowPositionOverfill?: boolean } = {},
  ) {
    const membership = await this.resolveCompanyMembershipForEmployeeCreation(
      companyId,
      createEmployeeDto,
      manager,
    );
    return this.createForCompanyUserMembership(
      companyId,
      membership,
      createEmployeeDto,
      actor,
      EMPTY_AUDIT_CONTEXT,
      manager,
      options,
    );
  }

  async createForCompanyUser(
    companyId: number,
    companyUserId: number,
    createEmployeeDto: CreateEmployeeDto,
    actor: AuthenticatedUser,
    manager?: EntityManager,
  ): Promise<{ employeeId: number; onboardingRequestId: number | null }> {
    if (manager) {
      const membership = await this.findMembershipByCompanyUserId(
        companyId,
        companyUserId,
        manager,
      );

      if (!membership) {
        throw new NotFoundException('Company membership not found');
      }

      return this.createForCompanyUserMembership(
        companyId,
        membership,
        createEmployeeDto,
        actor,
        {
          ipAddress: null,
          userAgent: null,
          requestId: null,
        },
        manager,
      );
    }

    return this.dataSource.transaction(async (txManager) => {
      const membership = await this.findMembershipByCompanyUserId(
        companyId,
        companyUserId,
        txManager,
      );

      if (!membership) {
        throw new NotFoundException('Company membership not found');
      }

      return this.createForCompanyUserMembership(
        companyId,
        membership,
        createEmployeeDto,
        actor,
        {
          ipAddress: null,
          userAgent: null,
          requestId: null,
        },
        txManager,
      );
    });
  }

  private async createForCompanyUserMembership(
    companyId: number,
    membership: CompanyUser,
    createEmployeeDto: CreateEmployeeDto,
    actor: AuthenticatedUser,
    context: AuditRequestContext,
    manager: EntityManager,
    options: { allowPositionOverfill?: boolean } = {},
  ): Promise<{
    employeeId: number;
    onboardingRequestId: number | null;
    employee: Pick<
      Employee,
      'id' | 'employee_no' | 'company_user_id' | 'first_name' | 'last_name'
    >;
  }> {
    const existingEmployee = await this.getEmployeeRepository(manager).findOne({
      where: { company_user_id: membership.id },
    });

    if (existingEmployee) {
      throw new ConflictException({
        message: 'This company user already has an employee profile',
        employee_id: existingEmployee.id,
        employee: {
          id: existingEmployee.id,
          employee_no: existingEmployee.employee_no,
          first_name: existingEmployee.first_name,
          last_name: existingEmployee.last_name,
        },
      });
    }

    const positionId =
      createEmployeeDto.primary_position_id ?? createEmployeeDto.position_id;
    if (positionId) {
      const position = await this.getPositionRepository(manager)
        .createQueryBuilder('position')
        .setLock('pessimistic_write')
        .where(
          'position.id = :positionId AND position.company_id = :companyId',
          { positionId, companyId },
        )
        .getOne();
      if (!position) throw new BadRequestException('Position is not available');
      const occupied = await this.getEmployeeRepository(manager)
        .createQueryBuilder('employee')
        .where('employee.company_id = :companyId', { companyId })
        .andWhere('employee.primary_position_id = :positionId', { positionId })
        .andWhere('employee.employment_status IN (:...statuses)', {
          statuses: [
            EmploymentStatusEnum.ONBOARDING,
            EmploymentStatusEnum.ACTIVE,
            EmploymentStatusEnum.SUSPENDED,
          ],
        })
        .getCount();
      if (occupied >= position.headcount && !options.allowPositionOverfill)
        throw new ConflictException('Position headcount is full');
    }

    const requestedEmployeeNo = this.normalizeOptionalEmployeeNumber(
      createEmployeeDto.employee_no,
    );
    let employeeNo: string;

    if (requestedEmployeeNo) {
      if (!hasPermission(actor.permissions, 'employees:override-number')) {
        throw new ForbiddenException(
          'Manual employee numbers require the employees:override-number permission',
        );
      }

      employeeNo = await this.employeeNumberService.reserveImportedNumber(
        companyId,
        requestedEmployeeNo,
      );
    } else {
      employeeNo = await this.employeeNumberService.allocateNext(companyId);
    }

    const employee = this.getEmployeeRepository(manager).create({
      company_id: companyId,
      company_user_id: membership.id,
      employee_no: employeeNo,
      first_name: createEmployeeDto.first_name,
      last_name: createEmployeeDto.last_name,
      employment_status:
        createEmployeeDto.employment_status ?? EmploymentStatusEnum.ONBOARDING,
      employment_type:
        createEmployeeDto.employment_type ?? EmploymentTypeEnum.FULL_TIME,
    });

    const savedEmployee = await this.persistEmployee(
      companyId,
      employee,
      createEmployeeDto,
      actor,
      manager,
    );

    await this.initializeCurrentYearLeaveBalances(
      companyId,
      savedEmployee,
      manager,
    );
    await this.employeeAssignmentService.recordInitialAssignments(
      companyId,
      savedEmployee,
      actor,
      manager,
    );

    let onboardingRequestId: number | null = null;
    if (
      createEmployeeDto.onboarding &&
      createEmployeeDto.onboarding.auto_start !== false
    ) {
      const onboardingRequest =
        await this.onboardingService.startOnboardingForEmployee(
          companyId,
          {
            employee_id: savedEmployee.id,
            workflow_id: createEmployeeDto.onboarding?.workflow_id,
            title: createEmployeeDto.onboarding?.title,
            description: createEmployeeDto.onboarding?.description,
            planned_start_date:
              createEmployeeDto.onboarding?.planned_start_date,
            planned_completion_date:
              createEmployeeDto.onboarding?.planned_completion_date,
            submit: createEmployeeDto.onboarding?.submit,
            provisioning: createEmployeeDto.onboarding?.provisioning,
          },
          actor,
          manager,
        );
      onboardingRequestId = onboardingRequest.id;
    }

    await this.securityEventsService.log(
      {
        eventType: SecurityEventType.EMPLOYEE_CREATED,
        outcome: SecurityEventOutcome.SUCCESS,
        actor,
        companyId,
        targetCompanyUserId: savedEmployee.company_user_id,
        resourceType: 'employee',
        resourceId: savedEmployee.id,
        newValues: {
          ...this.buildEmployeeAuditSnapshot(savedEmployee),
          onboarding_request_id: onboardingRequestId,
        },
        context,
      },
      manager,
    );

    return {
      employeeId: savedEmployee.id,
      onboardingRequestId,
      employee: {
        id: savedEmployee.id,
        employee_no: savedEmployee.employee_no,
        company_user_id: savedEmployee.company_user_id,
        first_name: savedEmployee.first_name,
        last_name: savedEmployee.last_name,
      },
    };
  }

  async findMyProfile(companyId: number, userId: number) {
    const membership = await this.findMembershipByUserId(companyId, userId);

    if (!membership) {
      throw new NotFoundException('Active company membership not found');
    }

    const employeeMembership = await this.employeeRepository.findOne({
      where: { company_user_id: membership.id },
      select: ['id'],
    });

    if (!employeeMembership) {
      throw new NotFoundException('Employee not found');
    }

    const employee = await this.findEmployeeByIdOrFail(
      companyId,
      employeeMembership.id,
    );

    return this.mapEmployee(employee, true);
  }

  async updateMyProfile(
    companyId: number,
    userId: number,
    updateEmployeeDto: UpdateEmployeeDto,
    actor: AuthenticatedUser,
    context: AuditRequestContext = EMPTY_AUDIT_CONTEXT,
  ) {
    const employeeId = await this.resolveMyOnboardingEmployeeId(
      companyId,
      userId,
    );

    return this.update(
      companyId,
      employeeId,
      updateEmployeeDto,
      actor,
      context,
    );
  }

  /**
   * Resolves the caller's own employee record and ensures it is still in
   * onboarding. Self-onboarding endpoints must use this instead of trusting
   * an employee id from the URL.
   */
  private async resolveMyOnboardingEmployeeId(
    companyId: number,
    userId: number,
  ): Promise<number> {
    const membership = await this.findMembershipByUserId(companyId, userId);
    if (!membership) {
      throw new NotFoundException('Active company membership not found');
    }
    const employee = await this.employeeRepository.findOne({
      where: { company_user_id: membership.id, company_id: companyId },
      select: ['id', 'employment_status'],
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    if (employee.employment_status !== EmploymentStatusEnum.ONBOARDING) {
      throw new ForbiddenException(
        'Self-registration details can only be changed during onboarding',
      );
    }
    return employee.id;
  }

  async addMyDocument(
    companyId: number,
    userId: number,
    dto: AddEmployeeDocumentDto,
    actor: AuthenticatedUser,
    context: AuditRequestContext = EMPTY_AUDIT_CONTEXT,
  ) {
    const employeeId = await this.resolveMyOnboardingEmployeeId(
      companyId,
      userId,
    );
    return this.addDocument(companyId, employeeId, dto, actor, context);
  }

  async addMyContact(
    companyId: number,
    userId: number,
    dto: CreateEmployeeContactDto,
    actor: AuthenticatedUser,
  ) {
    const employeeId = await this.resolveMyOnboardingEmployeeId(
      companyId,
      userId,
    );
    return this.addContact(companyId, employeeId, dto, actor);
  }

  async addMyAddress(
    companyId: number,
    userId: number,
    dto: CreateEmployeeAddressDto,
    actor: AuthenticatedUser,
  ) {
    const employeeId = await this.resolveMyOnboardingEmployeeId(
      companyId,
      userId,
    );
    return this.addAddress(companyId, employeeId, dto, actor);
  }

  async addMyRelative(
    companyId: number,
    userId: number,
    dto: CreateEmployeeRelativeDto,
    actor: AuthenticatedUser,
  ) {
    const employeeId = await this.resolveMyOnboardingEmployeeId(
      companyId,
      userId,
    );
    return this.addRelative(companyId, employeeId, dto, actor);
  }

  async addMyIdentification(
    companyId: number,
    userId: number,
    dto: CreateEmployeeIdentificationDto,
    actor: AuthenticatedUser,
  ) {
    const employeeId = await this.resolveMyOnboardingEmployeeId(
      companyId,
      userId,
    );
    return this.addIdentification(companyId, employeeId, dto, actor);
  }

  async addMyBankAccount(
    companyId: number,
    userId: number,
    dto: CreateEmployeeBankAccountDto,
    actor: AuthenticatedUser,
  ) {
    const employeeId = await this.resolveMyOnboardingEmployeeId(
      companyId,
      userId,
    );
    return this.addBankAccount(companyId, employeeId, dto, actor);
  }

  async addMyAcademicQualification(
    companyId: number,
    userId: number,
    dto: CreateEmployeeAcademicQualificationDto,
    actor: AuthenticatedUser,
  ) {
    const employeeId = await this.resolveMyOnboardingEmployeeId(
      companyId,
      userId,
    );
    return this.addAcademicQualification(companyId, employeeId, dto, actor);
  }

  async addMyProfessionalQualification(
    companyId: number,
    userId: number,
    dto: CreateEmployeeProfessionalQualificationDto,
    actor: AuthenticatedUser,
  ) {
    const employeeId = await this.resolveMyOnboardingEmployeeId(
      companyId,
      userId,
    );
    return this.addProfessionalQualification(companyId, employeeId, dto, actor);
  }

  async addMyExperienceDetail(
    companyId: number,
    userId: number,
    dto: CreateEmployeeExperienceDto,
    actor: AuthenticatedUser,
  ) {
    const employeeId = await this.resolveMyOnboardingEmployeeId(
      companyId,
      userId,
    );
    return this.addExperienceDetail(companyId, employeeId, dto, actor);
  }

  async updateMyProfilePhoto(
    companyId: number,
    userId: number,
    profilePhotoUrl: string | null,
  ) {
    const membership = await this.findMembershipByUserId(companyId, userId);

    if (!membership) {
      throw new NotFoundException('Active company membership not found');
    }

    const employee = await this.employeeRepository.findOne({
      where: { company_user_id: membership.id },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    employee.profile_photo_url = profilePhotoUrl;
    employee.profile_image_source = employee.default_avatar_id
      ? ProfileImageSourceEnum.DEFAULT_AVATAR
      : profilePhotoUrl
        ? ProfileImageSourceEnum.UPLOADED
        : null;
    await this.employeeRepository.save(employee);

    return this.findMyProfile(companyId, userId);
  }

  async listMyAvailableDefaultAvatars(companyId: number, userId: number) {
    const membership = await this.findMembershipByUserId(companyId, userId);

    if (!membership?.employee) {
      throw new NotFoundException('Employee not found');
    }

    return this.defaultAvatarsService.listAvailableForGender(
      companyId,
      membership.employee.gender,
    );
  }

  async selectMyDefaultAvatar(
    companyId: number,
    userId: number,
    defaultAvatarId: number | null,
  ) {
    const membership = await this.findMembershipByUserId(companyId, userId);

    if (!membership) {
      throw new NotFoundException('Active company membership not found');
    }

    const employee = await this.employeeRepository.findOne({
      where: { company_user_id: membership.id },
      relations: {
        default_avatar: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    if (defaultAvatarId === null) {
      employee.default_avatar_id = null;
      employee.default_avatar = null;
      employee.profile_image_source = employee.profile_photo_url
        ? ProfileImageSourceEnum.UPLOADED
        : null;
    } else {
      const selectedAvatar =
        await this.defaultAvatarsService.assertAvatarAvailableForEmployee(
          companyId,
          defaultAvatarId,
          employee.gender,
        );
      employee.default_avatar_id = selectedAvatar.id;
      employee.default_avatar = selectedAvatar;
      employee.profile_image_source = ProfileImageSourceEnum.DEFAULT_AVATAR;
    }

    await this.employeeRepository.save(employee);

    return this.findMyProfile(companyId, userId);
  }

  async findAll(
    companyId: number,
    query: EmployeeQueryDto,
    actor: AuthenticatedUser,
  ) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      search,
      employment_status,
      branch_id,
      department_id,
      primary_position_id,
      position_id,
    } = query;

    if (branch_id && this.hrAccessService.hasBranchScope(actor)) {
      await this.hrAccessService.assertCanAccessBranch(actor, branch_id);
    }
    if (department_id && this.hrAccessService.hasDepartmentScope(actor)) {
      await this.hrAccessService.assertCanAccessDepartment(
        actor,
        department_id,
      );
    }

    const qb = this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoin('employee.company_user', 'membership')
      .leftJoin('membership.user', 'user')
      .leftJoin('employee.primary_branch', 'branch')
      .leftJoin('employee.primary_department', 'department')
      .leftJoin('employee.primary_position', 'position')
      .leftJoin('employee.manager', 'manager')
      .select('employee.id', 'id')
      .addSelect('employee.employee_no', 'employeeNo')
      .addSelect('employee.first_name', 'firstName')
      .addSelect('employee.middle_name', 'middleName')
      .addSelect('employee.last_name', 'lastName')
      .addSelect('employee.gender', 'gender')
      .addSelect('employee.profile_photo_url', 'uploadedProfilePhotoUrl')
      .addSelect('employee.profile_image_source', 'storedProfileImageSource')
      .addSelect('employee.default_avatar_id', 'defaultAvatarId')
      .addSelect('user.id', 'userId')
      .addSelect('user.email', 'email')
      .addSelect('user.phone', 'phone')
      .addSelect('branch.name', 'branchName')
      .addSelect('department.name', 'departmentName')
      .addSelect('position.name', 'positionName')
      .addSelect('manager.first_name', 'managerFirstName')
      .addSelect('manager.middle_name', 'managerMiddleName')
      .addSelect('manager.last_name', 'managerLastName')
      .addSelect('employee.employment_status', 'employmentStatus')
      .addSelect('employee.employment_type', 'employmentType')
      .addSelect('employee.hire_date', 'hireDate')
      .where('employee.company_id = :companyId', { companyId });

    if (employment_status) {
      qb.andWhere('employee.employment_status = :employmentStatus', {
        employmentStatus: employment_status,
      });
    }

    if (typeof branch_id === 'number') {
      qb.andWhere(
        `(
          employee.primary_branch_id = :branchId
          OR EXISTS (
            SELECT 1
            FROM employee_departments department_assignments
            INNER JOIN departments department
              ON department.id = department_assignments.department_id
            WHERE department_assignments.employee_id = employee.id
              AND department.branch_id = :branchId
          )
        )`,
        { branchId: branch_id },
      );
    }

    if (typeof department_id === 'number') {
      qb.andWhere(
        `EXISTS (
          SELECT 1
          FROM employee_departments department_assignments
          WHERE department_assignments.employee_id = employee.id
            AND department_assignments.department_id = :departmentId
        )`,
        { departmentId: department_id },
      );
    }

    const effectivePrimaryPositionId =
      typeof primary_position_id === 'number'
        ? primary_position_id
        : typeof position_id === 'number'
          ? position_id
          : null;

    if (typeof effectivePrimaryPositionId === 'number') {
      qb.andWhere('employee.primary_position_id = :positionId', {
        positionId: effectivePrimaryPositionId,
      });
    }

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      qb.andWhere(
        `(
          employee.employee_no LIKE :term
          OR employee.first_name LIKE :term
          OR employee.middle_name LIKE :term
          OR employee.last_name LIKE :term
          OR employee.preferred_name LIKE :term
          OR user.email LIKE :term
          OR user.phone LIKE :term
          OR user.user_no LIKE :term
          OR EXISTS (
            SELECT 1
            FROM employee_contacts contact
            WHERE contact.employee_id = employee.id
              AND (
                contact.email LIKE :term
                OR contact.phone_number LIKE :term
              )
          )
        )`,
        { term },
      );
    }

    const accessibleEmployeeIds =
      await this.hrAccessService.getAccessibleEmployeeIds(actor);

    if (accessibleEmployeeIds?.length === 0) {
      return {
        data: [],
        meta: buildPaginationMeta(0, 0, limit, page),
      };
    }

    if (accessibleEmployeeIds) {
      qb.andWhere('employee.id IN (:...employeeIds)', {
        employeeIds: accessibleEmployeeIds,
      });
    }

    const allowedSortFields = [
      'employee_no',
      'first_name',
      'last_name',
      'employment_status',
      'employment_type',
      'hire_date',
      'created_at',
      'updated_at',
    ];
    const safeSortBy = allowedSortFields.includes(sortBy)
      ? sortBy
      : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const skip = (page - 1) * limit;

    const total = await qb.clone().getCount();
    const rows = await qb
      .orderBy(`employee.${safeSortBy}`, direction)
      .addOrderBy('employee.id', 'DESC')
      .offset(skip)
      .limit(limit)
      .getRawMany<EmployeeListRow>();

    const resolvedRows = await Promise.all(
      rows.map(async (row) => {
        const resolvedAvatar =
          await this.defaultAvatarsService.resolveEmployeeProfileAvatar(
            companyId,
            {
              id: typeof row.id === 'string' ? Number(row.id) : row.id,
              gender: row.gender ?? null,
              profile_photo_url: row.uploadedProfilePhotoUrl ?? null,
              profile_image_source: row.storedProfileImageSource ?? null,
              default_avatar_id:
                typeof row.defaultAvatarId === 'string'
                  ? Number(row.defaultAvatarId)
                  : (row.defaultAvatarId ?? null),
            },
          );

        return {
          ...row,
          profilePhotoUrl: resolvedAvatar.profile_photo_url,
          uploadedProfilePhotoUrl: resolvedAvatar.uploaded_profile_photo_url,
          profilePhotoSource: resolvedAvatar.profile_photo_source,
        };
      }),
    );

    return {
      data: resolvedRows.map((row) => EmployeeListResponseDto.fromRow(row)),
      meta: buildPaginationMeta(total, resolvedRows.length, limit, page),
    };
  }

  async findOne(
    companyId: number,
    employeeId: number,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);
    return this.mapEmployee(employee, true);
  }

  async update(
    companyId: number,
    employeeId: number,
    updateEmployeeDto: UpdateEmployeeDto,
    actor: AuthenticatedUser,
    context: AuditRequestContext = EMPTY_AUDIT_CONTEXT,
  ) {
    const existingEmployee = await this.findEmployeeByIdOrFail(
      companyId,
      employeeId,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, existingEmployee);
    const oldValues = this.buildEmployeeAuditSnapshot(existingEmployee);

    const updatedEmployeeId = await this.dataSource.transaction(
      async (manager) => {
        const employee = await this.getEmployeeRepository(manager).findOne({
          where: { id: employeeId },
          relations: {
            primary_branch: true,
            primary_department: {
              branch: true,
              parent: true,
            },
            primary_position: true,
            manager: {
              company_user: true,
            },
            department_assignments: {
              department: {
                branch: true,
                parent: true,
              },
            },
            position_assignments: {
              position: true,
            },
            contacts: true,
            addresses: true,
            relatives: true,
            identifications: true,
            bank_accounts: true,
            academic_qualifications: true,
            professional_qualifications: true,
            experience_details: true,
          },
        });

        if (!employee) {
          throw new NotFoundException('Employee not found');
        }

        const wasActive =
          employee.employment_status === EmploymentStatusEnum.ACTIVE;
        const savedEmployee = await this.persistEmployee(
          companyId,
          employee,
          updateEmployeeDto,
          actor,
          manager,
        );

        if (
          !wasActive &&
          savedEmployee.employment_status === EmploymentStatusEnum.ACTIVE
        ) {
          await this.initializeCurrentYearLeaveBalances(
            companyId,
            savedEmployee,
            manager,
          );
        }

        await this.securityEventsService.log(
          {
            eventType: SecurityEventType.EMPLOYEE_UPDATED,
            outcome: SecurityEventOutcome.SUCCESS,
            actor,
            companyId,
            targetCompanyUserId: savedEmployee.company_user_id,
            resourceType: 'employee',
            resourceId: savedEmployee.id,
            oldValues,
            newValues: this.buildEmployeeAuditSnapshot(savedEmployee),
            context,
          },
          manager,
        );

        return savedEmployee.id;
      },
    );

    return this.findOne(companyId, updatedEmployeeId, actor);
  }

  async changeStatus(
    companyId: number,
    employeeId: number,
    changeEmployeeStatusDto: ChangeEmployeeStatusDto,
    actor: AuthenticatedUser,
    context: AuditRequestContext = EMPTY_AUDIT_CONTEXT,
  ) {
    const existingEmployee = await this.findEmployeeByIdOrFail(
      companyId,
      employeeId,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, existingEmployee);
    this.employeeLifecycleService.assertTransition(
      existingEmployee.employment_status,
      changeEmployeeStatusDto.employment_status,
      actor,
    );

    if (
      changeEmployeeStatusDto.employment_status === EmploymentStatusEnum.ACTIVE
    ) {
      await this.assertAttendanceReady(companyId, employeeId);
    }

    const oldValues = {
      employment_status: existingEmployee.employment_status,
      exit_date: existingEmployee.exit_date,
      exit_reason: existingEmployee.exit_reason,
      notes: existingEmployee.notes,
      status_changed_at: existingEmployee.status_changed_at,
      status_changed_by_company_user_id:
        existingEmployee.status_changed_by_company_user_id,
    };

    const updatedEmployeeId = await this.dataSource.transaction(
      async (manager) => {
        const employee = await this.getEmployeeRepository(manager).findOne({
          where: { id: employeeId, company_id: companyId },
        });

        if (!employee) {
          throw new NotFoundException('Employee not found');
        }

        const wasActive =
          employee.employment_status === EmploymentStatusEnum.ACTIVE;
        employee.employment_status = changeEmployeeStatusDto.employment_status;
        employee.notes =
          changeEmployeeStatusDto.notes !== undefined
            ? this.normalizeOptionalString(changeEmployeeStatusDto.notes)
            : employee.notes;
        employee.status_changed_at = new Date();
        employee.status_changed_by_company_user_id =
          actor.companyMembershipId ?? null;

        if (
          [
            EmploymentStatusEnum.RESIGNED,
            EmploymentStatusEnum.TERMINATED,
            EmploymentStatusEnum.RETIRED,
            EmploymentStatusEnum.EXITED,
          ].includes(employee.employment_status)
        ) {
          employee.exit_date =
            changeEmployeeStatusDto.exit_date ??
            changeEmployeeStatusDto.effective_date;
          employee.exit_reason = this.normalizeOptionalString(
            changeEmployeeStatusDto.exit_reason,
          );
        } else {
          employee.exit_date = null;
          employee.exit_reason = null;
        }

        const savedEmployee =
          await this.getEmployeeRepository(manager).save(employee);

        if (
          !wasActive &&
          savedEmployee.employment_status === EmploymentStatusEnum.ACTIVE
        ) {
          await this.initializeCurrentYearLeaveBalances(
            companyId,
            savedEmployee,
            manager,
          );
        }

        await this.securityEventsService.log(
          {
            eventType: SecurityEventType.EMPLOYEE_STATUS_CHANGED,
            outcome: SecurityEventOutcome.SUCCESS,
            actor,
            companyId,
            targetCompanyUserId: savedEmployee.company_user_id,
            resourceType: 'employee',
            resourceId: savedEmployee.id,
            oldValues,
            newValues: {
              employment_status: savedEmployee.employment_status,
              exit_date: savedEmployee.exit_date,
              exit_reason: savedEmployee.exit_reason,
              notes: savedEmployee.notes,
              status_changed_at: savedEmployee.status_changed_at,
              status_changed_by_company_user_id:
                savedEmployee.status_changed_by_company_user_id,
              effective_date: changeEmployeeStatusDto.effective_date,
            },
            context,
          },
          manager,
        );

        return savedEmployee.id;
      },
    );

    return this.findOne(companyId, updatedEmployeeId, actor);
  }

  private async assertAttendanceReady(
    companyId: number,
    employeeId: number,
  ): Promise<void> {
    const readiness = await this.attendanceReadinessService.checkOne(
      companyId,
      employeeId,
    );

    if (!readiness) return;

    // Employee activation only requires a usable attendance schedule. Device,
    // credential, and biometric readiness remain visible in launch-readiness
    // reports, but they must not prevent HR from activating an employee who
    // has a direct shift or timetable assignment.
    if (!readiness.checks.hasShift && !readiness.checks.hasTimetable) {
      throw new UnprocessableEntityException({
        message:
          'Employee cannot be activated: attendance setup is incomplete.',
        issues: ['No active shift or timetable assignment'],
        readinessScore: readiness.readinessScore,
        hint: 'Assign an active shift or timetable before activating this employee.',
      });
    }
  }

  async addDocument(
    companyId: number,
    employeeId: number,
    addEmployeeDocumentDto: AddEmployeeDocumentDto,
    actor: AuthenticatedUser,
    context: AuditRequestContext = EMPTY_AUDIT_CONTEXT,
  ) {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const retentionUntil = addEmployeeDocumentDto.retention_until
      ? new Date(addEmployeeDocumentDto.retention_until)
      : null;
    if (retentionUntil && Number.isNaN(retentionUntil.getTime())) {
      throw new BadRequestException('retention_until must be a valid ISO date');
    }
    if (retentionUntil && retentionUntil <= new Date()) {
      throw new BadRequestException(
        'retention_until must be a future timestamp',
      );
    }

    const storedFile = await this.filesService.savePrivateBase64File(
      addEmployeeDocumentDto.file,
      {
        directorySegments: ['documents', 'employees', `company-${companyId}`],
        fileNamePrefix: `employee-${employeeId}`,
        allowedMimeTypes: [...HR_PRIVATE_DOCUMENT_MIME_TYPES],
        maxFileSizeBytes: HR_PRIVATE_DOCUMENT_MAX_BYTES,
        validateFileSignature: true,
      },
    );

    const documentRepository = this.getEmployeeDocumentRepository();
    const document = await documentRepository.save(
      documentRepository.create({
        employee_id: employee.id,
        type: this.normalizeOptionalString(addEmployeeDocumentDto.type),
        title: this.normalizeOptionalString(addEmployeeDocumentDto.title),
        file_url: storedFile.publicPath,
        original_file_name: storedFile.originalFileName,
        mime_type: storedFile.mimeType,
        file_size: String(storedFile.fileSize),
        classification:
          addEmployeeDocumentDto.classification?.trim().toUpperCase() ??
          'PRIVATE',
        notes: this.normalizeOptionalString(addEmployeeDocumentDto.notes),
        metadata: this.normalizeDocumentMetadata(
          addEmployeeDocumentDto.metadata,
        ),
        retention_until: retentionUntil,
        uploaded_by_company_user_id: actor.companyMembershipId ?? null,
      }),
    );

    const savedDocument = await documentRepository.findOneOrFail({
      where: { id: document.id },
      relations: {
        uploaded_by: {
          user: true,
        },
      },
    });

    await this.securityEventsService.logBestEffort({
      eventType: SecurityEventType.EMPLOYEE_UPDATED,
      outcome: SecurityEventOutcome.SUCCESS,
      actor,
      companyId,
      targetUserId: actor.id,
      resourceType: 'employee_document',
      resourceId: savedDocument.id,
      context,
      metadata: {
        action: 'employee_document_uploaded',
        employee_id: employee.id,
        classification: savedDocument.classification,
      },
    });

    return this.mapDocument(savedDocument);
  }

  async downloadDocument(
    companyId: number,
    employeeId: number,
    documentId: number,
    actor: AuthenticatedUser,
    context: AuditRequestContext = EMPTY_AUDIT_CONTEXT,
  ) {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const document = await this.employeeDocumentRepository.findOne({
      where: {
        id: documentId,
        employee_id: employee.id,
      },
    });

    if (!document) {
      throw new NotFoundException('Employee document not found');
    }

    if (this.isArchivedDocument(document)) {
      throw new NotFoundException('Employee document has been archived');
    }

    if (document.retention_until && document.retention_until <= new Date()) {
      throw new NotFoundException(
        'Employee document is no longer available for download',
      );
    }

    const buffer = await this.filesService.readManagedFile(document.file_url);

    if (!buffer) {
      throw new NotFoundException(
        'Employee document file was not found in storage',
      );
    }

    document.download_count = (document.download_count ?? 0) + 1;
    document.last_downloaded_at = new Date();
    document.last_downloaded_by_company_user_id =
      actor.companyMembershipId ?? null;
    await this.employeeDocumentRepository.save(document);

    await this.securityEventsService.logBestEffort({
      eventType: SecurityEventType.EMPLOYEE_DOCUMENT_DOWNLOADED,
      outcome: SecurityEventOutcome.SUCCESS,
      actor,
      companyId,
      targetUserId: actor.id,
      resourceType: 'employee_document',
      resourceId: document.id,
      context,
      metadata: {
        employee_id: employee.id,
        classification: document.classification,
        download_count: document.download_count,
      },
    });

    return {
      buffer,
      fileName:
        document.original_file_name ??
        document.title ??
        `employee-document-${document.id}`,
      mimeType: document.mime_type ?? 'application/octet-stream',
    };
  }

  async removeDocument(
    companyId: number,
    employeeId: number,
    documentId: number,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const document = await this.employeeDocumentRepository.findOne({
      where: {
        id: documentId,
        employee_id: employee.id,
      },
    });

    if (!document) {
      throw new NotFoundException('Employee document not found');
    }

    if (this.isArchivedDocument(document)) {
      return {
        message:
          'Employee document retained in historical records. Hard delete is disabled.',
      };
    }

    document.notes = this.buildArchiveAuditNote(
      ARCHIVED_DOCUMENT_NOTE_PREFIX,
      actor,
      document.notes,
    );
    await this.employeeDocumentRepository.save(document);

    return { message: 'Employee document archived successfully' };
  }

  // ──────────────────────────────────────────────
  //  CONTACT MANAGEMENT
  // ──────────────────────────────────────────────

  async addContact(
    companyId: number,
    employeeId: number,
    dto: CreateEmployeeContactDto,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const repository = this.getEmployeeContactRepository();
    const contact = await repository.save(
      repository.create({
        employee_id: employee.id,
        contact_type: dto.contact_type,
        phone_number: this.normalizeOptionalString(dto.phone_number),
        email: this.normalizeOptionalString(dto.email)?.toLowerCase() ?? null,
        is_primary: dto.is_primary ?? false,
        is_verified: dto.is_verified ?? false,
        notes: this.normalizeOptionalString(dto.notes),
      }),
    );

    return this.mapContact(contact);
  }

  async updateContact(
    companyId: number,
    employeeId: number,
    contactId: number,
    dto: UpdateEmployeeContactDto,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const repository = this.getEmployeeContactRepository();
    const contact = await repository.findOne({
      where: { id: contactId, employee_id: employee.id },
    });

    if (!contact) {
      throw new NotFoundException('Employee contact not found');
    }

    if (this.isArchivedContact(contact)) {
      throw new NotFoundException('Employee contact has been archived');
    }

    if (dto.contact_type !== undefined) contact.contact_type = dto.contact_type;
    if (dto.phone_number !== undefined)
      contact.phone_number = this.normalizeOptionalString(dto.phone_number);
    if (dto.email !== undefined)
      contact.email =
        this.normalizeOptionalString(dto.email)?.toLowerCase() ?? null;
    if (dto.is_primary !== undefined) contact.is_primary = dto.is_primary;
    if (dto.is_verified !== undefined) contact.is_verified = dto.is_verified;
    if (dto.notes !== undefined)
      contact.notes = this.normalizeOptionalString(dto.notes);

    const saved = await repository.save(contact);
    return this.mapContact(saved);
  }

  async removeContact(
    companyId: number,
    employeeId: number,
    contactId: number,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const repository = this.getEmployeeContactRepository();
    const contact = await repository.findOne({
      where: { id: contactId, employee_id: employee.id },
    });

    if (!contact) {
      throw new NotFoundException('Employee contact not found');
    }

    if (this.isArchivedContact(contact)) {
      return {
        message:
          'Employee contact retained in historical records. Hard delete is disabled.',
      };
    }

    contact.is_primary = false;
    contact.is_verified = false;
    contact.notes = this.buildArchiveAuditNote(
      ARCHIVED_CONTACT_NOTE_PREFIX,
      actor,
      contact.notes,
    );

    await repository.save(contact);
    return { message: 'Employee contact archived successfully' };
  }

  // ──────────────────────────────────────────────
  //  ADDRESS MANAGEMENT
  // ──────────────────────────────────────────────

  async addAddress(
    companyId: number,
    employeeId: number,
    dto: CreateEmployeeAddressDto,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const repository = this.getEmployeeAddressRepository();
    const address = await repository.save(
      repository.create({
        employee_id: employee.id,
        address_line_1: this.normalizeOptionalString(dto.address_line_1),
        address_line_2: this.normalizeOptionalString(dto.address_line_2),
        city: this.normalizeOptionalString(dto.city),
        state: this.normalizeOptionalString(dto.state),
        country: this.normalizeOptionalString(dto.country),
        postal_code: this.normalizeOptionalString(dto.postal_code),
        address_type: dto.address_type,
        is_primary: dto.is_primary ?? false,
      }),
    );

    return this.mapAddress(address);
  }

  async updateAddress(
    companyId: number,
    employeeId: number,
    addressId: number,
    dto: UpdateEmployeeAddressDto,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const repository = this.getEmployeeAddressRepository();
    const address = await repository.findOne({
      where: { id: addressId, employee_id: employee.id },
    });

    if (!address) {
      throw new NotFoundException('Employee address not found');
    }

    if (this.isArchivedAddress(address)) {
      throw new NotFoundException('Employee address has been archived');
    }

    if (dto.address_line_1 !== undefined)
      address.address_line_1 = this.normalizeOptionalString(dto.address_line_1);
    if (dto.address_line_2 !== undefined)
      address.address_line_2 = this.normalizeOptionalString(dto.address_line_2);
    if (dto.city !== undefined)
      address.city = this.normalizeOptionalString(dto.city);
    if (dto.state !== undefined)
      address.state = this.normalizeOptionalString(dto.state);
    if (dto.country !== undefined)
      address.country = this.normalizeOptionalString(dto.country);
    if (dto.postal_code !== undefined)
      address.postal_code = this.normalizeOptionalString(dto.postal_code);
    if (dto.address_type !== undefined) address.address_type = dto.address_type;
    if (dto.is_primary !== undefined) address.is_primary = dto.is_primary;

    const saved = await repository.save(address);
    return this.mapAddress(saved);
  }

  async removeAddress(
    companyId: number,
    employeeId: number,
    addressId: number,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const repository = this.getEmployeeAddressRepository();
    const address = await repository.findOne({
      where: { id: addressId, employee_id: employee.id },
    });

    if (!address) {
      throw new NotFoundException('Employee address not found');
    }

    if (this.isArchivedAddress(address)) {
      return {
        message:
          'Employee address retained in historical records. Hard delete is disabled.',
      };
    }

    address.address_line_1 = this.buildArchivedFieldValue(
      ARCHIVED_ADDRESS_PREFIX,
      address.address_line_1,
      255,
    );
    address.is_primary = false;

    await repository.save(address);
    return { message: 'Employee address archived successfully' };
  }

  // ──────────────────────────────────────────────
  //  RELATIVE MANAGEMENT
  // ──────────────────────────────────────────────

  async addRelative(
    companyId: number,
    employeeId: number,
    dto: CreateEmployeeRelativeDto,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const repository = this.getEmployeeRelativeRepository();
    const relative = await repository.save(
      repository.create({
        employee_id: employee.id,
        full_name: dto.full_name.trim(),
        relationship: dto.relationship.trim(),
        phone: this.normalizeOptionalString(dto.phone),
        email: this.normalizeOptionalString(dto.email)?.toLowerCase() ?? null,
        address: this.normalizeOptionalString(dto.address),
        occupation: this.normalizeOptionalString(dto.occupation),
        is_emergency_contact: dto.is_emergency_contact ?? false,
        is_primary: dto.is_primary ?? false,
      }),
    );

    return this.mapRelative(relative);
  }

  async updateRelative(
    companyId: number,
    employeeId: number,
    relativeId: number,
    dto: UpdateEmployeeRelativeDto,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const repository = this.getEmployeeRelativeRepository();
    const relative = await repository.findOne({
      where: { id: relativeId, employee_id: employee.id },
    });

    if (!relative) {
      throw new NotFoundException('Employee relative not found');
    }

    if (this.isArchivedRelative(relative)) {
      throw new NotFoundException('Employee relative has been archived');
    }

    if (dto.full_name !== undefined) relative.full_name = dto.full_name.trim();
    if (dto.relationship !== undefined)
      relative.relationship = dto.relationship.trim();
    if (dto.phone !== undefined)
      relative.phone = this.normalizeOptionalString(dto.phone);
    if (dto.email !== undefined)
      relative.email =
        this.normalizeOptionalString(dto.email)?.toLowerCase() ?? null;
    if (dto.address !== undefined)
      relative.address = this.normalizeOptionalString(dto.address);
    if (dto.occupation !== undefined)
      relative.occupation = this.normalizeOptionalString(dto.occupation);
    if (dto.is_emergency_contact !== undefined)
      relative.is_emergency_contact = dto.is_emergency_contact;
    if (dto.is_primary !== undefined) relative.is_primary = dto.is_primary;

    const saved = await repository.save(relative);
    return this.mapRelative(saved);
  }

  async removeRelative(
    companyId: number,
    employeeId: number,
    relativeId: number,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const repository = this.getEmployeeRelativeRepository();
    const relative = await repository.findOne({
      where: { id: relativeId, employee_id: employee.id },
    });

    if (!relative) {
      throw new NotFoundException('Employee relative not found');
    }

    if (this.isArchivedRelative(relative)) {
      return {
        message:
          'Employee relative retained in historical records. Hard delete is disabled.',
      };
    }

    relative.relationship = this.buildArchivedFieldValue(
      ARCHIVED_RELATIVE_PREFIX,
      relative.relationship,
      100,
    );
    relative.is_primary = false;
    relative.is_emergency_contact = false;

    await repository.save(relative);
    return { message: 'Employee relative archived successfully' };
  }

  // ──────────────────────────────────────────────
  //  IDENTIFICATION MANAGEMENT
  // ──────────────────────────────────────────────

  async addIdentification(
    companyId: number,
    employeeId: number,
    dto: CreateEmployeeIdentificationDto,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    await this.assertIdentifierAvailable(
      companyId,
      employee.id,
      dto.identification_type,
      dto.identification_number,
    );

    const repository = this.getEmployeeIdentificationRepository();
    const identification = await repository.save(
      repository.create({
        employee_id: employee.id,
        identification_type: dto.identification_type,
        identification_number: dto.identification_number.trim(),
        issued_country: this.normalizeOptionalString(dto.issued_country),
        issue_date: dto.issue_date ?? null,
        issuing_authority: this.normalizeOptionalString(dto.issuing_authority),
        document_url: this.normalizeOptionalString(dto.document_url),
        expiry_date: dto.expiry_date ?? null,
        is_primary: dto.is_primary ?? false,
        is_verified: false,
        verified_at: null,
        verified_by_company_user_id: null,
      }),
    );

    await this.securityEventsService.log({
      eventType: SecurityEventType.EMPLOYEE_UPDATED,
      outcome: SecurityEventOutcome.SUCCESS,
      actor,
      companyId,
      targetCompanyUserId: employee.company_user_id,
      resourceType: 'employee_identification',
      resourceId: identification.id,
      oldValues: null,
      newValues: {
        type: identification.identification_type,
        number_masked: this.maskAuditNumber(
          identification.identification_number,
        ),
      },
      context: resolveAuditContext(),
    });
    return this.mapIdentification(identification);
  }

  async updateIdentification(
    companyId: number,
    employeeId: number,
    identificationId: number,
    dto: UpdateEmployeeIdentificationDto,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const repository = this.getEmployeeIdentificationRepository();
    const identification = await repository.findOne({
      where: { id: identificationId, employee_id: employee.id },
    });

    if (!identification) {
      throw new NotFoundException('Employee identification not found');
    }

    if (this.isArchivedIdentification(identification)) {
      throw new NotFoundException('Employee identification has been archived');
    }

    const beforeIdentification = {
      type: identification.identification_type,
      number_masked: this.maskAuditNumber(identification.identification_number),
    };
    await this.assertIdentifierAvailable(
      companyId,
      employee.id,
      dto.identification_type ?? identification.identification_type,
      dto.identification_number ?? identification.identification_number,
    );

    if (dto.identification_type !== undefined)
      identification.identification_type = dto.identification_type;
    if (dto.identification_number !== undefined)
      identification.identification_number = dto.identification_number.trim();
    if (dto.issued_country !== undefined)
      identification.issued_country = this.normalizeOptionalString(
        dto.issued_country,
      );
    if (dto.issue_date !== undefined)
      identification.issue_date = dto.issue_date;
    if (dto.issuing_authority !== undefined)
      identification.issuing_authority = this.normalizeOptionalString(
        dto.issuing_authority,
      );
    if (dto.document_url !== undefined)
      identification.document_url = this.normalizeOptionalString(
        dto.document_url,
      );
    if (dto.expiry_date !== undefined)
      identification.expiry_date = dto.expiry_date ?? null;
    if (dto.is_primary !== undefined)
      identification.is_primary = dto.is_primary;

    const saved = await repository.save(identification);
    await this.securityEventsService.log({
      eventType: SecurityEventType.EMPLOYEE_UPDATED,
      outcome: SecurityEventOutcome.SUCCESS,
      actor,
      companyId,
      targetCompanyUserId: employee.company_user_id,
      resourceType: 'employee_identification',
      resourceId: saved.id,
      oldValues: beforeIdentification,
      newValues: {
        type: saved.identification_type,
        number_masked: this.maskAuditNumber(saved.identification_number),
      },
      context: resolveAuditContext(),
    });
    return this.mapIdentification(saved);
  }

  async removeIdentification(
    companyId: number,
    employeeId: number,
    identificationId: number,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const repository = this.getEmployeeIdentificationRepository();
    const identification = await repository.findOne({
      where: { id: identificationId, employee_id: employee.id },
    });

    if (!identification) {
      throw new NotFoundException('Employee identification not found');
    }

    if (this.isArchivedIdentification(identification)) {
      return {
        message:
          'Employee identification retained in historical records. Hard delete is disabled.',
      };
    }

    identification.identification_number = this.buildArchivedUniqueFieldValue(
      ARCHIVED_IDENTIFICATION_PREFIX,
      String(identification.id),
      identification.identification_number,
      120,
    );
    identification.is_primary = false;
    identification.is_verified = false;
    identification.verified_at = null;
    identification.verified_by_company_user_id = null;

    await repository.save(identification);
    return { message: 'Employee identification archived successfully' };
  }

  // ──────────────────────────────────────────────
  //  BANK ACCOUNT MANAGEMENT
  // ──────────────────────────────────────────────

  async addBankAccount(
    companyId: number,
    employeeId: number,
    dto: CreateEmployeeBankAccountDto,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const employeeName = this.buildEmployeeDisplayName(employee);
    const repository = this.getEmployeeBankAccountRepository();
    const bankAccount = await repository.save(
      repository.create({
        employee_id: employee.id,
        bank_name: this.normalizeOptionalString(dto.bank_name),
        account_name:
          this.normalizeOptionalString(dto.account_name) ?? employeeName,
        account_number: dto.account_number.trim(),
        branch_name: this.normalizeOptionalString(dto.branch_name),
        bank_code:
          this.normalizeOptionalString(dto.bank_code)?.toUpperCase() ?? null,
        bank_branch_code: this.normalizeOptionalString(dto.bank_branch_code),
        account_currency:
          this.normalizeOptionalString(dto.account_currency)?.toUpperCase() ??
          'TZS',
        account_type: this.normalizeOptionalString(dto.account_type),
        swift_code: this.normalizeOptionalString(dto.swift_code),
        mobile_money_provider: this.normalizeOptionalString(
          dto.mobile_money_provider,
        ),
        verification_status: 'PENDING',
        created_by_company_user_id: actor.companyMembershipId ?? null,
        effective_from: this.normalizeOptionalString(dto.effective_from),
        effective_to: this.normalizeOptionalString(dto.effective_to),
        is_primary: dto.is_primary ?? false,
      }),
    );

    await this.securityEventsService.log({
      eventType: SecurityEventType.EMPLOYEE_UPDATED,
      outcome: SecurityEventOutcome.SUCCESS,
      actor,
      companyId,
      targetCompanyUserId: employee.company_user_id,
      resourceType: 'employee_bank_account',
      resourceId: bankAccount.id,
      oldValues: null,
      newValues: this.bankAuditSnapshot(bankAccount),
      context: resolveAuditContext(),
    });

    return this.mapBankAccount(bankAccount);
  }

  async updateBankAccount(
    companyId: number,
    employeeId: number,
    bankAccountId: number,
    dto: UpdateEmployeeBankAccountDto,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const repository = this.getEmployeeBankAccountRepository();
    const bankAccount = await repository.findOne({
      where: { id: bankAccountId, employee_id: employee.id },
    });

    if (!bankAccount) {
      throw new NotFoundException('Employee bank account not found');
    }

    if (this.isArchivedBankAccount(bankAccount)) {
      throw new NotFoundException('Employee bank account has been archived');
    }

    const beforeBankAccount = this.bankAuditSnapshot(bankAccount);

    if (dto.bank_name !== undefined)
      bankAccount.bank_name = this.normalizeOptionalString(dto.bank_name);
    if (dto.account_name !== undefined)
      bankAccount.account_name = this.normalizeOptionalString(dto.account_name);
    if (
      dto.account_number !== undefined &&
      dto.account_number.trim() !== bankAccount.account_number
    ) {
      bankAccount.account_number = dto.account_number.trim();
      bankAccount.verification_status = 'PENDING';
      bankAccount.verified_at = null;
      bankAccount.verified_by_company_user_id = null;
      bankAccount.created_by_company_user_id =
        actor.companyMembershipId ?? null;
    }
    if (dto.branch_name !== undefined)
      bankAccount.branch_name = this.normalizeOptionalString(dto.branch_name);
    if (dto.bank_code !== undefined)
      bankAccount.bank_code =
        this.normalizeOptionalString(dto.bank_code)?.toUpperCase() ?? null;
    if (dto.bank_branch_code !== undefined)
      bankAccount.bank_branch_code = this.normalizeOptionalString(
        dto.bank_branch_code,
      );
    if (dto.account_currency !== undefined)
      bankAccount.account_currency =
        this.normalizeOptionalString(dto.account_currency)?.toUpperCase() ??
        'TZS';
    if (dto.account_type !== undefined)
      bankAccount.account_type = this.normalizeOptionalString(dto.account_type);
    if (dto.swift_code !== undefined)
      bankAccount.swift_code = this.normalizeOptionalString(dto.swift_code);
    if (dto.mobile_money_provider !== undefined)
      bankAccount.mobile_money_provider = this.normalizeOptionalString(
        dto.mobile_money_provider,
      );
    if (dto.effective_from !== undefined)
      bankAccount.effective_from = this.normalizeOptionalString(
        dto.effective_from,
      );
    if (dto.effective_to !== undefined)
      bankAccount.effective_to = this.normalizeOptionalString(dto.effective_to);
    if (dto.is_primary !== undefined) bankAccount.is_primary = dto.is_primary;

    const saved = await repository.save(bankAccount);
    await this.securityEventsService.log({
      eventType: SecurityEventType.EMPLOYEE_UPDATED,
      outcome: SecurityEventOutcome.SUCCESS,
      actor,
      companyId,
      targetCompanyUserId: employee.company_user_id,
      resourceType: 'employee_bank_account',
      resourceId: saved.id,
      oldValues: beforeBankAccount,
      newValues: this.bankAuditSnapshot(saved),
      context: resolveAuditContext(),
    });
    return this.mapBankAccount(saved);
  }

  async verifyBankAccount(
    companyId: number,
    employeeId: number,
    bankAccountId: number,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);
    const repository = this.getEmployeeBankAccountRepository();
    const account = await repository.findOne({
      where: { id: bankAccountId, employee_id: employee.id },
    });
    if (!account || this.isArchivedBankAccount(account)) {
      throw new NotFoundException('Employee bank account not found');
    }
    if (account.created_by_company_user_id === actor.companyMembershipId) {
      throw new ForbiddenException(
        'A different user must verify the bank account',
      );
    }
    if (account.verification_status !== 'PENDING') {
      throw new ConflictException('Only pending bank accounts can be verified');
    }
    const beforeBankAccount = this.bankAuditSnapshot(account);
    account.verification_status = 'VERIFIED';
    account.verified_at = new Date();
    account.verified_by_company_user_id = actor.companyMembershipId ?? null;
    const saved = await repository.save(account);
    await this.securityEventsService.log({
      eventType: SecurityEventType.EMPLOYEE_UPDATED,
      outcome: SecurityEventOutcome.SUCCESS,
      actor,
      companyId,
      targetCompanyUserId: employee.company_user_id,
      resourceType: 'employee_bank_account',
      resourceId: saved.id,
      oldValues: beforeBankAccount,
      newValues: this.bankAuditSnapshot(saved),
      context: resolveAuditContext(),
    });
    return this.mapBankAccount(saved);
  }

  async removeBankAccount(
    companyId: number,
    employeeId: number,
    bankAccountId: number,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const repository = this.getEmployeeBankAccountRepository();
    const bankAccount = await repository.findOne({
      where: { id: bankAccountId, employee_id: employee.id },
    });

    if (!bankAccount) {
      throw new NotFoundException('Employee bank account not found');
    }

    if (this.isArchivedBankAccount(bankAccount)) {
      return {
        message:
          'Employee bank account retained in historical records. Hard delete is disabled.',
      };
    }

    bankAccount.verification_status = ARCHIVED_BANK_ACCOUNT_STATUS;
    bankAccount.is_primary = false;
    bankAccount.effective_to =
      bankAccount.effective_to ?? formatDateOnly(new Date());

    await repository.save(bankAccount);
    return { message: 'Employee bank account archived successfully' };
  }

  async listAcademicQualifications(
    companyId: number,
    employeeId: number,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const repository = this.getEmployeeAcademicQualificationRepository();
    const qualifications = await repository.find({
      where: { employee_id: employee.id },
      relations: {
        uploaded_by: {
          user: true,
        },
      },
      order: { id: 'ASC' },
    });

    return qualifications
      .filter(
        (qualification) => !this.isArchivedAcademicQualification(qualification),
      )
      .map((qualification) => this.mapAcademicQualification(qualification));
  }

  async addAcademicQualification(
    companyId: number,
    employeeId: number,
    dto: CreateEmployeeAcademicQualificationDto,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    this.assertDateOrder(
      dto.start_date,
      dto.end_date,
      'Academic qualification end_date cannot be before start_date',
    );

    const repository = this.getEmployeeAcademicQualificationRepository();
    const qualification = await repository.save(
      repository.create({
        employee_id: employee.id,
        country_of_residence: dto.country_of_residence.trim(),
        education_level: dto.education_level.trim(),
        institution_name: dto.institution_name.trim(),
        degree_or_certificate: dto.degree_or_certificate.trim(),
        field_of_study: dto.field_of_study.trim(),
        start_date: dto.start_date,
        end_date: dto.end_date,
        academic_certificate_document_url:
          dto.academic_certificate_document_url?.trim() || null,
        uploaded_by_company_user_id: actor.companyMembershipId ?? null,
      }),
    );

    const saved = await repository.findOneOrFail({
      where: { id: qualification.id },
      relations: {
        uploaded_by: {
          user: true,
        },
      },
    });

    return this.mapAcademicQualification(saved);
  }

  async updateAcademicQualification(
    companyId: number,
    employeeId: number,
    academicQualificationId: number,
    dto: UpdateEmployeeAcademicQualificationDto,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const repository = this.getEmployeeAcademicQualificationRepository();
    const qualification = await repository.findOne({
      where: { id: academicQualificationId, employee_id: employee.id },
      relations: {
        uploaded_by: {
          user: true,
        },
      },
    });

    if (!qualification) {
      throw new NotFoundException('Employee academic qualification not found');
    }

    if (this.isArchivedAcademicQualification(qualification)) {
      throw new NotFoundException(
        'Employee academic qualification has been archived',
      );
    }

    if (dto.country_of_residence !== undefined) {
      qualification.country_of_residence = dto.country_of_residence.trim();
    }
    if (dto.education_level !== undefined) {
      qualification.education_level = dto.education_level.trim();
    }
    if (dto.institution_name !== undefined) {
      qualification.institution_name = dto.institution_name.trim();
    }
    if (dto.degree_or_certificate !== undefined) {
      qualification.degree_or_certificate = dto.degree_or_certificate.trim();
    }
    if (dto.field_of_study !== undefined) {
      qualification.field_of_study = dto.field_of_study.trim();
    }
    if (dto.start_date !== undefined) {
      qualification.start_date = dto.start_date;
    }
    if (dto.end_date !== undefined) {
      qualification.end_date = dto.end_date;
    }
    if (dto.academic_certificate_document_url !== undefined) {
      qualification.academic_certificate_document_url =
        dto.academic_certificate_document_url.trim();
      qualification.uploaded_by_company_user_id =
        actor.companyMembershipId ?? null;
    }

    this.assertDateOrder(
      qualification.start_date,
      qualification.end_date,
      'Academic qualification end_date cannot be before start_date',
    );

    const saved = await repository.save(qualification);
    return this.mapAcademicQualification(saved);
  }

  async removeAcademicQualification(
    companyId: number,
    employeeId: number,
    academicQualificationId: number,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const repository = this.getEmployeeAcademicQualificationRepository();
    const qualification = await repository.findOne({
      where: { id: academicQualificationId, employee_id: employee.id },
    });

    if (!qualification) {
      throw new NotFoundException('Employee academic qualification not found');
    }

    if (this.isArchivedAcademicQualification(qualification)) {
      return {
        message:
          'Employee academic qualification retained in historical records. Hard delete is disabled.',
      };
    }

    qualification.field_of_study = this.buildArchivedFieldValue(
      ARCHIVED_ACADEMIC_QUALIFICATION_PREFIX,
      qualification.field_of_study,
      150,
    );

    await repository.save(qualification);
    return { message: 'Employee academic qualification archived successfully' };
  }

  async listProfessionalQualifications(
    companyId: number,
    employeeId: number,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const repository = this.getEmployeeProfessionalQualificationRepository();
    const qualifications = await repository.find({
      where: { employee_id: employee.id },
      relations: {
        uploaded_by: {
          user: true,
        },
      },
      order: { id: 'ASC' },
    });

    return qualifications
      .filter(
        (qualification) =>
          !this.isArchivedProfessionalQualification(qualification),
      )
      .map((qualification) => this.mapProfessionalQualification(qualification));
  }

  async addProfessionalQualification(
    companyId: number,
    employeeId: number,
    dto: CreateEmployeeProfessionalQualificationDto,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    if (dto.expiry_date) {
      this.assertDateOrder(
        dto.issue_date,
        dto.expiry_date,
        'Professional qualification expiry_date cannot be before issue_date',
      );
    }

    const repository = this.getEmployeeProfessionalQualificationRepository();
    const qualification = await repository.save(
      repository.create({
        employee_id: employee.id,
        country_of_residence: dto.country_of_residence.trim(),
        institution_name: dto.institution_name.trim(),
        programme_name: dto.programme_name.trim(),
        issuing_organization: dto.issuing_organization.trim(),
        issue_date: dto.issue_date,
        expiry_date: dto.expiry_date ?? null,
        professional_certificate_document_url:
          dto.professional_certificate_document_url?.trim() || null,
        uploaded_by_company_user_id: actor.companyMembershipId ?? null,
      }),
    );

    const saved = await repository.findOneOrFail({
      where: { id: qualification.id },
      relations: {
        uploaded_by: {
          user: true,
        },
      },
    });

    return this.mapProfessionalQualification(saved);
  }

  async updateProfessionalQualification(
    companyId: number,
    employeeId: number,
    professionalQualificationId: number,
    dto: UpdateEmployeeProfessionalQualificationDto,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const repository = this.getEmployeeProfessionalQualificationRepository();
    const qualification = await repository.findOne({
      where: { id: professionalQualificationId, employee_id: employee.id },
      relations: {
        uploaded_by: {
          user: true,
        },
      },
    });

    if (!qualification) {
      throw new NotFoundException(
        'Employee professional qualification not found',
      );
    }

    if (this.isArchivedProfessionalQualification(qualification)) {
      throw new NotFoundException(
        'Employee professional qualification has been archived',
      );
    }

    if (dto.country_of_residence !== undefined) {
      qualification.country_of_residence = dto.country_of_residence.trim();
    }
    if (dto.institution_name !== undefined) {
      qualification.institution_name = dto.institution_name.trim();
    }
    if (dto.programme_name !== undefined) {
      qualification.programme_name = dto.programme_name.trim();
    }
    if (dto.issuing_organization !== undefined) {
      qualification.issuing_organization = dto.issuing_organization.trim();
    }
    if (dto.issue_date !== undefined) {
      qualification.issue_date = dto.issue_date;
    }
    if (dto.expiry_date !== undefined) {
      qualification.expiry_date = dto.expiry_date ?? null;
    }
    if (dto.professional_certificate_document_url !== undefined) {
      qualification.professional_certificate_document_url =
        dto.professional_certificate_document_url.trim();
      qualification.uploaded_by_company_user_id =
        actor.companyMembershipId ?? null;
    }

    if (qualification.expiry_date) {
      this.assertDateOrder(
        qualification.issue_date,
        qualification.expiry_date,
        'Professional qualification expiry_date cannot be before issue_date',
      );
    }

    const saved = await repository.save(qualification);
    return this.mapProfessionalQualification(saved);
  }

  async removeProfessionalQualification(
    companyId: number,
    employeeId: number,
    professionalQualificationId: number,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const repository = this.getEmployeeProfessionalQualificationRepository();
    const qualification = await repository.findOne({
      where: { id: professionalQualificationId, employee_id: employee.id },
    });

    if (!qualification) {
      throw new NotFoundException(
        'Employee professional qualification not found',
      );
    }

    if (this.isArchivedProfessionalQualification(qualification)) {
      return {
        message:
          'Employee professional qualification retained in historical records. Hard delete is disabled.',
      };
    }

    qualification.programme_name = this.buildArchivedFieldValue(
      ARCHIVED_PROFESSIONAL_QUALIFICATION_PREFIX,
      qualification.programme_name,
      150,
    );

    await repository.save(qualification);
    return {
      message: 'Employee professional qualification archived successfully',
    };
  }

  async listExperienceDetails(
    companyId: number,
    employeeId: number,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const repository = this.getEmployeeExperienceRepository();
    const experienceDetails = await repository.find({
      where: { employee_id: employee.id },
      order: { start_date: 'DESC', id: 'DESC' },
    });

    return experienceDetails
      .filter(
        (experienceDetail) =>
          !this.isArchivedExperienceDetail(experienceDetail),
      )
      .map((experienceDetail) => this.mapExperienceDetail(experienceDetail));
  }

  async addExperienceDetail(
    companyId: number,
    employeeId: number,
    dto: CreateEmployeeExperienceDto,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const currentlyWorking = dto.currently_working ?? false;
    const endDate = currentlyWorking ? null : dto.end_date;

    if (!currentlyWorking && !endDate) {
      throw new BadRequestException(
        'Experience end_date is required when currently_working is false',
      );
    }

    if (endDate) {
      this.assertDateOrder(
        dto.start_date,
        endDate,
        'Experience end_date cannot be before start_date',
      );
    }

    const repository = this.getEmployeeExperienceRepository();
    const experienceDetail = await repository.save(
      repository.create({
        employee_id: employee.id,
        company_name: dto.company_name.trim(),
        job_title: dto.job_title.trim(),
        responsibilities_description: dto.responsibilities_description.trim(),
        start_date: dto.start_date,
        end_date: endDate,
        currently_working: currentlyWorking,
      }),
    );

    return this.mapExperienceDetail(experienceDetail);
  }

  async updateExperienceDetail(
    companyId: number,
    employeeId: number,
    experienceDetailId: number,
    dto: UpdateEmployeeExperienceDto,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const repository = this.getEmployeeExperienceRepository();
    const experienceDetail = await repository.findOne({
      where: { id: experienceDetailId, employee_id: employee.id },
    });

    if (!experienceDetail) {
      throw new NotFoundException('Employee experience detail not found');
    }

    if (this.isArchivedExperienceDetail(experienceDetail)) {
      throw new NotFoundException(
        'Employee experience detail has been archived',
      );
    }

    if (dto.company_name !== undefined) {
      experienceDetail.company_name = dto.company_name.trim();
    }
    if (dto.job_title !== undefined) {
      experienceDetail.job_title = dto.job_title.trim();
    }
    if (dto.responsibilities_description !== undefined) {
      experienceDetail.responsibilities_description =
        dto.responsibilities_description.trim();
    }
    if (dto.start_date !== undefined) {
      experienceDetail.start_date = dto.start_date;
    }
    if (dto.currently_working !== undefined) {
      experienceDetail.currently_working = dto.currently_working;
    }

    const isCurrentlyWorking = experienceDetail.currently_working;
    if (isCurrentlyWorking) {
      experienceDetail.end_date = null;
    } else if (dto.end_date !== undefined) {
      experienceDetail.end_date = dto.end_date;
    }

    if (!experienceDetail.currently_working && !experienceDetail.end_date) {
      throw new BadRequestException(
        'Experience end_date is required when currently_working is false',
      );
    }

    if (experienceDetail.end_date) {
      this.assertDateOrder(
        experienceDetail.start_date,
        experienceDetail.end_date,
        'Experience end_date cannot be before start_date',
      );
    }

    const saved = await repository.save(experienceDetail);
    return this.mapExperienceDetail(saved);
  }

  async removeExperienceDetail(
    companyId: number,
    employeeId: number,
    experienceDetailId: number,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const repository = this.getEmployeeExperienceRepository();
    const experienceDetail = await repository.findOne({
      where: { id: experienceDetailId, employee_id: employee.id },
    });

    if (!experienceDetail) {
      throw new NotFoundException('Employee experience detail not found');
    }

    if (this.isArchivedExperienceDetail(experienceDetail)) {
      return {
        message:
          'Employee experience detail retained in historical records. Hard delete is disabled.',
      };
    }

    experienceDetail.job_title = this.buildArchivedFieldValue(
      ARCHIVED_EXPERIENCE_PREFIX,
      experienceDetail.job_title,
      150,
    );
    experienceDetail.currently_working = false;
    experienceDetail.end_date =
      experienceDetail.end_date ?? formatDateOnly(new Date());

    await repository.save(experienceDetail);
    return { message: 'Employee experience detail archived successfully' };
  }

  async remove(
    companyId: number,
    employeeId: number,
    actor: AuthenticatedUser,
    context: AuditRequestContext = EMPTY_AUDIT_CONTEXT,
  ): Promise<{ message: string }> {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    if (HISTORICAL_EMPLOYMENT_STATUSES.has(employee.employment_status)) {
      return {
        message:
          'Employee retained in historical records. Hard delete is disabled.',
      };
    }

    await this.changeStatus(
      companyId,
      employeeId,
      {
        employment_status: EmploymentStatusEnum.INACTIVE,
        effective_date: formatDateOnly(new Date()),
      },
      actor,
      context,
    );

    return { message: 'Employee archived successfully' };
  }

  async unlinkCompanyUser(
    companyId: number,
    employeeId: number,
    actor: AuthenticatedUser,
    context: AuditRequestContext = EMPTY_AUDIT_CONTEXT,
    deactivateAccount = false,
  ): Promise<{
    message: string;
    unlinked_company_user_id: number | null;
    account_deactivated: boolean;
  }> {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    if (!HISTORICAL_EMPLOYMENT_STATUSES.has(employee.employment_status)) {
      throw new BadRequestException(
        'Only inactive or historical employees can have their user account unlinked',
      );
    }

    const membership = employee.company_user;
    const companyUserId = employee.company_user_id;
    if (!membership || companyUserId === null) {
      return {
        message: 'Employee does not have a linked user account',
        unlinked_company_user_id: null,
        account_deactivated: false,
      };
    }

    employee.company_user_id = null;
    employee.company_user = null;
    await this.employeeRepository.save(employee);

    let accountDeactivated = membership.status !== 'active';
    if (deactivateAccount && !accountDeactivated) {
      try {
        await this.companiesService.removeUserFromCompany(
          companyId,
          membership.user_id,
          actor,
          context,
        );
        accountDeactivated = true;
      } catch (error) {
        employee.company_user_id = companyUserId;
        employee.company_user = membership;
        await this.employeeRepository.save(employee);
        throw error;
      }
    }

    await this.securityEventsService.logBestEffort({
      eventType: SecurityEventType.EMPLOYEE_UPDATED,
      outcome: SecurityEventOutcome.SUCCESS,
      actor,
      companyId,
      targetUserId: membership.user_id,
      targetCompanyUserId: companyUserId,
      resourceType: 'employee',
      resourceId: employee.id,
      oldValues: { company_user_id: companyUserId },
      newValues: { company_user_id: null },
      context,
      metadata: {
        action: deactivateAccount
          ? 'employee_account_unlinked_and_deactivated'
          : 'employee_account_unlinked',
      },
    });

    return {
      message: deactivateAccount
        ? 'Linked account access removed successfully'
        : 'User account unlinked from employee successfully',
      unlinked_company_user_id: companyUserId,
      account_deactivated: accountDeactivated,
    };
  }
}
