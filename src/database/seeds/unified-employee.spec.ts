import { EntityManager } from 'typeorm';
import { seedEmployeeNumbering } from './unified-employee';

describe('employee numbering seed', () => {
  const config = { prefix: 'AICL', padding: 3, nextNumber: 1 };
  it('preserves a pre-existing sequence without inspecting employees or updating it', async () => {
    const existsBy = jest.fn().mockResolvedValue(true);
    const manager = {
      getRepository: jest.fn().mockReturnValue({ existsBy }),
    } as unknown as EntityManager;
    await seedEmployeeNumbering(manager, 7, config);
    expect(manager.getRepository).toHaveBeenCalledTimes(1);
  });
  it('requires reconciliation when employees exist without a sequence', async () => {
    const getRepository = jest
      .fn()
      .mockReturnValueOnce({ existsBy: jest.fn().mockResolvedValue(false) })
      .mockReturnValueOnce({ existsBy: jest.fn().mockResolvedValue(true) });
    await expect(
      seedEmployeeNumbering(
        { getRepository } as unknown as EntityManager,
        7,
        config,
      ),
    ).rejects.toThrow(/reconciliation/);
  });
});
