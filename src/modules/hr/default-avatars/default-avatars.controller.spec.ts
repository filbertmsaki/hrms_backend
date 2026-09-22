import { DefaultAvatarsController } from './default-avatars.controller';
import { DefaultAvatarsService } from './default-avatars.service';
import { DefaultAvatarGenderEnum } from './enums/default-avatar-gender.enum';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';

describe('DefaultAvatarsController', () => {
  let controller: DefaultAvatarsController;
  let service: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    setDefault: jest.Mock;
    delete: jest.Mock;
  };

  const user: AuthenticatedUser = {
    id: 5,
    email: 'admin@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: 31,
    companyMembershipId: 62,
    roles: ['Admin'],
    permissions: [
      'default_avatars:read',
      'default_avatars:create',
      'default_avatars:update',
      'default_avatars:delete',
    ],
  };

  beforeEach(() => {
    service = {
      findAll: jest.fn().mockResolvedValue([{ id: 8 }]),
      findOne: jest.fn().mockResolvedValue({ id: 8 }),
      create: jest.fn().mockResolvedValue({ id: 9 }),
      update: jest.fn().mockResolvedValue({ id: 8, avatar_name: 'Updated' }),
      setDefault: jest.fn().mockResolvedValue({ id: 8, is_default: true }),
      delete: jest.fn().mockResolvedValue({ message: 'deleted' }),
    };
    controller = new DefaultAvatarsController(
      service as unknown as DefaultAvatarsService,
    );
  });

  it('routes list and detail calls with the authenticated company id', async () => {
    await expect(
      controller.findAll({ user } as never, {
        gender_category: DefaultAvatarGenderEnum.NEUTRAL,
      }),
    ).resolves.toEqual([{ id: 8 }]);
    expect(service.findAll).toHaveBeenCalledWith(
      31,
      expect.objectContaining({
        gender_category: DefaultAvatarGenderEnum.NEUTRAL,
      }),
    );

    await expect(controller.findOne({ user } as never, 8)).resolves.toEqual({
      id: 8,
    });
    expect(service.findOne).toHaveBeenCalledWith(31, 8);
  });

  it('routes create/update/default/delete mutations with tenant scope', async () => {
    await expect(
      controller.create({ user } as never, {
        avatar_name: 'Neutral',
        gender_category: DefaultAvatarGenderEnum.NEUTRAL,
      }),
    ).resolves.toEqual({ id: 9 });
    expect(service.create).toHaveBeenCalledWith(
      31,
      expect.objectContaining({ avatar_name: 'Neutral' }),
    );

    await expect(
      controller.update({ user } as never, 8, { avatar_name: 'Updated' }),
    ).resolves.toEqual({ id: 8, avatar_name: 'Updated' });
    expect(service.update).toHaveBeenCalledWith(
      31,
      8,
      expect.objectContaining({ avatar_name: 'Updated' }),
    );

    await expect(controller.setDefault({ user } as never, 8)).resolves.toEqual({
      id: 8,
      is_default: true,
    });
    expect(service.setDefault).toHaveBeenCalledWith(31, 8);

    await expect(controller.remove({ user } as never, 8)).resolves.toEqual({
      message: 'deleted',
    });
    expect(service.delete).toHaveBeenCalledWith(31, 8);
  });
});
