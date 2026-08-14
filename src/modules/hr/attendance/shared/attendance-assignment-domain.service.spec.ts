import { ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AttendanceAssignmentDomainService } from './attendance-assignment-domain.service';
import { ShiftAssignment } from '../shift/shift-assignments/entities/shift-assignment.entity';
import { ShiftAssignmentStatusEnum } from '../shift/shift-assignments/enums/shift-assignment-status.enum';
import { EmployeeTimetable } from '../timetable/employee-timetables/entities/employee-timetable.entity';
import { EmployeeTimetableStatusEnum } from '../timetable/employee-timetables/enums/employee-timetable-status.enum';

type MockRepo = Record<string, jest.Mock>;

const createRepositoryMock = (): MockRepo => ({
  createQueryBuilder: jest.fn(),
});

const createQueryBuilderMock = () => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getOne: jest.fn(),
});

describe('AttendanceAssignmentDomainService', () => {
  let service: AttendanceAssignmentDomainService;
  let shiftAssignmentRepository: MockRepo;
  let employeeTimetableRepository: MockRepo;

  beforeEach(() => {
    shiftAssignmentRepository = createRepositoryMock();
    employeeTimetableRepository = createRepositoryMock();

    service = new AttendanceAssignmentDomainService(
      shiftAssignmentRepository as unknown as Repository<ShiftAssignment>,
      employeeTimetableRepository as unknown as Repository<EmployeeTimetable>,
    );
  });

  it('rejects a shift assignment that overlaps an active employee timetable', async () => {
    const timetableBuilder = createQueryBuilderMock();
    employeeTimetableRepository.createQueryBuilder.mockReturnValue(
      timetableBuilder,
    );
    timetableBuilder.getOne.mockResolvedValue({ id: 99 });

    await expect(
      service.ensureNoConflictingAssignmentType({
        companyId: 1,
        employeeId: 10,
        effectiveFrom: '2026-08-01',
        effectiveTo: null,
        status: ShiftAssignmentStatusEnum.ACTIVE,
        assignmentType: 'SHIFT',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects an employee timetable that overlaps an active shift assignment', async () => {
    const shiftBuilder = createQueryBuilderMock();
    shiftAssignmentRepository.createQueryBuilder.mockReturnValue(shiftBuilder);
    shiftBuilder.getOne.mockResolvedValue({ id: 55 });

    await expect(
      service.ensureNoConflictingAssignmentType({
        companyId: 1,
        employeeId: 10,
        effectiveFrom: '2026-08-01',
        effectiveTo: null,
        status: EmployeeTimetableStatusEnum.ACTIVE,
        assignmentType: 'TIMETABLE',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
