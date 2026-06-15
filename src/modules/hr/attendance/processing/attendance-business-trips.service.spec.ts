import { Repository } from 'typeorm';
import { AttendanceBusinessTripsService } from './attendance-business-trips.service';
import { AttendanceBusinessTrip } from './entities/attendance-business-trip.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { AttendanceRecalculationJob } from './entities/attendance-recalculation-job.entity';
import { HrAccessService } from '../../shared/hr-access.service';
import { AttendanceBusinessTripStatusEnum } from './enums/attendance-business-trip-status.enum';
import { AttendanceProcessingJobStatusEnum } from './enums/attendance-processing-job-status.enum';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { SortDirection } from '../../../../common/dto/pagination.dto';

type MockRepo<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const createRepositoryMock = <T>(): MockRepo<T> => ({
  findOne: jest.fn(),
  save: jest.fn(async (value) => value),
  create: jest.fn((value) => value),
  remove: jest.fn(async (value) => value),
  createQueryBuilder: jest.fn(),
});

const createQueryBuilderMock = () => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getOne: jest.fn(),
  getManyAndCount: jest.fn(),
});

describe('AttendanceBusinessTripsService', () => {
  let service: AttendanceBusinessTripsService;
  let businessTripRepository: MockRepo<AttendanceBusinessTrip>;
  let employeeRepository: MockRepo<Employee>;
  let recalculationJobRepository: MockRepo<AttendanceRecalculationJob>;
  let hrAccessService: { assertCanAccessEmployee: jest.Mock };
  let actor: AuthenticatedUser;

  beforeEach(() => {
    businessTripRepository = createRepositoryMock();
    employeeRepository = createRepositoryMock();
    recalculationJobRepository = createRepositoryMock();
    hrAccessService = {
      assertCanAccessEmployee: jest.fn(),
    };
    actor = {
      id: 1,
      email: 'manager@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 10,
      companyMembershipId: 42,
      roles: [],
      permissions: [],
    };

    service = new AttendanceBusinessTripsService(
      businessTripRepository as Repository<AttendanceBusinessTrip>,
      employeeRepository as Repository<Employee>,
      recalculationJobRepository as Repository<AttendanceRecalculationJob>,
      hrAccessService as unknown as HrAccessService,
    );
  });

  it('creates a submitted business trip for an active employee', async () => {
    const overlapBuilder = createQueryBuilderMock();
    overlapBuilder.getOne.mockResolvedValue(null);
    businessTripRepository.createQueryBuilder!.mockReturnValue(overlapBuilder);
    employeeRepository.findOne!.mockResolvedValue({
      id: 501,
      company_user: { company_id: 10 },
      primary_department: null,
      primary_position: null,
      employment_status: EmploymentStatusEnum.ACTIVE,
      exit_date: null,
    });

    const result = await service.create(
      10,
      {
        employee_id: 501,
        start_date: '2026-06-15',
        end_date: '2026-06-17',
        reason: 'Client visit',
        submit: true,
      },
      actor,
    );

    expect(result.status).toBe(AttendanceBusinessTripStatusEnum.SUBMITTED);
    expect(businessTripRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: 501,
        startDate: '2026-06-15',
        endDate: '2026-06-17',
        status: AttendanceBusinessTripStatusEnum.SUBMITTED,
      }),
    );
  });

  it('queues attendance recalculation when a submitted trip is approved', async () => {
    businessTripRepository.findOne!.mockResolvedValue({
      id: 7,
      companyId: 10,
      employeeId: 501,
      startDate: '2026-06-15',
      endDate: '2026-06-17',
      reason: 'Client visit',
      status: AttendanceBusinessTripStatusEnum.SUBMITTED,
      approvedByCompanyUserId: null,
      metadata: null,
    });
    employeeRepository.findOne!.mockResolvedValue({
      id: 501,
      company_user: { company_id: 10 },
      primary_department: null,
      primary_position: null,
      employment_status: EmploymentStatusEnum.ACTIVE,
      exit_date: null,
    });

    const result = await service.approve(
      10,
      7,
      { note: 'Approved by HR' },
      actor,
    );

    expect(result.status).toBe(AttendanceBusinessTripStatusEnum.APPROVED);
    expect(recalculationJobRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 10,
        employeeId: 501,
        dateFrom: '2026-06-15',
        dateTo: '2026-06-17',
        reason: 'Business trip approved',
        status: AttendanceProcessingJobStatusEnum.PENDING,
      }),
    );
  });

  it('queues attendance recalculation when an approved trip is cancelled', async () => {
    businessTripRepository.findOne!.mockResolvedValue({
      id: 8,
      companyId: 10,
      employeeId: 501,
      startDate: '2026-06-20',
      endDate: '2026-06-20',
      reason: 'Site meeting',
      status: AttendanceBusinessTripStatusEnum.APPROVED,
      approvedByCompanyUserId: 42,
      metadata: null,
    });
    employeeRepository.findOne!.mockResolvedValue({
      id: 501,
      company_user: { company_id: 10 },
      primary_department: null,
      primary_position: null,
      employment_status: EmploymentStatusEnum.ACTIVE,
      exit_date: null,
    });

    const result = await service.cancel(
      10,
      8,
      { reason: 'Postponed' },
      actor,
    );

    expect(result.status).toBe(AttendanceBusinessTripStatusEnum.CANCELLED);
    expect(recalculationJobRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 10,
        employeeId: 501,
        dateFrom: '2026-06-20',
        dateTo: '2026-06-20',
        reason: 'Business trip cancelled',
      }),
    );
  });

  it('maps created_at to createdAt when listing business trips', async () => {
    const qb = createQueryBuilderMock();
    qb.getManyAndCount.mockResolvedValue([[], 0]);
    businessTripRepository.createQueryBuilder!.mockReturnValue(qb);

    await service.findAll(10, {
      page: 1,
      limit: 20,
      sortBy: 'created_at',
      sortOrder: SortDirection.DESC,
    });

    expect(qb.orderBy).toHaveBeenCalledWith('trip.createdAt', 'DESC');
    expect(qb.getManyAndCount).toHaveBeenCalled();
  });
});
