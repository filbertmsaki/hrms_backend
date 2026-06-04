import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { AttendanceDevice } from '../../../hr/attendance/devices/entities/attendance-device.entity';
import { Employee } from '../../../hr/employees/entities/employee.entity';
import { EmployeeDeviceAssignment } from '../../employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeDeviceAssignmentMatchQueryDto } from '../dto/employee-device-assignment-match-query.dto';

type MatchCandidate = {
  id: number;
  employee_name: string | null;
  employee_no: string;
};

type EmployeeNameSource = Pick<
  Employee,
  'first_name' | 'middle_name' | 'last_name' | 'preferred_name'
>;

@Injectable()
export class AccessControlAttendanceDevicesService {
  constructor(
    @InjectRepository(AttendanceDevice)
    private readonly attendanceDeviceRepository: Repository<AttendanceDevice>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeDeviceAssignment)
    private readonly employeeDeviceAssignmentRepository: Repository<EmployeeDeviceAssignment>,
  ) {}

  async searchEmployeeDeviceAssignmentMatches(
    companyId: number,
    query: EmployeeDeviceAssignmentMatchQueryDto,
  ): Promise<MatchCandidate[]> {
    await this.findDeviceOrFail(companyId, query.deviceId);
    const employee = await this.findEmployeeOrFail(companyId, query.employeeId);
    const nameVariations = this.buildEmployeeNameVariations(employee);

    if (!nameVariations.length) {
      return [];
    }

    const assignments = await this.employeeDeviceAssignmentRepository
      .createQueryBuilder('assignment')
      .select('assignment.id', 'id')
      .addSelect('assignment.employee_name', 'employee_name')
      .addSelect('assignment.employee_no', 'employee_no')
      .where('assignment.company_id = :companyId', { companyId })
      .andWhere('assignment.device_id = :deviceId', { deviceId: query.deviceId })
      .andWhere('assignment.employee_id IS NULL')
      .andWhere('assignment.employee_name IS NOT NULL')
      .getRawMany<MatchCandidate>();

    return assignments
      .map((assignment) => ({
        assignment,
        score: this.calculateMatchScore(assignment.employee_name, nameVariations),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        const leftName = left.assignment.employee_name ?? '';
        const rightName = right.assignment.employee_name ?? '';
        return leftName.localeCompare(rightName) || left.assignment.employee_no.localeCompare(right.assignment.employee_no);
      })
      .map(({ assignment }) => ({
        id: Number(assignment.id),
        employee_name: assignment.employee_name,
        employee_no: assignment.employee_no,
      }));
  }

  private async findDeviceOrFail(companyId: number, deviceId: number): Promise<void> {
    const exists = await this.attendanceDeviceRepository.exists({
      where: { id: deviceId, companyId },
    });

    if (!exists) {
      throw new NotFoundException('Attendance device not found');
    }
  }

  private async findEmployeeOrFail(companyId: number, employeeId: number): Promise<EmployeeNameSource> {
    const employee = await this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin(CompanyUser, 'companyUser', 'companyUser.id = employee.company_user_id')
      .where('employee.id = :employeeId', { employeeId })
      .andWhere('companyUser.company_id = :companyId', { companyId })
      .select([
        'employee.first_name',
        'employee.middle_name',
        'employee.last_name',
        'employee.preferred_name',
      ])
      .getOne();

    if (!employee) {
      throw new NotFoundException('Employee not found for active company');
    }

    return employee;
  }

  private buildEmployeeNameVariations(employee: EmployeeNameSource): string[] {
    const firstName = this.normalizeName(employee.first_name);
    const middleName = this.normalizeName(employee.middle_name);
    const lastName = this.normalizeName(employee.last_name);
    const preferredName = this.normalizeName(employee.preferred_name);
    const variations = new Set<string>();

    this.addNameVariation(variations, firstName, lastName);
    this.addNameVariation(variations, firstName, middleName, lastName);
    this.addNameVariation(variations, preferredName, lastName);
    this.addNameVariation(variations, preferredName, middleName, lastName);
    this.addNameVariation(variations, preferredName);
    this.addNameVariation(variations, firstName, middleName);
    this.addNameVariation(variations, firstName);

    return [...variations].sort((left, right) => right.length - left.length);
  }

  private addNameVariation(
    variations: Set<string>,
    ...parts: Array<string | null>
  ): void {
    const value = parts.filter((part): part is string => Boolean(part)).join(' ').trim();
    if (value) {
      variations.add(value);
    }
  }

  private calculateMatchScore(
    assignmentEmployeeName: string | null,
    nameVariations: string[],
  ): number {
    const candidate = this.normalizeName(assignmentEmployeeName);

    if (!candidate) {
      return 0;
    }

    const candidateTokens = candidate.split(' ').filter(Boolean);
    const candidateTokenSet = new Set(candidateTokens);
    let bestScore = 0;

    for (const variation of nameVariations) {
      const variationTokens = variation.split(' ').filter(Boolean);
      const sharedTokenCount = variationTokens.filter((token) => candidateTokenSet.has(token)).length;

      if (candidate === variation) {
        bestScore = Math.max(bestScore, 100 + variationTokens.length);
        continue;
      }

      if (
        variationTokens.length >= 2 &&
        (candidate.includes(variation) || variation.includes(candidate))
      ) {
        bestScore = Math.max(bestScore, 85 + sharedTokenCount);
        continue;
      }

      if (variationTokens.length >= 2 && sharedTokenCount === variationTokens.length) {
        bestScore = Math.max(bestScore, 75 + sharedTokenCount);
        continue;
      }

      const variationCoverage = sharedTokenCount / variationTokens.length;
      const candidateCoverage = sharedTokenCount / candidateTokens.length;
      if (
        sharedTokenCount >= 2 &&
        (variationCoverage >= 0.5 || candidateCoverage >= 0.5)
      ) {
        bestScore = Math.max(bestScore, 60 + sharedTokenCount);
        continue;
      }

      if (
        variationTokens.length === 1 &&
        variation.length >= 3 &&
        candidateTokenSet.has(variation)
      ) {
        bestScore = Math.max(bestScore, 40 + variation.length);
      }
    }

    return bestScore;
  }

  private normalizeName(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const normalized = value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');

    return normalized || null;
  }
}
