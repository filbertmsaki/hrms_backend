import { In } from 'typeorm';
import { AttendanceMobilePunchRepository } from './attendance-mobile-punch.repository';

describe('AttendanceMobilePunchRepository scoped listing', () => {
  const findAndCount = jest.fn();
  const repository = new AttendanceMobilePunchRepository({
    findAndCount,
  } as never);

  beforeEach(() => {
    findAndCount.mockReset().mockResolvedValue([[], 0]);
  });

  it('constrains a manager query to the authorized employee IDs', async () => {
    await repository.findPaginated(
      17,
      { page: 1, limit: 20 } as never,
      [41, 42],
    );

    const options = findAndCount.mock.calls[0][0] as {
      where: { companyId: number; employeeId: ReturnType<typeof In> };
    };
    expect(options.where.companyId).toBe(17);
    expect(options.where.employeeId.value).toEqual([41, 42]);
  });

  it('keeps an explicitly requested employee within the supplied scope', async () => {
    await repository.findPaginated(
      17,
      { page: 1, limit: 20, employeeId: 42 } as never,
      [41, 42],
    );

    expect(findAndCount.mock.calls[0][0].where.employeeId).toBe(42);
  });

  it('returns an empty page without querying when the authorized scope is empty', async () => {
    await expect(
      repository.findPaginated(17, { page: 1, limit: 20 } as never, []),
    ).resolves.toEqual({
      items: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    expect(findAndCount).not.toHaveBeenCalled();
  });
});
