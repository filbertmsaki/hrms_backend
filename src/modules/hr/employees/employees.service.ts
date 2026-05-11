import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { SortDirection } from '../../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { hashPassword } from '../../../common/utils/hash.util';
import { CompaniesService } from '../../companies/companies.service';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/users.service';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { Position } from '../positions/entities/position.entity';
import { HrAccessService } from '../shared/hr-access.service';
import {
  buildPaginationMeta,
  getMembershipPermissions,
  getMembershipRoles,
} from '../shared/hr.utils';
import { AddEmployeeDocumentDto } from './dtos/add-employee-document.dto';
import { ChangeEmployeeStatusDto } from './dtos/change-employee-status.dto';
import { CreateEmployeeAddressDto } from './dtos/create-employee-address.dto';
import { CreateEmployeeBankAccountDto } from './dtos/create-employee-bank-account.dto';
import { CreateEmployeeContactDto } from './dtos/create-employee-contact.dto';
import { CreateEmployeeDto } from './dtos/create-employee.dto';
import { CreateEmployeeIdentificationDto } from './dtos/create-employee-identification.dto';
import { CreateEmployeeRelativeDto } from './dtos/create-employee-relative.dto';
import { EmployeeAddressInputDto } from './dtos/employee-address-input.dto';
import { EmployeeBankAccountInputDto } from './dtos/employee-bank-account-input.dto';
import { EmployeeContactInputDto } from './dtos/employee-contact-input.dto';
import { EmployeeDepartmentInputDto } from './dtos/employee-department-input.dto';
import { EmployeeIdentificationInputDto } from './dtos/employee-identification-input.dto';
import { EmployeeQueryDto } from './dtos/employee-query.dto';
import { EmployeeRelativeInputDto } from './dtos/employee-relative-input.dto';
import { OnboardEmployeeDto } from './dtos/onboard-employee.dto';
import { UpdateEmployeeAddressDto } from './dtos/update-employee-address.dto';
import { UpdateEmployeeBankAccountDto } from './dtos/update-employee-bank-account.dto';
import { UpdateEmployeeContactDto } from './dtos/update-employee-contact.dto';
import { UpdateEmployeeDto } from './dtos/update-employee.dto';
import { UpdateEmployeeIdentificationDto } from './dtos/update-employee-identification.dto';
import { UpdateEmployeeRelativeDto } from './dtos/update-employee-relative.dto';
import { ContactTypeEnum } from './enums/contact-type.enum';
import { EmploymentStatusEnum } from './enums/employment-status.enum';
import { EmploymentTypeEnum } from './enums/employment-type.enum';
import { IdentificationTypeEnum } from './enums/identification-type.enum';
import { EmployeeAddress } from './entities/employee-address.entity';
import { EmployeeBankAccount } from './entities/employee-bank-account.entity';
import { EmployeeContact } from './entities/employee-contact.entity';
import { EmployeeDepartment } from './entities/employee-department.entity';
import { EmployeeDocument } from './entities/employee-document.entity';
import { EmployeeIdentification } from './entities/employee-identification.entity';
import { EmployeeRelative } from './entities/employee-relative.entity';
import { Employee } from './entities/employee.entity';

type EmployeeMutationDto =
  | CreateEmployeeDto
  | UpdateEmployeeDto
  | OnboardEmployeeDto;

type EmployeeProfileCollectionsDto = Pick<
  CreateEmployeeDto,
  'contacts' | 'addresses' | 'relatives' | 'identifications' | 'bank_accounts'
>;

@Injectable()
export class EmployeesService {
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
    private readonly companiesService: CompaniesService,
    private readonly usersService: UsersService,
    private readonly hrAccessService: HrAccessService,
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

  private normalizeOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
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
      category: position.category,
      level: position.level,
      is_manager: position.is_manager,
      description: position.description,
      status: position.status,
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
      roles: getMembershipRoles(membership),
      permissions: getMembershipPermissions(membership),
      user: membership.user
        ? {
            id: membership.user.id,
            user_no: membership.user.user_no,
            first_name: membership.user.first_name,
            last_name: membership.user.last_name,
            phone: membership.user.phone,
            email: membership.user.email,
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
      file_url: document.file_url,
      notes: document.notes,
      uploaded_at: document.uploaded_at,
      uploaded_by_company_user_id: document.uploaded_by_company_user_id,
      uploaded_by: document.uploaded_by?.user
        ? {
            id: document.uploaded_by.user.id,
            user_no: document.uploaded_by.user.user_no,
            first_name: document.uploaded_by.user.first_name,
            last_name: document.uploaded_by.user.last_name,
            email: document.uploaded_by.user.email,
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
      expiry_date: identification.expiry_date,
      is_primary: identification.is_primary,
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
      swift_code: bankAccount.swift_code,
      mobile_money_provider: bankAccount.mobile_money_provider,
      is_primary: bankAccount.is_primary,
      created_at: bankAccount.created_at,
      updated_at: bankAccount.updated_at,
    };
  }

  private mapEmployee(employee: Employee, includeDocuments = false) {
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
      profile_photo_url: employee.profile_photo_url,
      primary_branch_id: employee.primary_branch_id,
      primary_department_id: employee.primary_department_id,
      position_id: employee.position_id,
      employment_status: employee.employment_status,
      employment_type: employee.employment_type,
      hire_date: employee.hire_date,
      probation_end_date: employee.probation_end_date,
      confirmation_date: employee.confirmation_date,
      exit_date: employee.exit_date,
      reports_to: employee.reports_to,
      exit_reason: employee.exit_reason,
      notes: employee.notes,
      metadata: employee.metadata,
      created_at: employee.created_at,
      updated_at: employee.updated_at,
      primary_branch: this.mapBranch(employee.primary_branch),
      primary_department: this.mapDepartment(employee.primary_department),
      position: this.mapPosition(employee.position),
      manager: employee.manager
        ? {
            id: employee.manager.id,
            employee_no: employee.manager.employee_no,
            first_name: employee.manager.first_name,
            last_name: employee.manager.last_name,
            company_user: this.mapMembership(employee.manager.company_user),
          }
        : null,
      departments:
        employee.department_assignments?.map((assignment) => ({
          id: assignment.id,
          department_id: assignment.department_id,
          is_primary: assignment.is_primary,
          department: this.mapDepartment(assignment.department),
        })) ?? [],
      contacts: this.sortPrimaryFirst(employee.contacts).map((contact) =>
        this.mapContact(contact),
      ),
      addresses: this.sortPrimaryFirst(employee.addresses).map((address) =>
        this.mapAddress(address),
      ),
      relatives: this.sortPrimaryFirst(employee.relatives).map((relative) =>
        this.mapRelative(relative),
      ),
      identifications: this.sortPrimaryFirst(employee.identifications).map(
        (identification) => this.mapIdentification(identification),
      ),
      bank_accounts: this.sortPrimaryFirst(employee.bank_accounts).map(
        (bankAccount) => this.mapBankAccount(bankAccount),
      ),
      company_user: this.mapMembership(employee.company_user),
      documents: includeDocuments
        ? (employee.documents?.map((document) => this.mapDocument(document)) ??
          [])
        : undefined,
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
      return primaryContact[field] as string;
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
    const phone = this.getPrimaryContactValue(
      createEmployeeDto.contacts,
      'phone_number',
    );

    if (!email || !phone) {
      throw new BadRequestException(
        'Employee contact details must include an email and phone number',
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
          password: await hashPassword(randomBytes(16).toString('hex')),
          status: 'active',
          user_type: 'COMPANY_USER',
          is_email_verified: true,
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
        company_user: {
          company_id: companyId,
        },
      },
      relations: {
        company_user: {
          user: true,
          role_assignments: {
            role: {
              permissions: true,
            },
          },
          permission_assignments: {
            permission: true,
          },
        },
        primary_branch: true,
        primary_department: {
          branch: true,
          parent: true,
        },
        position: true,
        manager: {
          company_user: {
            user: true,
            role_assignments: {
              role: {
                permissions: true,
              },
            },
            permission_assignments: {
              permission: true,
            },
          },
        },
        department_assignments: {
          department: {
            branch: true,
            parent: true,
          },
        },
        contacts: true,
        addresses: true,
        relatives: true,
        identifications: true,
        bank_accounts: true,
        documents: {
          uploaded_by: {
            user: true,
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
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
      swift_code:
        this.normalizeOptionalString(bankAccount.swift_code) ?? undefined,
      mobile_money_provider:
        this.normalizeOptionalString(bankAccount.mobile_money_provider) ??
        undefined,
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

  private buildEmployeeEntityPayload(
    dto: Record<string, unknown>,
    branch: Branch | null,
    primaryDepartment: Department | null,
    position: Position | null,
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
      'employment_status',
      'employment_type',
      'hire_date',
      'probation_end_date',
      'confirmation_date',
      'exit_date',
      'exit_reason',
      'notes',
      'metadata',
    ];

    for (const field of directFields) {
      if (field in dto) {
        (payload as Record<string, unknown>)[field] = (
          dto as Record<string, unknown>
        )[field];
      }
    }

    if ('primary_branch_id' in dto) {
      payload.primary_branch_id = branch?.id ?? null;
    }

    if ('primary_department_id' in dto || 'departments' in dto) {
      payload.primary_department_id = primaryDepartment?.id ?? null;
    }

    if ('position_id' in dto) {
      payload.position_id = position?.id ?? null;
    }

    if ('reports_to' in dto) {
      payload.reports_to = managerEmployee?.id ?? null;
    }

    return payload;
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
    employeeId: number,
    identifications: EmployeeIdentificationInputDto[],
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getEmployeeIdentificationRepository(manager);
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
          expiry_date: identification.expiry_date ?? null,
          is_primary: identification.is_primary ?? false,
        }),
      ),
    );
  }

  private async saveEmployeeBankAccounts(
    employeeId: number,
    bankAccounts: EmployeeBankAccountInputDto[],
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
          swift_code: bankAccount.swift_code ?? null,
          mobile_money_provider: bankAccount.mobile_money_provider ?? null,
          is_primary: bankAccount.is_primary ?? false,
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
        normalized.exit_date = new Date().toISOString().slice(0, 10);
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
  ): Promise<number> {
    const normalizedStatus = this.normalizeStatusFields({
      employment_status: dto.employment_status,
      exit_date: dto.exit_date,
      exit_reason: dto.exit_reason,
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

    const position =
      'position_id' in dto
        ? await this.resolvePosition(companyId, dto.position_id, manager)
        : (employee.position ?? null);

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

    if ('employee_no' in dto && dto.employee_no) {
      await this.assertUniqueEmployeeNumber(
        companyId,
        dto.employee_no,
        employee.id || undefined,
        manager,
      );
    }

    const payload = this.buildEmployeeEntityPayload(
      {
        ...dto,
        ...normalizedStatus,
      },
      branch,
      primaryDepartment,
      position,
      managerEmployee,
    );

    Object.assign(employee, payload);

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

    const saved = await this.getEmployeeRepository(manager).save(employee);

    if ('departments' in dto || 'primary_department_id' in dto) {
      await this.saveDepartmentAssignments(saved.id, assignments, manager);
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
        saved.id,
        normalizedIdentifications,
        manager,
      );
    }

    if (normalizedBankAccounts !== undefined) {
      await this.saveEmployeeBankAccounts(
        saved.id,
        normalizedBankAccounts,
        manager,
      );
    }

    return saved.id;
  }

  private async loadEmployeesByIds(
    companyId: number,
    ids: number[],
  ): Promise<Employee[]> {
    if (!ids.length) {
      return [];
    }

    const employees = await this.employeeRepository.find({
      where: {
        id: In(ids),
        company_user: {
          company_id: companyId,
        },
      },
      relations: {
        company_user: {
          user: true,
          role_assignments: {
            role: {
              permissions: true,
            },
          },
          permission_assignments: {
            permission: true,
          },
        },
        primary_branch: true,
        primary_department: {
          branch: true,
          parent: true,
        },
        position: true,
        manager: {
          company_user: {
            user: true,
          },
        },
        department_assignments: {
          department: {
            branch: true,
            parent: true,
          },
        },
        contacts: true,
        addresses: true,
        relatives: true,
        identifications: true,
        bank_accounts: true,
      },
    });

    const byId = new Map(employees.map((employee) => [employee.id, employee]));
    return ids
      .map((id) => byId.get(id))
      .filter((employee): employee is Employee => Boolean(employee));
  }

  async onboard(
    companyId: number,
    onboardEmployeeDto: OnboardEmployeeDto,
    actor: AuthenticatedUser,
  ) {
    const employeeId = await this.dataSource.transaction(async (manager) => {
      const userRepository = this.getUserRepository(manager);

      const existingByEmail = await userRepository.findOne({
        where: { email: onboardEmployeeDto.email },
      });
      const existingByPhone = await userRepository.findOne({
        where: { phone: onboardEmployeeDto.phone },
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

      const existingUser = existingByEmail ?? existingByPhone;

      if (existingUser) {
        if (
          existingByEmail &&
          existingByEmail.phone !== onboardEmployeeDto.phone
        ) {
          throw new ConflictException(
            'This email already exists with a different phone number',
          );
        }

        if (
          existingByPhone &&
          existingByPhone.email !== onboardEmployeeDto.email
        ) {
          throw new ConflictException(
            'This phone number already exists with a different email address',
          );
        }
      }

      const user =
        existingUser ??
        (await userRepository.save(
          userRepository.create({
            user_no: await this.usersService.generateUserNo(manager),
            first_name: onboardEmployeeDto.first_name,
            last_name: onboardEmployeeDto.last_name,
            phone: onboardEmployeeDto.phone,
            email: onboardEmployeeDto.email,
            password: await hashPassword(onboardEmployeeDto.password),
            status: onboardEmployeeDto.user_status ?? 'active',
            user_type: 'COMPANY_USER',
            is_email_verified: true,
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
          {
            roleIds: onboardEmployeeDto.role_ids,
          },
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

      const existingEmployee = await this.getEmployeeRepository(
        manager,
      ).findOne({
        where: { company_user_id: membership.id },
      });

      if (existingEmployee) {
        throw new ConflictException(
          'This company user already has an employee profile',
        );
      }

      await this.assertUniqueEmployeeNumber(
        companyId,
        onboardEmployeeDto.employee_no,
        undefined,
        manager,
      );

      const employee = this.getEmployeeRepository(manager).create({
        company_user_id: membership.id,
        employee_no: onboardEmployeeDto.employee_no,
        first_name: onboardEmployeeDto.first_name,
        last_name: onboardEmployeeDto.last_name,
        employment_status:
          onboardEmployeeDto.employment_status ??
          EmploymentStatusEnum.ONBOARDING,
        employment_type:
          onboardEmployeeDto.employment_type ?? EmploymentTypeEnum.FULL_TIME,
      });

      return this.persistEmployee(
        companyId,
        employee,
        onboardEmployeeDto,
        actor,
        manager,
      );
    });

    return this.findOne(companyId, employeeId, actor);
  }

  async create(
    companyId: number,
    createEmployeeDto: CreateEmployeeDto,
    actor: AuthenticatedUser,
  ) {
    const employeeId = await this.dataSource.transaction(async (manager) => {
      const membership = await this.resolveCompanyMembershipForEmployeeCreation(
        companyId,
        createEmployeeDto,
        manager,
      );

      const existingEmployee = await this.getEmployeeRepository(
        manager,
      ).findOne({
        where: { company_user_id: membership.id },
      });

      if (existingEmployee) {
        throw new ConflictException(
          'This company user already has an employee profile',
        );
      }

      await this.assertUniqueEmployeeNumber(
        companyId,
        createEmployeeDto.employee_no,
        undefined,
        manager,
      );

      const employee = this.getEmployeeRepository(manager).create({
        company_user_id: membership.id,
        employee_no: createEmployeeDto.employee_no,
        first_name: createEmployeeDto.first_name,
        last_name: createEmployeeDto.last_name,
        employment_status:
          createEmployeeDto.employment_status ??
          EmploymentStatusEnum.ONBOARDING,
        employment_type:
          createEmployeeDto.employment_type ?? EmploymentTypeEnum.FULL_TIME,
      });

      return this.persistEmployee(
        companyId,
        employee,
        createEmployeeDto,
        actor,
        manager,
      );
    });

    return this.findOne(companyId, employeeId, actor);
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
      position_id,
    } = query;

    if (branch_id) {
      await this.hrAccessService.assertCanAccessBranch(actor, branch_id);
    }

    const qb = this.employeeRepository
      .createQueryBuilder('employee')
      .select('employee.id', 'id')
      .distinct(true)
      .innerJoin('employee.company_user', 'membership')
      .innerJoin('membership.user', 'user')
      .leftJoin('employee.department_assignments', 'departmentAssignments')
      .leftJoin('departmentAssignments.department', 'department')
      .leftJoin('employee.contacts', 'contact')
      .where('membership.company_id = :companyId', { companyId });

    if (employment_status) {
      qb.andWhere('employee.employment_status = :employmentStatus', {
        employmentStatus: employment_status,
      });
    }

    if (typeof branch_id === 'number') {
      qb.andWhere(
        '(employee.primary_branch_id = :branchId OR department.branch_id = :branchId)',
        { branchId: branch_id },
      );
    }

    if (typeof department_id === 'number') {
      qb.andWhere('departmentAssignments.department_id = :departmentId', {
        departmentId: department_id,
      });
    }

    if (typeof position_id === 'number') {
      qb.andWhere('employee.position_id = :positionId', {
        positionId: position_id,
      });
    }

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      qb.andWhere(
        '(' +
          'employee.employee_no LIKE :term OR ' +
          'employee.first_name LIKE :term OR ' +
          'employee.last_name LIKE :term OR ' +
          'employee.preferred_name LIKE :term OR ' +
          'user.email LIKE :term OR ' +
          'user.phone LIKE :term OR ' +
          'user.user_no LIKE :term OR ' +
          'contact.email LIKE :term OR ' +
          'contact.phone_number LIKE :term' +
          ')',
        { term },
      );
    }

    const accessibleBranchIds =
      await this.hrAccessService.getAccessibleBranchIds(actor);

    if (accessibleBranchIds?.length === 0) {
      return {
        data: [],
        meta: buildPaginationMeta(0, 0, limit, page),
      };
    }

    if (accessibleBranchIds) {
      qb.andWhere(
        '(employee.primary_branch_id IN (:...branchIds) OR department.branch_id IN (:...branchIds))',
        { branchIds: accessibleBranchIds },
      );
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

    const total = await qb.getCount();
    const rawIds = await qb
      .orderBy(`employee.${safeSortBy}`, direction)
      .offset(skip)
      .limit(limit)
      .getRawMany<{ id: string }>();

    const ids = rawIds.map((row) => Number(row.id));
    const employees = await this.loadEmployeesByIds(companyId, ids);

    return {
      data: employees.map((employee) => this.mapEmployee(employee)),
      meta: buildPaginationMeta(total, employees.length, limit, page),
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
  ) {
    const existingEmployee = await this.findEmployeeByIdOrFail(
      companyId,
      employeeId,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, existingEmployee);

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
            position: true,
            manager: {
              company_user: true,
            },
            department_assignments: {
              department: {
                branch: true,
                parent: true,
              },
            },
            contacts: true,
            addresses: true,
            relatives: true,
            identifications: true,
            bank_accounts: true,
          },
        });

        if (!employee) {
          throw new NotFoundException('Employee not found');
        }

        return this.persistEmployee(
          companyId,
          employee,
          updateEmployeeDto,
          actor,
          manager,
        );
      },
    );

    return this.findOne(companyId, updatedEmployeeId, actor);
  }

  async changeStatus(
    companyId: number,
    employeeId: number,
    changeEmployeeStatusDto: ChangeEmployeeStatusDto,
    actor: AuthenticatedUser,
  ) {
    return this.update(companyId, employeeId, changeEmployeeStatusDto, actor);
  }

  async addDocument(
    companyId: number,
    employeeId: number,
    addEmployeeDocumentDto: AddEmployeeDocumentDto,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const documentRepository = this.getEmployeeDocumentRepository();
    const document = await documentRepository.save(
      documentRepository.create({
        employee_id: employee.id,
        type: addEmployeeDocumentDto.type ?? null,
        title: addEmployeeDocumentDto.title ?? null,
        file_url: addEmployeeDocumentDto.file_url,
        notes: addEmployeeDocumentDto.notes ?? null,
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

    return this.mapDocument(savedDocument);
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

    await this.employeeDocumentRepository.remove(document);
    return { message: 'Employee document deleted successfully' };
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

    await repository.remove(contact);
    return { message: 'Employee contact deleted successfully' };
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

    await repository.remove(address);
    return { message: 'Employee address deleted successfully' };
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

    await repository.remove(relative);
    return { message: 'Employee relative deleted successfully' };
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

    const repository = this.getEmployeeIdentificationRepository();
    const identification = await repository.save(
      repository.create({
        employee_id: employee.id,
        identification_type: dto.identification_type,
        identification_number: dto.identification_number.trim(),
        issued_country: this.normalizeOptionalString(dto.issued_country),
        expiry_date: dto.expiry_date ?? null,
        is_primary: dto.is_primary ?? false,
      }),
    );

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

    if (dto.identification_type !== undefined)
      identification.identification_type = dto.identification_type;
    if (dto.identification_number !== undefined)
      identification.identification_number = dto.identification_number.trim();
    if (dto.issued_country !== undefined)
      identification.issued_country = this.normalizeOptionalString(
        dto.issued_country,
      );
    if (dto.expiry_date !== undefined)
      identification.expiry_date = dto.expiry_date ?? null;
    if (dto.is_primary !== undefined)
      identification.is_primary = dto.is_primary;

    const saved = await repository.save(identification);
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

    await repository.remove(identification);
    return { message: 'Employee identification deleted successfully' };
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
        swift_code: this.normalizeOptionalString(dto.swift_code),
        mobile_money_provider: this.normalizeOptionalString(
          dto.mobile_money_provider,
        ),
        is_primary: dto.is_primary ?? false,
      }),
    );

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

    if (dto.bank_name !== undefined)
      bankAccount.bank_name = this.normalizeOptionalString(dto.bank_name);
    if (dto.account_name !== undefined)
      bankAccount.account_name = this.normalizeOptionalString(dto.account_name);
    if (dto.account_number !== undefined)
      bankAccount.account_number = dto.account_number.trim();
    if (dto.branch_name !== undefined)
      bankAccount.branch_name = this.normalizeOptionalString(dto.branch_name);
    if (dto.swift_code !== undefined)
      bankAccount.swift_code = this.normalizeOptionalString(dto.swift_code);
    if (dto.mobile_money_provider !== undefined)
      bankAccount.mobile_money_provider = this.normalizeOptionalString(
        dto.mobile_money_provider,
      );
    if (dto.is_primary !== undefined) bankAccount.is_primary = dto.is_primary;

    const saved = await repository.save(bankAccount);
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

    await repository.remove(bankAccount);
    return { message: 'Employee bank account deleted successfully' };
  }

  async remove(
    companyId: number,
    employeeId: number,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const employee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);
    await this.employeeRepository.remove(employee);
    return { message: 'Employee deleted successfully' };
  }
}
