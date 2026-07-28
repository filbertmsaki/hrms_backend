import { Repository } from 'typeorm';
import { CompaniesService } from '../companies/companies.service';
import { DefaultAvatarsService } from '../hr/default-avatars/default-avatars.service';
import { Employee } from '../hr/employees/entities/employee.entity';
import { ProfileImageSourceEnum } from '../hr/employees/enums/profile-image-source.enum';
import { Permission } from '../permissions/entities/permission.entity';
import { Role } from '../roles/entities/role.entity';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

describe('UsersService avatar management', () => {
  let service: UsersService;
  let employeeRepository: {
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let defaultAvatarsService: {
    assertAvatarAvailableForEmployee: jest.Mock;
  };

  beforeEach(() => {
    employeeRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    defaultAvatarsService = {
      assertAvatarAvailableForEmployee: jest.fn(),
    };

    service = new UsersService(
      {
        manager: {
          getRepository: jest.fn(),
        },
      } as unknown as Repository<User>,
      employeeRepository as unknown as Repository<Employee>,
      {} as Repository<Role>,
      {} as Repository<Permission>,
      {} as CompaniesService,
      defaultAvatarsService as unknown as DefaultAvatarsService,
    );
  });

  it('lets a user select an avatar for themselves without changing the uploaded profile picture', async () => {
    const selectedAvatar = {
      id: 22,
      image_path: '/uploads/default-avatars/company-7/avatar-22.png',
      file_extension: 'png',
      mime_type: 'image/png',
    };
    defaultAvatarsService.assertAvatarAvailableForEmployee.mockResolvedValue(
      selectedAvatar,
    );
    const employee = {
      id: 15,
      gender: 'female',
      profile_photo_url: '/uploads/profile-photos/company-7/employee-15.webp',
      default_avatar_id: null,
      default_avatar: null,
      profile_image_source: ProfileImageSourceEnum.UPLOADED,
    } as Employee & { gender: string };

    jest
      .spyOn(service as never, 'findCompanyEmployeeOrFail')
      .mockResolvedValue({ membership: { id: 11 }, employee });
    jest
      .spyOn(service, 'findMyProfileById')
      .mockResolvedValue({ id: 9 } as never);

    await service.updateMySelectedAvatar(7, 9, selectedAvatar.id);

    expect(
      defaultAvatarsService.assertAvatarAvailableForEmployee,
    ).toHaveBeenCalledWith(7, selectedAvatar.id, 'female');
    expect(employeeRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        default_avatar_id: selectedAvatar.id,
        profile_photo_url: '/uploads/profile-photos/company-7/employee-15.webp',
        profile_image_source: ProfileImageSourceEnum.DEFAULT_AVATAR,
      }),
    );
  });

  it('replaces the selected avatar id when a user changes avatars', async () => {
    const selectedAvatar = {
      id: 22,
      image_path: '/uploads/default-avatars/company-7/avatar-22.jpg',
      file_extension: 'jpg',
      mime_type: 'image/jpeg',
    };
    defaultAvatarsService.assertAvatarAvailableForEmployee.mockResolvedValue(
      selectedAvatar,
    );
    const employee = {
      id: 15,
      gender: 'male',
      profile_photo_url: '/uploads/profile-photos/company-7/employee-15.webp',
      default_avatar_id: 10,
      default_avatar: { id: 10 },
      profile_image_source: ProfileImageSourceEnum.DEFAULT_AVATAR,
    } as Employee & { gender: string };

    jest
      .spyOn(service as never, 'findCompanyEmployeeOrFail')
      .mockResolvedValue({ membership: { id: 11 }, employee });
    jest
      .spyOn(service, 'findMyProfileById')
      .mockResolvedValue({ id: 9 } as never);

    await service.updateMySelectedAvatar(7, 9, selectedAvatar.id);

    expect(employeeRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        default_avatar_id: selectedAvatar.id,
      }),
    );
  });

  it('removes the selected avatar and restores the uploaded profile picture as the displayed source', async () => {
    const selectedAvatar = {
      id: 22,
      image_path: '/uploads/default-avatars/company-7/avatar-22.svg',
      file_extension: 'svg',
      mime_type: 'image/svg+xml',
    };
    const employee = {
      id: 15,
      gender: 'male',
      profile_photo_url: '/uploads/profile-photos/company-7/employee-15.webp',
      default_avatar_id: selectedAvatar.id,
      default_avatar: selectedAvatar,
      profile_image_source: ProfileImageSourceEnum.DEFAULT_AVATAR,
    } as Employee & { gender: string };

    jest
      .spyOn(service as never, 'findCompanyEmployeeOrFail')
      .mockResolvedValue({ membership: { id: 11 }, employee });
    jest
      .spyOn(service, 'findMyProfileById')
      .mockResolvedValue({ id: 9 } as never);

    await service.clearMySelectedAvatar(7, 9);

    expect(employeeRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        default_avatar_id: null,
        default_avatar: null,
        profile_photo_url: '/uploads/profile-photos/company-7/employee-15.webp',
        profile_image_source: ProfileImageSourceEnum.UPLOADED,
      }),
    );
  });

  it('allows multiple users to reference the same avatar record', async () => {
    const selectedAvatar = {
      id: 22,
      image_path: '/uploads/default-avatars/company-7/avatar-22.svg',
      file_extension: 'svg',
      mime_type: 'image/svg+xml',
    };
    defaultAvatarsService.assertAvatarAvailableForEmployee.mockResolvedValue(
      selectedAvatar,
    );
    const firstEmployee = {
      id: 15,
      gender: 'male',
      profile_photo_url: null,
      default_avatar_id: null,
      default_avatar: null,
      profile_image_source: null,
    } as Employee & { gender: string };
    const secondEmployee = {
      id: 16,
      gender: 'female',
      profile_photo_url: null,
      default_avatar_id: null,
      default_avatar: null,
      profile_image_source: null,
    } as Employee & { gender: string };

    jest
      .spyOn(service as never, 'findCompanyEmployeeOrFail')
      .mockResolvedValueOnce({
        membership: { id: 11 },
        employee: firstEmployee,
      })
      .mockResolvedValueOnce({
        membership: { id: 12 },
        employee: secondEmployee,
      });
    jest
      .spyOn(service, 'findProfileInCompany')
      .mockResolvedValue({ id: 1 } as never);

    await service.updateUserSelectedAvatar(7, 91, selectedAvatar.id);
    await service.updateUserSelectedAvatar(7, 92, selectedAvatar.id);

    expect(employeeRepository.save).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: 15,
        default_avatar_id: selectedAvatar.id,
      }),
    );
    expect(employeeRepository.save).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: 16,
        default_avatar_id: selectedAvatar.id,
      }),
    );
  });

  it.each([
    ['image/png', 'png'],
    ['image/jpeg', 'jpg'],
    ['image/svg+xml', 'svg'],
  ])(
    'selects an existing %s avatar by id without any re-upload flow',
    async (mimeType, fileExtension) => {
      const selectedAvatar = {
        id: 44,
        image_path: `/uploads/default-avatars/company-7/avatar-44.${fileExtension}`,
        file_extension: fileExtension,
        mime_type: mimeType,
      };
      defaultAvatarsService.assertAvatarAvailableForEmployee.mockResolvedValue(
        selectedAvatar,
      );
      const employee = {
        id: 15,
        gender: 'neutral',
        profile_photo_url: null,
        default_avatar_id: null,
        default_avatar: null,
        profile_image_source: null,
      } as Employee & { gender: string };

      jest
        .spyOn(service as never, 'findCompanyEmployeeOrFail')
        .mockResolvedValue({ membership: { id: 11 }, employee });
      jest
        .spyOn(service, 'findMyProfileById')
        .mockResolvedValue({ id: 9 } as never);

      await service.updateMySelectedAvatar(7, 9, selectedAvatar.id);

      expect(
        defaultAvatarsService.assertAvatarAvailableForEmployee,
      ).toHaveBeenCalledWith(7, selectedAvatar.id, 'neutral');
      expect(employeeRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          default_avatar_id: selectedAvatar.id,
        }),
      );
    },
  );
});
