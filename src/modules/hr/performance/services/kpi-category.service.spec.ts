import { ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../../shared/hr-access.service';
import { KpiCategory } from '../entities/kpi-category.entity';
import { CreateKpiCategoryDto } from '../dto/create-kpi-category.dto';
import { KpiCategoryService } from './kpi-category.service';

describe('KpiCategoryService', () => {
  const actor = {} as AuthenticatedUser;
  const access = { ensureActorCompanyId: jest.fn() };
  const insert = {
    insert: jest.fn(),
    values: jest.fn(),
    orIgnore: jest.fn(),
    execute: jest.fn(),
  };
  const repository = {
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOneByOrFail: jest.fn(),
    findOneBy: jest.fn(),
    delete: jest.fn(),
  };
  let service: KpiCategoryService;
  beforeEach(() => {
    jest.resetAllMocks();
    access.ensureActorCompanyId.mockReturnValue(7);
    insert.insert.mockReturnValue(insert);
    insert.values.mockReturnValue(insert);
    insert.orIgnore.mockReturnValue(insert);
    insert.execute.mockResolvedValue({});
    repository.createQueryBuilder.mockReturnValue(insert);
    repository.create.mockImplementation((value) => value);
    service = new KpiCategoryService(
      access as unknown as HrAccessService,
      repository as unknown as Repository<KpiCategory>,
    );
  });
  it('uses the authenticated company and includes Delivery and Quality defaults', async () => {
    repository.find.mockResolvedValue([
      { name: 'Delivery' },
      { name: 'Quality' },
    ]);
    expect(await service.list(actor)).toEqual([
      { name: 'Delivery' },
      { name: 'Quality' },
    ]);
    expect(insert.values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ companyId: 7, name: 'Delivery' }),
        expect.objectContaining({ companyId: 7, name: 'Quality' }),
      ]),
    );
    expect(repository.find).toHaveBeenCalledWith({
      where: { companyId: 7 },
      order: { name: 'ASC' },
    });
    access.ensureActorCompanyId.mockReturnValue(8);
    await service.list(actor);
    expect(repository.find).toHaveBeenLastCalledWith({
      where: { companyId: 8 },
      order: { name: 'ASC' },
    });
  });
  it('turns concurrent duplicate-name conflicts into a descriptive 409', async () => {
    repository.save.mockRejectedValue({ driverError: { code: '23505' } });
    await expect(service.create(actor, { name: ' delivery ' })).rejects.toThrow(
      ConflictException,
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 7,
        name: 'delivery',
        normalizedName: 'delivery',
      }),
    );
  });
  it('reuses the canonical name for legacy free-text KPI clients', async () => {
    repository.findOneByOrFail.mockResolvedValue({ name: 'Quality' });
    expect(await service.resolve(actor, ' QUALITY ')).toBe('Quality');
    expect(repository.findOneByOrFail).toHaveBeenCalledWith({
      companyId: 7,
      normalizedName: 'quality',
    });
    expect(await service.resolve(actor, '')).toBeNull();
  });
  it('validates names and description bounds before category creation', async () => {
    const dto = plainToInstance(CreateKpiCategoryDto, {
      name: '   ',
      description: 'a'.repeat(501),
    });
    expect((await validate(dto)).map((error) => error.property).sort()).toEqual(
      ['description', 'name'],
    );
    const valid = plainToInstance(CreateKpiCategoryDto, {
      name: ' Customer   service ',
    });
    expect(valid.name).toBe('Customer service');
    expect(await validate(valid)).toEqual([]);
  });
  it('protects defaults but allows their descriptions to change', async () => {
    repository.findOneBy.mockResolvedValue({
      id: 1,
      companyId: 7,
      name: 'Delivery',
      normalizedName: 'delivery',
      description: null,
    });
    await expect(
      service.update(actor, 1, { name: 'Shipping' }),
    ).rejects.toThrow('Default category names cannot be changed');
    await expect(service.remove(actor, 1)).rejects.toThrow(
      'default categories',
    );
    expect(repository.delete).not.toHaveBeenCalled();
    repository.save.mockImplementation(async (category) => category);
    expect(
      await service.update(actor, 1, {
        name: 'Delivery',
        description: 'On-time work',
      }),
    ).toEqual(
      expect.objectContaining({
        name: 'Delivery',
        description: 'On-time work',
      }),
    );
  });
  it('reports categories in use and scopes deletion to the actor company', async () => {
    repository.findOneBy.mockResolvedValue({
      id: 4,
      companyId: 7,
      name: 'Safety',
      normalizedName: 'safety',
    });
    repository.delete.mockRejectedValue({ driverError: { code: '23001' } });
    await expect(service.remove(actor, 4)).rejects.toThrow('used by a KPI');
    expect(repository.delete).toHaveBeenCalledWith({ id: 4, companyId: 7 });
    repository.delete.mockResolvedValue({ affected: 1 });
    expect(await service.remove(actor, 4)).toEqual({ deleted: true });
  });
  it('normalizes renames and handles duplicate names', async () => {
    repository.findOneBy.mockResolvedValue({
      id: 4,
      companyId: 7,
      name: 'Safety',
      normalizedName: 'safety',
    });
    repository.save.mockRejectedValue({ driverError: { code: '23505' } });
    await expect(
      service.update(actor, 4, { name: ' Customer   care ' }),
    ).rejects.toThrow('name already exists');
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Customer care',
        normalizedName: 'customer care',
      }),
    );
  });
});
