import { ForbiddenException } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UsersController } from './users.controller';

type Req = ExpressRequest & { user: AuthenticatedUser };

function makeController() {
  const usersService = {
    findOwnerUsersPaginated: jest.fn().mockResolvedValue({ data: ['owner'] }),
    findAllPaginatedInCompany: jest
      .fn()
      .mockResolvedValue({ data: ['company'] }),
  };
  // Only the list endpoint is exercised; other dependencies are unused.
  const controller = Object.create(
    UsersController.prototype,
  ) as UsersController;
  Object.assign(controller, { usersService });
  return { controller, usersService };
}

const req = (user: Partial<AuthenticatedUser>) =>
  ({
    user: {
      id: 1,
      email: 'a@b.c',
      roles: [],
      permissions: ['users:read'],
      ...user,
    },
  }) as Req;

describe('UsersController.findAll scope', () => {
  it('lists owner accounts only for platform owners', async () => {
    const { controller, usersService } = makeController();
    await expect(
      controller.findAll(req({ scope: 'platform', userType: 'OWNER' }), {}),
    ).resolves.toEqual({ data: ['owner'] });
    expect(usersService.findAllPaginatedInCompany).not.toHaveBeenCalled();
  });

  it('lists the company users for a COMPANY_ADMIN', async () => {
    const { controller, usersService } = makeController();
    await controller.findAll(
      req({
        scope: 'company',
        userType: 'COMPANY_USER',
        companyId: 7,
        roles: ['company_admin'],
      }),
      {},
    );
    expect(usersService.findAllPaginatedInCompany).toHaveBeenCalledWith(7, {});
  });

  it('lets an owner working inside a company list that company', async () => {
    const { controller, usersService } = makeController();
    await controller.findAll(
      req({ scope: 'company', userType: 'OWNER', companyId: 7 }),
      {},
    );
    expect(usersService.findAllPaginatedInCompany).toHaveBeenCalledWith(7, {});
  });

  it('blocks other company users even with users:read', async () => {
    const { controller } = makeController();
    await expect(
      controller.findAll(
        req({
          scope: 'company',
          userType: 'COMPANY_USER',
          companyId: 7,
          roles: ['HR_MANAGER'],
        }),
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
