import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
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

  private getShiftAssignmentRepository(
    manager?: EntityManager,
  ): Repository<ShiftAssignment> {
    return (
      manager?.getRepository(ShiftAssignment) ?? this.shiftAssignmentRepository
    );
  }

  private getEmployeeTimetableRepository(
    manager?: EntityManager,
  ): Repository<EmployeeTimetable> {
    return (
      manager?.getRepository(EmployeeTimetable) ??
      this.employeeTimetableRepository
    );
  }

  async ensureNoOverlappingShiftAssignment(input: {
    companyId: number;
    employeeId: number;
    effectiveFrom: string;
    effectiveTo: string | null;
    status: ShiftAssignmentStatusEnum;
    ignoreId?: number;
    manager?: EntityManager;
  }): Promise<void> {
    if (input.status !== ShiftAssignmentStatusEnum.ACTIVE) {
      return;
    }

    const qb = this.getShiftAssignmentRepository(input.manager)
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
    manager?: EntityManager;
  }): Promise<void> {
    if (input.status !== EmployeeTimetableStatusEnum.ACTIVE) {
      return;
    }

    const qb = this.getEmployeeTimetableRepository(input.manager)
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

  ensureNoConflictingAssignmentType(input: {
    companyId: number;
    employeeId: number;
    effectiveFrom: string;
    effectiveTo: string | null;
    status: ShiftAssignmentStatusEnum | EmployeeTimetableStatusEnum;
    assignmentType: 'SHIFT' | 'TIMETABLE';
    ignoreId?: number;
    manager?: EntityManager;
  }): Promise<void> {
    if (
      input.assignmentType === 'SHIFT' &&
      input.status !== ShiftAssignmentStatusEnum.ACTIVE
    ) {
      return Promise.resolve();
    }

    if (
      input.assignmentType === 'TIMETABLE' &&
      input.status !== EmployeeTimetableStatusEnum.ACTIVE
    ) {
      return Promise.resolve();
    }

    // A timetable defines the employee's regular pattern; dated shift
    // assignments can coexist and take precedence for their effective dates.
    return Promise.resolve();
  }
}
