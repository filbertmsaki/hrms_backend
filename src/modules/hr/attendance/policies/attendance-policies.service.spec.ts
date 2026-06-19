import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AttendancePoliciesService } from './attendance-policies.service';
import { AttendancePolicy } from './entities/attendance-policy.entity';

type MockRepo<T> = Partial<Record<keyof Repository<T>, jest.Mock>> & {
  manager?: { transaction: jest.Mock };
};

const createRepositoryMock = <T>(): MockRepo<T> => ({
  findOne: jest.fn(),
  save: jest.fn(async (value) => value),
  create: jest.fn((value) => value),
  remove: jest.fn(async (value) => value),
  createQueryBuilder: jest.fn(),
  manager: {
    transaction: jest.fn(),
  },
});

describe('AttendancePoliciesService', () => {
  let service: AttendancePoliciesService;
  let attendancePolicyRepository: MockRepo<AttendancePolicy>;

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

    expect(attendancePolicyRepository.createQueryBuilder).not.toHaveBeenCalled();
  });
});
