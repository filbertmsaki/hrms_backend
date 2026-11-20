import { CreateAccessReconciliationOperations1797900040000 } from '../../../../database/migrations/1797900040000-CreateAccessReconciliationOperations';

describe('reconciliation operation migration', () => {
  it('does not discard existing operation history during rollback', async () => {
    const query = jest.fn().mockResolvedValue([{ count: '1' }]);
    await expect(
      new CreateAccessReconciliationOperations1797900040000().down({
        query,
      } as never),
    ).rejects.toThrow('Cannot remove access reconciliation history');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
