import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { SortDirection } from '../../../common/dto/pagination.dto';
import { hashPassword } from '../../../common/utils/hash.util';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { CompaniesService } from '../../companies/companies.service';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { CompanyUserPermission } from '../../companies/entities/company-user-permission.entity';
import { CompanyUserRole } from '../../companies/entities/company-user-role.entity';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/users.service';
import { AddEmployeeDocumentDto } from './dtos/add-employee-document.dto';
import { ChangeEmployeeStatusDto } from './dtos/change-employee-status.dto';
import { CreateEmployeeDto } from './dtos/create-employee.dto';
import { EmployeeDepartmentInputDto } from './dtos/employee-department-input.dto';
import { EmployeeQueryDto } from './dtos/employee-query.dto';
import { OnboardEmployeeDto } from './dtos/onboard-employee.dto';
import { UpdateEmployeeDto } from './dtos/update-employee.dto';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { Position } from '../positions/entities/position.entity';
import { HrAccessService } from '../shared/hr-access.service';
import {
  buildPaginationMeta,
  getMembershipPermissions,
  getMembershipRoles,
} from '../shared/hr.utils';
import { EmployeeDepartment } from './entities/employee-department.entity';
import { EmployeeDocument } from './entities/employee-document.entity';
import { Employee } from './entities/employee.entity';

type EmployeeMutationDto = CreateEmployeeDto | UpdateEmployeeDto | OnboardEmployeeDto;

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
    return manager?.getRepository(EmployeeDocument) ?? this.employeeDocumentRepository;
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

  private getPositionRepository(
    manager?: EntityManager,
  ): Repository<Position> {
    return manager?.getRepository(Position) ?? this.positionRepository;
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
      national_id_no: employee.national_id_no,
      passport_no: employee.passport_no,
      tax_id_no: employee.tax_id_no,
      social_security_no: employee.social_security_no,
      work_email: employee.work_email,
      personal_email: employee.personal_email,
      phone: employee.phone,
      alternate_phone: employee.alternate_phone,
      address_line_1: employee.address_line_1,
      address_line_2: employee.address_line_2,
      city: employee.city,
      state: employee.state,
      country: employee.country,
      postal_code: employee.postal_code,
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
      emergency_contact_name: employee.emergency_contact_name,
      emergency_contact_phone: employee.emergency_contact_phone,
      emergency_contact_relationship: employee.emergency_contact_relationship,
      bank_name: employee.bank_name,
      bank_account_no: employee.bank_account_no,
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
      company_user: this.mapMembership(employee.company_user),
      documents: includeDocuments
        ? employee.documents?.map((document) => this.mapDocument(document)) ?? []
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
      if (!normalized.some((input) => input.department_id === primaryDepartmentId)) {
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
      throw new NotFoundException('One or more employee departments were not found');
    }

    const entityMap = new Map(
      departmentsById.map((department) => [department.id, department]),
    );

    for (const department of departmentsById) {
      if (department.branch_id) {
        await this.hrAccessService.assertCanAccessBranch(actor, department.branch_id);
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
      'national_id_no',
      'passport_no',
      'tax_id_no',
      'social_security_no',
      'work_email',
      'personal_email',
      'phone',
      'alternate_phone',
      'address_line_1',
      'address_line_2',
      'city',
      'state',
      'country',
      'postal_code',
      'profile_photo_url',
      'employment_status',
      'employment_type',
      'hire_date',
      'probation_end_date',
      'confirmation_date',
      'exit_date',
      'emergency_contact_name',
      'emergency_contact_phone',
      'emergency_contact_relationship',
      'bank_name',
      'bank_account_no',
      'exit_reason',
      'notes',
      'metadata',
    ];

    for (const field of directFields) {
      if (field in dto) {
        (payload as Record<string, unknown>)[field] =
          (dto as Record<string, unknown>)[field];
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

  private normalizeStatusFields(
    dto: Partial<Pick<Employee, 'employment_status' | 'exit_date' | 'exit_reason'>>,
  ): Partial<Pick<Employee, 'employment_status' | 'exit_date' | 'exit_reason'>> {
    const normalized = { ...dto };

    if (
      normalized.employment_status &&
      ['terminated', 'exited'].includes(normalized.employment_status) &&
      !normalized.exit_date
    ) {
      normalized.exit_date = new Date().toISOString().slice(0, 10);
    }

    if (
      normalized.employment_status &&
      !['terminated', 'exited'].includes(normalized.employment_status)
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
        ? await this.resolveBranch(companyId, dto.primary_branch_id, actor, manager)
        : employee.primary_branch ?? null;

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
        : employee.position ?? null;

    const managerEmployee =
      'reports_to' in dto
        ? await this.resolveManager(
            companyId,
            dto.reports_to,
            actor,
            employee.id || undefined,
            manager,
          )
        : employee.manager ?? null;

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

    const saved = await this.getEmployeeRepository(manager).save(employee);

    if ('departments' in dto || 'primary_department_id' in dto) {
      await this.saveDepartmentAssignments(saved.id, assignments, manager);
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
      },
    });

    const byId = new Map(employees.map((employee) => [employee.id, employee]));
    return ids.map((id) => byId.get(id)).filter((employee): employee is Employee => Boolean(employee));
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
        if (existingByEmail && existingByEmail.phone !== onboardEmployeeDto.phone) {
          throw new ConflictException(
            'This email already exists with a different phone number',
          );
        }

        if (existingByPhone && existingByPhone.email !== onboardEmployeeDto.email) {
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

      let membership = await this.findMembershipByUserId(companyId, user.id, manager);

      if (!membership) {
        await this.companiesService.addUserToCompany(
          user.id,
          companyId,
          {
            roleIds: onboardEmployeeDto.role_ids,
          },
          manager,
        );

        membership = await this.findMembershipByUserId(companyId, user.id, manager);
      }

      if (!membership) {
        throw new NotFoundException('Company membership could not be created');
      }

      const existingEmployee = await this.getEmployeeRepository(manager).findOne({
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
        employment_status: onboardEmployeeDto.employment_status ?? 'onboarding',
        employment_type: onboardEmployeeDto.employment_type ?? 'full_time',
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
    const membership = await this.findMembershipByUserId(
      companyId,
      createEmployeeDto.user_id,
    );

    if (!membership) {
      throw new NotFoundException(
        'Active company membership not found for the requested user',
      );
    }

    const existingEmployee = await this.employeeRepository.findOne({
      where: { company_user_id: membership.id },
    });

    if (existingEmployee) {
      throw new ConflictException(
        'This company user already has an employee profile',
      );
    }

    const employeeId = await this.dataSource.transaction(async (manager) => {
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
        employment_status: createEmployeeDto.employment_status ?? 'onboarding',
        employment_type: createEmployeeDto.employment_type ?? 'full_time',
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
      .where('membership.company_id = :companyId', { companyId });

    if (employment_status?.trim()) {
      qb.andWhere('employee.employment_status = :employmentStatus', {
        employmentStatus: employment_status.trim(),
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
        '(employee.employee_no LIKE :term OR employee.first_name LIKE :term OR employee.last_name LIKE :term OR employee.preferred_name LIKE :term OR user.email LIKE :term OR user.phone LIKE :term OR user.user_no LIKE :term)',
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
    const existingEmployee = await this.findEmployeeByIdOrFail(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, existingEmployee);

    const updatedEmployeeId = await this.dataSource.transaction(async (manager) => {
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
    });

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
