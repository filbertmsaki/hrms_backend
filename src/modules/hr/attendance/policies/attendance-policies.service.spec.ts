import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AttendancePoliciesService } from './attendance-policies.service';
import { AttendancePolicy } from './entities/attendance-policy.entity';

type MockRepo = Record<string, jest.Mock | { transaction: jest.Mock }>;

const createRepositoryMock = (): MockRepo => ({
  findOne: jest.fn(),
  save: jest.fn((value: unknown) => value),
  create: jest.fn((value: unknown) => value),
  remove: jest.fn((value: unknown) => value),
  createQueryBuilder: jest.fn(),
  manager: {
    transaction: jest.fn(),
  },
});

describe('AttendancePoliciesService', () => {
  let service: AttendancePoliciesService;
  let attendancePolicyRepository: MockRepo;

  beforeEach(() => {
    attendancePolicyRepository = createRepositoryMock();

    service = new AttendancePoliciesService(
      attendancePolicyRepository as unknown as Repository<AttendancePolicy>,
    );
  });

  it('rejects invalid threshold progression before querying duplicates', async () => {
    await expect(
      service.create(10, {
        name: 'Default',
        late_after_minutes: 50,
        half_day_after_minutes: 40,
        absent_after_minutes: 60,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(
      attendancePolicyRepository.createQueryBuilder,
    ).not.toHaveBeenCalled();
  });
});
