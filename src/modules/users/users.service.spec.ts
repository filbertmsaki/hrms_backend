import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CompanyUser } from '../companies/entities/company-user.entity';
import { CompaniesService } from '../companies/companies.service';
import { DefaultAvatarsService } from '../hr/default-avatars/default-avatars.service';
import { Employee } from '../hr/employees/entities/employee.entity';
import { ProfileImageSourceEnum } from '../hr/employees/enums/profile-image-source.enum';
import { Permission } from '../permissions/entities/permission.entity';
import { Role } from '../roles/entities/role.entity';
import { AuthSessionsService } from '../auth/auth-sessions.service';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

describe('UsersService avatar management', () => {
  let service: UsersService;
  let userRepository: {
    findOne: jest.Mock;
    manager: {
      getRepository: jest.Mock;
    };
  };
  let employeeRepository: {
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let defaultAvatarsService: {
    assertAvatarAvailableForEmployee: jest.Mock;
  };

  beforeEach(() => {
    userRepository = {
      findOne: jest.fn(),
      manager: {
        getRepository: jest.fn(),
      },
    };
    employeeRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    defaultAvatarsService = {
      assertAvatarAvailableForEmployee: jest.fn(),
    };

    service = new UsersService(
      userRepository as unknown as Repository<User>,
      employeeRepository as unknown as Repository<Employee>,
      {} as Repository<Role>,
      {} as Repository<Permission>,
      {} as CompaniesService,
      defaultAvatarsService as unknown as DefaultAvatarsService,
      {} as AuthSessionsService,
      {} as ConfigService,
    );
  });

  it('loads role permissions when resolving a user for request authorization', async () => {
    userRepository.findOne.mockResolvedValue({ id: 1 } as User);

    await service.findById(1);

    expect(userRepository.findOne).toHaveBeenCalledWith({
      where: { id: 1 },
      relations: ['roles', 'roles.permissions', 'permissions'],
    });
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

describe('UsersService employee import provisioning', () => {
  let service: UsersService;
  let userRepository: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    manager: {
      getRepository: jest.Mock;
    };
  };
  let companyUserRepository: {
    findOne: jest.Mock;
  };
  let companiesService: {
    addUserToCompany: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };

  beforeEach(() => {
    companyUserRepository = {
      findOne: jest.fn(),
    };
    userRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn((value: unknown) => value),
      manager: {
        getRepository: jest.fn((entity: unknown) => {
          if (entity === CompanyUser) {
            return companyUserRepository;
          }
          return {};
        }),
      },
    };
    companiesService = {
      addUserToCompany: jest.fn().mockResolvedValue(undefined),
    };
    configService = {
      get: jest
        .fn()
        .mockImplementation((key: string) =>
          key === 'EMPLOYEE_IMPORT_DEFAULT_PASSWORD'
            ? 'ImportedEmployee!2026'
            : undefined,
        ),
    };

    service = new UsersService(
      userRepository as unknown as Repository<User>,
      {} as Repository<Employee>,
      {} as Repository<Role>,
      {} as Repository<Permission>,
      companiesService as unknown as CompaniesService,
      {} as DefaultAvatarsService,
      {} as AuthSessionsService,
      configService as unknown as ConfigService,
    );
  });

  it('creates a new active user for employee import when no account exists', async () => {
    userRepository.findOne.mockResolvedValue(null);
    userRepository.save.mockResolvedValue({
      id: 71,
      email: 'new.import@example.com',
    });
    companyUserRepository.findOne.mockResolvedValue({
      id: 18,
      company_id: 10,
      user_id: 71,
      status: 'active',
    });
    jest
      .spyOn(service as never, 'generateUserNo')
      .mockResolvedValue('USER-2026-00001');
    jest
      .spyOn(service as never, 'generateImportPlaceholderPhone')
      .mockResolvedValue('+999123456789');

    const result = await service.ensureEmployeeImportAccount(10, {
      email: 'new.import@example.com',
      firstName: 'New',
      lastName: 'Import',
      roleNames: ['EMPLOYEE'],
    });

    expect(userRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        user_no: 'USER-2026-00001',
        email: 'new.import@example.com',
        status: 'active',
        is_email_verified: false,
        must_set_password: true,
        account_provisioning_status: 'active',
      }),
    );
    expect(companiesService.addUserToCompany).toHaveBeenCalledWith(
      71,
      10,
      { roleNames: ['EMPLOYEE'] },
      undefined,
    );
    expect(result.action).toBe('CREATED');
    expect(result.membership.user_id).toBe(71);
  });

  it('reuses an existing user account during employee import instead of creating a duplicate', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 81,
      email: 'existing.import@example.com',
      status: 'active',
      user_type: 'COMPANY_USER',
      is_email_verified: true,
      must_set_password: false,
      activated_at: new Date('2026-08-10T10:00:00.000Z'),
      account_provisioning_status: 'active',
    });
    companyUserRepository.findOne.mockResolvedValue({
      id: 28,
      company_id: 10,
      user_id: 81,
      status: 'active',
    });

    const result = await service.ensureEmployeeImportAccount(10, {
      email: 'existing.import@example.com',
      firstName: 'Existing',
      lastName: 'Import',
      roleNames: ['EMPLOYEE'],
    });

    expect(userRepository.save).not.toHaveBeenCalled();
    expect(companiesService.addUserToCompany).toHaveBeenCalledWith(
      81,
      10,
      { roleNames: ['EMPLOYEE'] },
      undefined,
    );
    expect(result.action).toBe('REUSED');
    expect(result.membership.user_id).toBe(81);
  });
});

describe('UsersService administrator password resets', () => {
  it('resets a company user password, requires a change, and revokes sessions', async () => {
    const userRepository = {
      update: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      }),
      manager: { getRepository: jest.fn() },
    } as unknown as Repository<User>;
    const companiesService = {
      findCompanyUserContext: jest.fn().mockResolvedValue({}),
    } as unknown as CompaniesService;
    const authSessionsService = {
      revokeAllSessionsForUser: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthSessionsService;
    const service = new UsersService(
      userRepository,
      {} as Repository<Employee>,
      {} as Repository<Role>,
      {} as Repository<Permission>,
      companiesService,
      {} as DefaultAvatarsService,
      authSessionsService,
      {} as ConfigService,
    );

    const result = await service.resetPasswordInCompany(
      7,
      12,
      'N3wP@ssw0rd#2026',
    );

    expect(companiesService.findCompanyUserContext).toHaveBeenCalledWith(7, 12);
    expect(userRepository.update).toHaveBeenCalledWith(
      12,
      expect.objectContaining({
        password: expect.any(String),
        must_set_password: true,
      }),
    );
    expect(authSessionsService.revokeAllSessionsForUser).toHaveBeenCalledWith(
      12,
      'all_sessions_revoked',
    );
    expect(result.message).toContain('must change');
  });
});
