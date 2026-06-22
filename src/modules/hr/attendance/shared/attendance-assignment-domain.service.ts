import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShiftAssignment } from '../shift/shift-assignments/entities/shift-assignment.entity';
import { ShiftAssignmentStatusEnum } from '../shift/shift-assignments/enums/shift-assignment-status.enum';
import { EmployeeTimetable } from '../timetable/employee-timetables/entities/employee-timetable.entity';
import { EmployeeTimetableStatusEnum } from '../timetable/employee-timetables/enums/employee-timetable-status.enum';
import { applyActiveAssignmentOverlapFilter } from './attendance-domain.utils';

@Injectable()
export class AttendanceAssignmentDomainService {
  constructor(
    @InjectRepository(ShiftAssignment)
    private readonly shiftAssignmentRepository: Repository<ShiftAssignment>,
    @InjectRepository(EmployeeTimetable)
    private readonly employeeTimetableRepository: Repository<EmployeeTimetable>,
  ) {}

  async ensureNoOverlappingShiftAssignment(input: {
    companyId: number;
    employeeId: number;
    effectiveFrom: string;
    effectiveTo: string | null;
    status: ShiftAssignmentStatusEnum;
    ignoreId?: number;
  }): Promise<void> {
    if (input.status !== ShiftAssignmentStatusEnum.ACTIVE) {
      return;
    }

    const qb = this.shiftAssignmentRepository
      .createQueryBuilder('assignment')
      .andWhere('assignment.status = :status', {
        status: ShiftAssignmentStatusEnum.ACTIVE,
      });

    applyActiveAssignmentOverlapFilter(qb, 'assignment', input);

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException(
        'Active shift assignment overlaps an existing assignment for this employee',
      );
    }
  }

  async ensureNoOverlappingEmployeeTimetable(input: {
    companyId: number;
    employeeId: number;
    effectiveFrom: string;
    effectiveTo: string | null;
    status: EmployeeTimetableStatusEnum;
    ignoreId?: number;
  }): Promise<void> {
    if (input.status !== EmployeeTimetableStatusEnum.ACTIVE) {
      return;
    }

    const qb = this.employeeTimetableRepository
      .createQueryBuilder('employeeTimetable')
      .andWhere('employeeTimetable.status = :status', {
        status: EmployeeTimetableStatusEnum.ACTIVE,
      });

    applyActiveAssignmentOverlapFilter(qb, 'employeeTimetable', input);

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException(
        'Active employee timetable overlaps an existing timetable assignment',
      );
    }
  }

  async ensureNoConflictingAssignmentType(input: {
    companyId: number;
    employeeId: number;
    effectiveFrom: string;
    effectiveTo: string | null;
    status: ShiftAssignmentStatusEnum | EmployeeTimetableStatusEnum;
    assignmentType: 'SHIFT' | 'TIMETABLE';
    ignoreId?: number;
  }): Promise<void> {
    /**
     * Phase 2 rule:
     *
     * Timetable is the employee's normal/default working plan.
     * Shift assignment is allowed to exist in the same period because it has
     * higher resolver priority and can override the timetable.
     *
     * We still prevent overlaps inside the same assignment type using:
     * - ensureNoOverlappingShiftAssignment()
     * - ensureNoOverlappingEmployeeTimetable()
     *
     * So this method is kept only for backward compatibility with existing
     * service calls.
     */
    return;
  }

  private async findConflictingEmployeeTimetable(input: {
    companyId: number;
    employeeId: number;
    effectiveFrom: string;
    effectiveTo: string | null;
    ignoreId?: number;
  }): Promise<EmployeeTimetable | null> {
    const qb = this.employeeTimetableRepository
      .createQueryBuilder('employeeTimetable')
      .andWhere('employeeTimetable.status = :status', {
        status: EmployeeTimetableStatusEnum.ACTIVE,
      });

    applyActiveAssignmentOverlapFilter(qb, 'employeeTimetable', input);
    return qb.getOne();
  }

  private async findConflictingShiftAssignment(input: {
    companyId: number;
    employeeId: number;
    effectiveFrom: string;
    effectiveTo: string | null;
    ignoreId?: number;
  }): Promise<ShiftAssignment | null> {
    const qb = this.shiftAssignmentRepository
      .createQueryBuilder('assignment')
      .andWhere('assignment.status = :status', {
        status: ShiftAssignmentStatusEnum.ACTIVE,
      });

    applyActiveAssignmentOverlapFilter(qb, 'assignment', input);
    return qb.getOne();
  }
}
