import { DataSource, QueryDeepPartialEntity, Repository } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { hashPassword } from '../../common/utils/hash.util';
import { Branch } from '../../modules/hr/branches/entities/branch.entity';
import { ContactTypeEnum } from '../../modules/hr/employees/enums/contact-type.enum';
import { Department } from '../../modules/hr/departments/entities/department.entity';
import { Position } from '../../modules/hr/positions/entities/position.entity';
import { Employee } from '../../modules/hr/employees/entities/employee.entity';
import { EmployeeContact } from '../../modules/hr/employees/entities/employee-contact.entity';
import { EmployeeDepartment } from '../../modules/hr/employees/entities/employee-department.entity';
import { Company } from '../../modules/companies/entities/company.entity';
import { CompanyUser } from '../../modules/companies/entities/company-user.entity';
import { User } from '../../modules/users/entities/user.entity';
import {
  ALLIANCE_BRANCHES,
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_DEPARTMENTS,
  ALLIANCE_EMPLOYEES,
  ALLIANCE_POSITIONS,
} from './company-structure.constants';

export default class AllianceCompanyStructureSeeder implements Seeder {
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
      const departmentRepo = manager.getRepository(Department);
      const positionRepo = manager.getRepository(Position);
      const userRepo = manager.getRepository(User);
      const companyUserRepo = manager.getRepository(CompanyUser);
      const employeeRepo = manager.getRepository(Employee);
      const employeeContactRepo = manager.getRepository(EmployeeContact);
      const employeeDepartmentRepo = manager.getRepository(EmployeeDepartment);

      const companyName =
        process.env.DEFAULT_COMPANY_NAME ?? ALLIANCE_COMPANY_NAME;
      const company = await this.findExistingCompany(companyRepo, companyName);

      // 1. Sync branches (returns map of branch code -> entity)
      const branchByCode = await this.syncBranches(
        branchRepo,
        company.id,
        ALLIANCE_BRANCHES,
      );

      // 2. Sync departments with branch_id references
      const departmentByCode = await this.syncDepartments(
        departmentRepo,
        company.id,
        ALLIANCE_DEPARTMENTS,
        branchByCode,
      );

      // 3. Sync positions (returns map of position code -> entity)
      const positionByCode = await this.syncPositions(
        positionRepo,
        company.id,
        ALLIANCE_POSITIONS,
      );

      // 4. Sync employees with manager and department assignments
      await this.syncEmployees(
        employeeRepo,
        companyUserRepo,
        userRepo,
        employeeContactRepo,
        employeeDepartmentRepo,
        company.id,
        ALLIANCE_EMPLOYEES,
        branchByCode,
        departmentByCode,
        positionByCode,
      );

      await queryRunner.commitTransaction();
      console.log(`Seeded company structure for ${company.name}`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Alliance structure seeding failed:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async findExistingCompany(
    companyRepo: Repository<Company>,
    companyName: string,
  ): Promise<Company> {
    const normalizedName = companyName.trim();

    const company = await companyRepo.findOne({
      where: { name: normalizedName },
    });

    if (!company) {
      throw new Error(
        'Default company not found. Please run 001-initial-rbac.seed.ts first to create the Alliance company.',
      );
    }

    return company;
  }

  private async syncBranches(
    branchRepo: Repository<Branch>,
    companyId: number,
    definitions: typeof ALLIANCE_BRANCHES,
  ): Promise<Map<string, Branch>> {
    const existingBranches = await branchRepo.find({
      where: { company_id: companyId },
    });

    const existingByName = new Map(
      existingBranches.map((branch) => [branch.name.toLowerCase(), branch]),
    );

    const missingBranches = [] as QueryDeepPartialEntity<Branch>[];
    const updatedBranches = [] as QueryDeepPartialEntity<Branch>[];

    for (const definition of definitions) {
      const existing = existingByName.get(definition.name.toLowerCase());
      const status = definition.status ?? 'active';

      if (!existing) {
        missingBranches.push({
          company_id: companyId,
          name: definition.name,
          code: definition.code,
          city: definition.city,
          country: definition.country,
          status,
        });
        continue;
      }

      if (
        existing.code !== definition.code ||
        existing.city !== definition.city ||
        existing.country !== definition.country ||
        existing.status !== status
      ) {
        updatedBranches.push({
          id: existing.id,
          code: definition.code,
          city: definition.city,
          country: definition.country,
          status,
        });
      }
    }

    if (missingBranches.length > 0) {
      await branchRepo.insert(missingBranches);
    }

    if (updatedBranches.length > 0) {
      await branchRepo.save(updatedBranches as Branch[]);
    }

    // Re-fetch all branches and return them indexed by code
    const allBranches = await branchRepo.find({
      where: { company_id: companyId },
    });

    const byCode = new Map<string, Branch>();
    for (const branch of allBranches) {
      if (branch.code) {
        byCode.set(branch.code.toLowerCase(), branch);
      }
      byCode.set(branch.name.toLowerCase(), branch);
    }

    return byCode;
  }

  private async syncDepartments(
    departmentRepo: Repository<Department>,
    companyId: number,
    definitions: typeof ALLIANCE_DEPARTMENTS,
    branchByCode: Map<string, Branch>,
  ): Promise<Map<string, Department>> {
    const existingDepartments = await departmentRepo.find({
      where: { company_id: companyId },
    });

    const existingByName = new Map(
      existingDepartments.map((department) => [
        department.name.toLowerCase(),
        department,
      ]),
    );

    const missingDepartments = [] as QueryDeepPartialEntity<Department>[];
    const updatedDepartments = [] as QueryDeepPartialEntity<Department>[];

    for (const definition of definitions) {
      const existing = existingByName.get(definition.name.toLowerCase());

      // Resolve branch_id from the mapped branch
      const branch =
        branchByCode.get(definition.branchCode.toLowerCase()) ??
        branchByCode.get(definition.branchCode);
      if (!branch) {
        throw new Error(
          `Branch "${definition.branchCode}" not found for department "${definition.name}". ` +
            'Ensure branches are seeded before departments.',
        );
      }

      if (!existing) {
        missingDepartments.push({
          company_id: companyId,
          branch_id: branch.id,
          name: definition.name,
          code: definition.code,
          description: definition.description,
          status: 'active',
        });
        continue;
      }

      if (
        existing.code !== definition.code ||
        existing.description !== definition.description ||
        existing.branch_id !== branch.id ||
        existing.status !== 'active'
      ) {
        updatedDepartments.push({
          id: existing.id,
          code: definition.code,
          branch_id: branch.id,
          description: definition.description,
          status: 'active',
        });
      }
    }

    if (missingDepartments.length > 0) {
      await departmentRepo.insert(missingDepartments);
    }

    if (updatedDepartments.length > 0) {
      await departmentRepo.save(updatedDepartments as Department[]);
    }

    // Re-fetch all departments and return them indexed by code
    const allDepartments = await departmentRepo.find({
      where: { company_id: companyId },
    });

    const byCode = new Map<string, Department>();
    for (const dept of allDepartments) {
      if (dept.code) {
        byCode.set(dept.code.toLowerCase(), dept);
      }
      byCode.set(dept.name.toLowerCase(), dept);
    }

    return byCode;
  }

  private async syncPositions(
    positionRepo: Repository<Position>,
    companyId: number,
    definitions: typeof ALLIANCE_POSITIONS,
  ): Promise<Map<string, Position>> {
    const existingPositions = await positionRepo.find({
      where: { company_id: companyId },
    });

    const existingByName = new Map(
      existingPositions.map((position) => [
        position.name.toLowerCase(),
        position,
      ]),
    );

    const missingPositions = [] as QueryDeepPartialEntity<Position>[];
    const updatedPositions = [] as QueryDeepPartialEntity<Position>[];

    for (const definition of definitions) {
      const existing = existingByName.get(definition.name.toLowerCase());

      if (!existing) {
        missingPositions.push({
          company_id: companyId,
          name: definition.name,
          code: definition.code,
          category: definition.category,
          level: definition.level,
          is_manager: definition.isManager,
          description: definition.description,
          status: 'active',
        });
        continue;
      }

      if (
        existing.code !== definition.code ||
        existing.category !== definition.category ||
        existing.level !== definition.level ||
        existing.is_manager !== definition.isManager ||
        existing.description !== definition.description ||
        existing.status !== 'active'
      ) {
        updatedPositions.push({
          id: existing.id,
          code: definition.code,
          category: definition.category,
          level: definition.level,
          is_manager: definition.isManager,
          description: definition.description,
          status: 'active',
        });
      }
    }

    if (missingPositions.length > 0) {
      await positionRepo.insert(missingPositions);
    }

    if (updatedPositions.length > 0) {
      await positionRepo.save(updatedPositions as Position[]);
    }

    // Re-fetch all positions and return them indexed by code
    const allPositions = await positionRepo.find({
      where: { company_id: companyId },
    });

    const byCode = new Map<string, Position>();
    for (const position of allPositions) {
      if (position.code) {
        byCode.set(position.code.toLowerCase(), position);
      }
    }

    return byCode;
  }

  private async syncEmployees(
    employeeRepo: Repository<Employee>,
    companyUserRepo: Repository<CompanyUser>,
    userRepo: Repository<User>,
    employeeContactRepo: Repository<EmployeeContact>,
    employeeDepartmentRepo: Repository<EmployeeDepartment>,
    companyId: number,
    definitions: typeof ALLIANCE_EMPLOYEES,
    branchByCode: Map<string, Branch>,
    departmentByCode: Map<string, Department>,
    positionByCode: Map<string, Position>,
  ): Promise<void> {
    // Remove existing employee-seeded contacts and department assignments first
    // (clean slate approach for employee seed data)
    const existingEmployees = await employeeRepo.find({
      where: { company_user: { company_id: companyId } },
      relations: ['company_user'],
    });

    // Build a map of existing employee_no -> employee
    const existingByEmployeeNo = new Map(
      existingEmployees.map((e) => [e.employee_no, e]),
    );

    // Build a map of employee_no -> Employee for resolving manager references
    const employeeByNo = new Map(existingByEmployeeNo);

    for (const definition of definitions) {
      const existing = existingByEmployeeNo.get(definition.employeeNo);
      if (existing) {
        employeeByNo.set(definition.employeeNo, existing);
      }
    }

    // First pass: ensure all users and company memberships exist
    for (const definition of definitions) {
      if (existingByEmployeeNo.has(definition.employeeNo)) {
        continue; // Employee already exists
      }

      // Find or create user
      let user = await userRepo.findOne({
        where: [
          { email: definition.email },
          { phone: definition.phone },
        ],
      });

      if (!user) {
        user = userRepo.create({
          user_no: definition.employeeNo,
          first_name: definition.firstName,
          last_name: definition.lastName,
          phone: definition.phone,
          email: definition.email,
          password: await hashPassword('Employee123!'),
          status: 'active',
          user_type: 'COMPANY_USER',
          is_email_verified: true,
        });
        user = await userRepo.save(user);
      }

      // Find or create company membership
      let membership = await companyUserRepo.findOne({
        where: { company_id: companyId, user_id: user.id },
      });

      if (!membership) {
        membership = companyUserRepo.create({
          company_id: companyId,
          user_id: user.id,
          status: 'active',
          is_default: false,
        });
        membership = await companyUserRepo.save(membership);
      }
    }

    // Second pass: create or update employees
    for (const definition of definitions) {
      if (existingByEmployeeNo.has(definition.employeeNo)) {
        continue; // Employee already exists
      }

      const user = await userRepo.findOne({
        where: [
          { email: definition.email },
          { phone: definition.phone },
        ],
      });

      if (!user) {
        throw new Error(`User not found for employee ${definition.employeeNo}`);
      }

      const membership = await companyUserRepo.findOne({
        where: { company_id: companyId, user_id: user.id },
      });

      if (!membership) {
        throw new Error(
          `Company membership not found for user ${definition.employeeNo}`,
        );
      }

      const branch =
        branchByCode.get(definition.primaryBranchCode.toLowerCase()) ??
        branchByCode.get(definition.primaryBranchCode);
      if (!branch) {
        throw new Error(
          `Branch "${definition.primaryBranchCode}" not found for employee ${definition.employeeNo}`,
        );
      }

      const department =
        departmentByCode.get(definition.primaryDepartmentCode.toLowerCase()) ??
        departmentByCode.get(definition.primaryDepartmentCode);
      if (!department) {
        throw new Error(
          `Department "${definition.primaryDepartmentCode}" not found for employee ${definition.employeeNo}`,
        );
      }

      const position = positionByCode.get(definition.positionCode.toLowerCase());
      if (!position) {
        throw new Error(
          `Position "${definition.positionCode}" not found for employee ${definition.employeeNo}`,
        );
      }

      // Resolve manager reference
      let reportsTo: number | null = null;
      if (definition.reportsToEmployeeNo) {
        const managerEmployee = employeeByNo.get(definition.reportsToEmployeeNo);
        if (!managerEmployee) {
          throw new Error(
            `Manager "${definition.reportsToEmployeeNo}" not found for employee ${definition.employeeNo}. ` +
              'Ensure the manager is defined before their direct reports.',
          );
        }
        reportsTo = managerEmployee.id;
      }

      const employee = new Employee();
      employee.company_user_id = membership.id;
      employee.employee_no = definition.employeeNo;
      employee.first_name = definition.firstName;
      employee.last_name = definition.lastName;
      employee.primary_branch_id = branch.id;
      employee.primary_department_id = department.id;
      employee.position_id = position.id;
      employee.employment_status = 'active' as any;
      employee.employment_type = 'full_time' as any;
      employee.hire_date = '2025-01-01';
      employee.reports_to = reportsTo;

      const saved = await employeeRepo.save(employee);
      employeeByNo.set(definition.employeeNo, saved);

      // Create a work contact for the employee
      const contact = new EmployeeContact();
      contact.employee_id = saved.id;
      contact.contact_type = ContactTypeEnum.WORK;
      contact.phone_number = definition.phone;
      contact.email = definition.email;
      contact.is_primary = true;
      contact.is_verified = true;
      await employeeContactRepo.save(contact);

      // Create department assignment
      const deptAssignment = new EmployeeDepartment();
      deptAssignment.employee_id = saved.id;
      deptAssignment.department_id = department.id;
      deptAssignment.is_primary = true;
      await employeeDepartmentRepo.save(deptAssignment);
    }

    // Update any pre-existing employees whose reports_to needs setting
    for (const definition of definitions) {
      if (!definition.reportsToEmployeeNo) continue;

      const employee = existingByEmployeeNo.get(definition.employeeNo);
      if (!employee) continue;

      const managerEmployee = employeeByNo.get(definition.reportsToEmployeeNo);
      if (!managerEmployee) continue;

      if (employee.reports_to !== managerEmployee.id) {
        employee.reports_to = managerEmployee.id;
        await employeeRepo.save(employee);
      }
    }
  }
}