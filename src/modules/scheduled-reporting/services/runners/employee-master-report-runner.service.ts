import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from '../../../hr/employees/entities/employee.entity';
import {
  ReportRunner,
  ReportRunnerContext,
  ReportRunnerResult,
} from '../../interfaces/report-runner.interface';

@Injectable()
export class EmployeeMasterReportRunner implements ReportRunner {
  readonly reportCode = 'EMPLOYEE_DIRECTORY';

  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  async generate(context: ReportRunnerContext): Promise<ReportRunnerResult> {
    const qb = this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoin('employee.primary_branch', 'branch')
      .leftJoin('employee.primary_department', 'department')
      .leftJoin('employee.primary_position', 'position')
      .select('employee.employee_no', 'employeeNumber')
      .addSelect('employee.first_name', 'firstName')
      .addSelect('employee.middle_name', 'middleName')
      .addSelect('employee.last_name', 'lastName')
      .addSelect('employee.employment_status', 'employmentStatus')
      .addSelect('employee.hire_date', 'hireDate')
      .addSelect('branch.name', 'branchName')
      .addSelect('department.name', 'departmentName')
      .addSelect('position.name', 'positionName')
      .where('employee.company_id = :companyId', {
        companyId: context.companyId,
      })
      .orderBy('employee.employee_no', 'ASC');

    const branchId = context.reportFilters?.branch_id;
    if (branchId) {
      qb.andWhere('employee.primary_branch_id = :branchId', { branchId });
    }

    const departmentId = context.reportFilters?.department_id;
    if (departmentId) {
      qb.andWhere('employee.primary_department_id = :departmentId', {
        departmentId,
      });
    }

    const rows = await qb.getRawMany<{
      employeeNumber: string;
      firstName: string;
      middleName: string | null;
      lastName: string;
      employmentStatus: string;
      hireDate: string | null;
      branchName: string | null;
      departmentName: string | null;
      positionName: string | null;
    }>();

    const header = [
      'Employee Number',
      'First Name',
      'Middle Name',
      'Last Name',
      'Employment Status',
      'Hire Date',
      'Branch',
      'Department',
      'Position',
    ];

    const lines = [header.join(',')];
    for (const row of rows) {
      lines.push(
        [
          row.employeeNumber,
          row.firstName,
          row.middleName ?? '',
          row.lastName,
          row.employmentStatus,
          row.hireDate ?? '',
          row.branchName ?? '',
          row.departmentName ?? '',
          row.positionName ?? '',
        ]
          .map((value) => this.escapeCsvCell(String(value ?? '')))
          .join(','),
      );
    }

    const buffer = Buffer.from(lines.join('\r\n'), 'utf8');
    const filename = context.filenamePattern
      .replace(/\{\{\s*reportDate\s*\}\}/g, context.dateTo ?? 'export')
      .replace(/\.(xlsx|pdf)$/i, '.csv');

    return {
      filename,
      mimeType: 'text/csv',
      buffer,
      recordCount: rows.length,
    };
  }

  private escapeCsvCell(value: string): string {
    if (!/[",\r\n]/.test(value)) {
      return value;
    }

    return `"${value.replace(/"/g, '""')}"`;
  }
}
