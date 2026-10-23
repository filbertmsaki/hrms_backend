import { EntityManager, Repository } from 'typeorm';
import { ActivityCategory } from '../entities/activity-config.entities';
import { provisionStandardActivityCategories } from './activity-category-catalog';

describe('standard activity category provisioning', () => {
  it('skips existing stable codes regardless of code casing and never updates them', async () => {
    let inserted: Array<Record<string, unknown>> = [];
    const builder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawMany: jest
        .fn()
        .mockResolvedValue([
          { code: 'CLIENT_MEETING' },
          { code: 'SPECIAL_ASSIGNMENT' },
        ]),
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn((rows) => {
        inserted = rows;
        return builder;
      }),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ identifiers: Array(15).fill({}) }),
    };
    const repository = {
      createQueryBuilder: jest.fn(() => builder),
    } as unknown as Repository<ActivityCategory>;
    const manager = {
      getRepository: jest.fn(() => repository),
    } as unknown as EntityManager;

    const created = await provisionStandardActivityCategories(manager, 41);

    expect(created).toBe(15);
    expect(inserted).toHaveLength(15);
    expect(inserted.map((row) => row.code)).not.toContain('CLIENT_MEETING');
    expect(inserted.map((row) => row.code)).not.toContain('SPECIAL_ASSIGNMENT');
    expect(repository).not.toHaveProperty('save');
    expect(builder.orIgnore).toHaveBeenCalled();
  });
});
