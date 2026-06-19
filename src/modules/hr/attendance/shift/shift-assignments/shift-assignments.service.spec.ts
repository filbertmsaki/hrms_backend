import { ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ShiftAssignmentsService } from './shift-assignments.service';
import { ShiftAssignment } from './entities/shift-assignment.entity';
import { Shift } from '../shifts/entities/shift.entity';
import { Employee } from '../../../employees/entities/employee.entity';
import { ShiftRotationGroup } from '../shift-rotation-groups/entities/shift-rotation-group.entity';
import { ShiftAssignmentStatusEnum } from './enums/shift-assignment-status.enum';
import { AttendanceAssignmentDomainService } from '../../shared/attendance-assignment-domain.service';

type MockRepo<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const createRepositoryMock = <T>(): MockRepo<T> => ({
  findOne: jest.fn(),
  save: jest.fn(async (value) => value),
  create: jest.fn((value) => value),
  remove: jest.fn(async (value) => value),
  createQueryBuilder: jest.fn(),
});

const createQueryBuilderMock = () => ({
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  addOrderBy: jest.fn().mockReturnThis(),
  getOne: jest.fn(),
});

describe('ShiftAssignmentsService', () => {
  let service: ShiftAssignmentsService;
  let shiftAssignmentRepository: MockRepo<ShiftAssignment>;
  let shiftRepository: MockRepo<Shift>;
  let employeeRepository: MockRepo<Employee>;
  let rotationGroupRepository: MockRepo<ShiftRotationGroup>;
  let attendanceAssignmentDomainService: {
    ensureNoOverlappingShiftAssignment: jest.Mock;
    ensureNoConflictingAssignmentType: jest.Mock;
  };

  beforeEach(() => {
    shiftAssignmentRepository = createRepositoryMock();
    shiftRepository = createRepositoryMock();
    employeeRepository = createRepositoryMock();
    rotationGroupRepository = createRepositoryMock();
    attendanceAssignmentDomainService = {
      ensureNoOverlappingShiftAssignment: jest.fn(),
      ensureNoConflictingAssignmentType: jest.fn(),
    };

    service = new ShiftAssignmentsService(
      shiftAssignmentRepository as unknown as Repository<ShiftAssignment>,
      shiftRepository as unknown as Repository<Shift>,
      employeeRepository as unknown as Repository<Employee>,
      rotationGroupRepository as unknown as Repository<ShiftRotationGroup>,
      attendanceAssignmentDomainService as unknown as AttendanceAssignmentDomainService,
    );
  });

  it('rejects overlapping active shift assignments for the same employee', async () => {
    const employeeBuilder = createQueryBuilderMock();
    const overlapBuilder = createQueryBuilderMock();

    employeeRepository.createQueryBuilder!.mockReturnValue(employeeBuilder);
    employeeBuilder.getOne.mockResolvedValue({ id: 9 });
    shiftRepository.findOne!.mockResolvedValue({ id: 4 });
    attendanceAssignmentDomainService.ensureNoOverlappingShiftAssignment.mockRejectedValue(
      new ConflictException(),
    );

    await expect(
      service.create(10, {
        employee_id: 9,
        shift_id: 4,
        effective_from: '2026-06-01',
        effective_to: '2026-06-30',
        status: ShiftAssignmentStatusEnum.ACTIVE,
      }),
    ).rejects.toThrow(ConflictException);

    expect(
      attendanceAssignmentDomainService.ensureNoOverlappingShiftAssignment,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 10,
        employeeId: 9,
        status: ShiftAssignmentStatusEnum.ACTIVE,
      }),
    );
  });
});
