import { AttendanceWorkFromHomeReviewDecisionEnum } from './dtos/review-attendance-work-from-home-request.dto';
import { AttendanceWorkFromHomeRequest } from './entities/attendance-work-from-home-request.entity';
import { AttendanceWorkFromHomeStatusEnum } from './enums/attendance-work-from-home-status.enum';
import { AttendanceWorkFromHomeService } from './attendance-work-from-home.service';

describe('AttendanceWorkFromHomeService', () => {
  const createBuilder = () => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getMany: jest.fn(),
  });

  const buildService = () => {
    const builder = createBuilder();
    const repository = {
      createQueryBuilder: jest.fn(() => builder),
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => ({ id: 20, ...data })),
      findOne: jest.fn(),
      update: jest.fn(),
    };
    return {
      service: new AttendanceWorkFromHomeService(repository as never),
      builder,
      repository,
    };
  };

  it('creates a pending request only when the date range does not overlap an active request', async () => {
    const { service, builder, repository } = buildService();
    builder.getOne.mockResolvedValue(null);

    const result = await service.createRequest(4, 9, {
      start_date: '2026-11-02',
      end_date: '2026-11-03',
      reason: 'Home repair appointment',
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 20,
        company_id: 4,
        employee_id: 9,
        status: AttendanceWorkFromHomeStatusEnum.PENDING,
      }),
    );
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: '2026-11-02',
        endDate: '2026-11-03',
      }),
    );
  });

  it('rejects invalid date ranges and overlapping approved or pending requests', async () => {
    const { service, builder } = buildService();
    await expect(
      service.createRequest(4, 9, {
        start_date: '2026-11-03',
        end_date: '2026-11-02',
        reason: 'Request',
      }),
    ).rejects.toThrow('end_date must be on or after start_date');

    builder.getOne.mockResolvedValue({ id: 5 });
    await expect(
      service.createRequest(4, 9, {
        start_date: '2026-11-02',
        end_date: '2026-11-03',
        reason: 'Request',
      }),
    ).rejects.toThrow('already covers part of these dates');
  });

  it('rejects a blank work-from-home reason', async () => {
    const { service } = buildService();
    await expect(
      service.createRequest(4, 9, {
        start_date: '2026-11-02',
        end_date: '2026-11-02',
        reason: '   ',
      }),
    ).rejects.toThrow('reason must not be empty');
  });

  it('requires a reason for rejection and saves reviewer/audit fields for approval', async () => {
    const { service, repository } = buildService();
    const pending: Partial<AttendanceWorkFromHomeRequest> = {
      id: 6,
      companyId: 4,
      employeeId: 9,
      startDate: '2026-11-02',
      endDate: '2026-11-02',
      reason: 'Home repair',
      status: AttendanceWorkFromHomeStatusEnum.PENDING,
      employee: { company_user_id: 17 } as never,
    };
    repository.findOne.mockResolvedValue(pending);
    repository.update.mockResolvedValue({ affected: 1 });

    await expect(
      service.reviewRequest(4, 6, 22, {
        decision: AttendanceWorkFromHomeReviewDecisionEnum.REJECT,
      }),
    ).rejects.toThrow('A comment is required when rejecting');

    const approved = await service.reviewRequest(4, 6, 22, {
      decision: AttendanceWorkFromHomeReviewDecisionEnum.APPROVE,
    });
    expect(repository.update).toHaveBeenCalledWith(
      { id: 6, companyId: 4, status: AttendanceWorkFromHomeStatusEnum.PENDING },
      expect.objectContaining({
        status: AttendanceWorkFromHomeStatusEnum.APPROVED,
        reviewedByCompanyUserId: 22,
        reviewedAt: expect.any(Date),
      }),
    );
    expect(approved.status).toBe(AttendanceWorkFromHomeStatusEnum.APPROVED);
  });

  it('only allows remote attendance on a date covered by an approved request', async () => {
    const { service, builder } = buildService();
    builder.getOne.mockResolvedValue({ id: 6 });
    await expect(
      service.assertApprovedForDate(4, 9, '2026-11-02'),
    ).resolves.toBeUndefined();

    builder.getOne.mockResolvedValue(null);
    await expect(
      service.assertApprovedForDate(4, 9, '2026-11-03'),
    ).rejects.toThrow('An approved work-from-home request is required');
  });
});
