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

  it('allows a shift assignment to overlap the employee timetable', async () => {
    await expect(
      service.ensureNoConflictingAssignmentType({
        companyId: 1,
        employeeId: 10,
        effectiveFrom: '2026-08-01',
        effectiveTo: null,
        status: ShiftAssignmentStatusEnum.ACTIVE,
        assignmentType: 'SHIFT',
      }),
    ).resolves.toBeUndefined();
    expect(
      employeeTimetableRepository.createQueryBuilder,
    ).not.toHaveBeenCalled();
  });

  it('allows a timetable to overlap a dated shift assignment', async () => {
    await expect(
      service.ensureNoConflictingAssignmentType({
        companyId: 1,
        employeeId: 10,
        effectiveFrom: '2026-08-01',
        effectiveTo: null,
        status: EmployeeTimetableStatusEnum.ACTIVE,
        assignmentType: 'TIMETABLE',
      }),
    ).resolves.toBeUndefined();
    expect(shiftAssignmentRepository.createQueryBuilder).not.toHaveBeenCalled();
  });
});
