import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { ProfileImageSourceEnum } from '../employees/enums/profile-image-source.enum';
import { FilesService } from '../../files/files.service';
import { ImageProcessingService } from '../../files/image-processing.service';
import { DefaultAvatarsService } from './default-avatars.service';
import { DefaultAvatar } from './entities/default-avatar.entity';
import { DefaultAvatarGenderEnum } from './enums/default-avatar-gender.enum';
import { DefaultAvatarStatusEnum } from './enums/default-avatar-status.enum';

describe('DefaultAvatarsService', () => {
  let service: DefaultAvatarsService;
  let defaultAvatarRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let employeeRepository: {
    count: jest.Mock;
  };
  let filesService: {
    saveBufferFile: jest.Mock;
    removeManagedFile: jest.Mock;
  };
  let imageProcessingService: {
    processDefaultAvatarBase64File: jest.Mock;
  };

  const maleAvatar: DefaultAvatar = {
    id: 8,
    company_id: 7,
    avatar_name: 'Male Avatar',
    image_path: '/uploads/default-avatars/company-7/male.webp',
    original_file_name: 'male.webp',
    stored_file_name: 'male.webp',
    file_extension: 'webp',
    mime_type: 'image/webp',
    file_size: '1024',
    file_path: '/uploads/default-avatars/company-7/male.webp',
    file_url: '/uploads/default-avatars/company-7/male.webp',
    width: 256,
    height: 256,
    gender_category: DefaultAvatarGenderEnum.MALE,
    status: DefaultAvatarStatusEnum.ACTIVE,
    display_order: 1,
    is_default: true,
    created_at: new Date('2026-06-01T00:00:00.000Z'),
    updated_at: new Date('2026-06-01T00:00:00.000Z'),
    company: null as never,
    employees: [],
  };

  const femaleAvatar: DefaultAvatar = {
    ...maleAvatar,
    id: 9,
    avatar_name: 'Female Avatar',
    image_path: '/uploads/default-avatars/company-7/female.webp',
    gender_category: DefaultAvatarGenderEnum.FEMALE,
  };

  const neutralAvatar: DefaultAvatar = {
    ...maleAvatar,
    id: 10,
    avatar_name: 'Neutral Avatar',
    image_path: '/uploads/default-avatars/company-7/neutral.webp',
    gender_category: DefaultAvatarGenderEnum.NEUTRAL,
  };

  beforeEach(() => {
    defaultAvatarRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest
        .fn()
        .mockImplementation((value: Partial<DefaultAvatar>) => value),
      save: jest
        .fn()
        .mockImplementation((value: DefaultAvatar) => Promise.resolve(value)),
    };
    employeeRepository = {
      count: jest.fn(),
    };
    filesService = {
      saveBufferFile: jest.fn(),
      removeManagedFile: jest.fn(),
    };
    imageProcessingService = {
      processDefaultAvatarBase64File: jest.fn(),
    };

    service = new DefaultAvatarsService(
      defaultAvatarRepository as unknown as Repository<DefaultAvatar>,
      employeeRepository as unknown as Repository<Employee>,
      filesService as unknown as FilesService,
      imageProcessingService as unknown as ImageProcessingService,
    );

    jest
      .spyOn(
        service as unknown as {
          pathExists: (publicPath?: string | null) => Promise<boolean>;
        },
        'pathExists',
      )
      .mockImplementation((publicPath?: string | null) =>
        Promise.resolve(Boolean(publicPath)),
      );
  });

  it('resolves a selected avatar ahead of an uploaded profile picture', async () => {
    const resolved = await service.resolveEmployeeProfileAvatar(7, {
      id: 15,
      gender: 'male',
      profile_photo_url: '/uploads/profile-photos/company-7/employee-15.webp',
      profile_image_source: ProfileImageSourceEnum.UPLOADED,
      default_avatar_id: maleAvatar.id,
      default_avatar: maleAvatar,
    } as Employee & { gender: string });

    expect(resolved).toEqual(
      expect.objectContaining({
        profile_photo_url: maleAvatar.image_path,
        uploaded_profile_photo_url:
          '/uploads/profile-photos/company-7/employee-15.webp',
        profile_photo_source: ProfileImageSourceEnum.DEFAULT_AVATAR,
        default_avatar_id: maleAvatar.id,
      }),
    );
    expect(service.buildProfilePicturePayload(resolved)).toEqual({
      source: 'SELECTED_AVATAR',
      avatar_id: maleAvatar.id,
      url: maleAvatar.image_path,
      is_override: true,
      has_custom_profile_picture: true,
      is_automatic_fallback: false,
    });
  });

  it('returns the uploaded profile picture when no avatar is selected', async () => {
    const resolved = await service.resolveEmployeeProfileAvatar(7, {
      id: 15,
      gender: 'male',
      profile_photo_url: '/uploads/profile-photos/company-7/employee-15.webp',
      profile_image_source: ProfileImageSourceEnum.UPLOADED,
      default_avatar_id: null,
    } as Employee & { gender: string });

    expect(service.buildProfilePicturePayload(resolved)).toEqual({
      source: 'CUSTOM_UPLOAD',
      avatar_id: null,
      url: '/uploads/profile-photos/company-7/employee-15.webp',
      is_override: false,
      has_custom_profile_picture: true,
      is_automatic_fallback: false,
    });
  });

  it('allows all active avatars when gender is missing', async () => {
    defaultAvatarRepository.find.mockResolvedValue([
      maleAvatar,
      femaleAvatar,
      neutralAvatar,
    ]);

    const result = await service.listAvailableForGender(7, null);

    expect(defaultAvatarRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: [
          {
            company_id: 7,
            gender_category: DefaultAvatarGenderEnum.MALE,
            status: DefaultAvatarStatusEnum.ACTIVE,
          },
          {
            company_id: 7,
            gender_category: DefaultAvatarGenderEnum.FEMALE,
            status: DefaultAvatarStatusEnum.ACTIVE,
          },
          {
            company_id: 7,
            gender_category: DefaultAvatarGenderEnum.NEUTRAL,
            status: DefaultAvatarStatusEnum.ACTIVE,
          },
        ],
      }),
    );
    expect(result.map((avatar) => avatar.id)).toEqual([8, 9, 10]);
  });

  it('rejects an invalid avatar id', async () => {
    defaultAvatarRepository.findOne.mockResolvedValue(null);

    await expect(
      service.assertAvatarAvailableForEmployee(7, 999, 'male'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an inactive avatar', async () => {
    defaultAvatarRepository.findOne.mockResolvedValue({
      ...maleAvatar,
      status: DefaultAvatarStatusEnum.INACTIVE,
    });
    defaultAvatarRepository.find.mockResolvedValue([neutralAvatar]);

    await expect(
      service.assertAvatarAvailableForEmployee(7, maleAvatar.id, 'male'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an avatar that does not match gender rules', async () => {
    defaultAvatarRepository.findOne.mockResolvedValue(femaleAvatar);
    defaultAvatarRepository.find.mockResolvedValue([maleAvatar, neutralAvatar]);

    await expect(
      service.assertAvatarAvailableForEmployee(7, femaleAvatar.id, 'male'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resolves a gender fallback when no uploaded or selected image exists', async () => {
    defaultAvatarRepository.find.mockImplementation(
      ({
        where,
      }: {
        where:
          | Array<{ gender_category: DefaultAvatarGenderEnum }>
          | { gender_category: DefaultAvatarGenderEnum };
      }) => {
        const genderCategory = Array.isArray(where)
          ? where[0]?.gender_category
          : where.gender_category;

        if (genderCategory === DefaultAvatarGenderEnum.MALE) {
          return Promise.resolve([maleAvatar]);
        }

        return Promise.resolve([]);
      },
    );

    const resolved = await service.resolveEmployeeProfileAvatar(7, {
      id: 15,
      gender: 'male',
      profile_photo_url: null,
      profile_image_source: null,
      default_avatar_id: null,
    } as Employee & { gender: string | null });

    expect(service.buildProfilePicturePayload(resolved)).toEqual({
      source: 'GENDER_DEFAULT',
      avatar_id: null,
      url: maleAvatar.image_path,
      is_override: false,
      has_custom_profile_picture: false,
      is_automatic_fallback: true,
    });
  });

  it('returns a system placeholder payload when nothing can be resolved', async () => {
    defaultAvatarRepository.find.mockResolvedValue([]);

    const resolved = await service.resolveEmployeeProfileAvatar(7, {
      id: 15,
      gender: null,
      profile_photo_url: null,
      profile_image_source: null,
      default_avatar_id: null,
    } as Employee & { gender: string | null });

    expect(service.buildProfilePicturePayload(resolved)).toEqual({
      source: 'SYSTEM_PLACEHOLDER',
      avatar_id: null,
      url: null,
      is_override: false,
      has_custom_profile_picture: false,
      is_automatic_fallback: false,
    });
  });

  it('maps avatar file metadata for API responses', () => {
    expect(service.mapAvatar(maleAvatar)).toEqual(
      expect.objectContaining({
        id: 8,
        name: 'Male Avatar',
        mime_type: 'image/webp',
        file_extension: 'webp',
        url: '/uploads/default-avatars/company-7/male.webp',
        is_active: true,
      }),
    );
  });

  it('stores processed upload metadata when creating an avatar', async () => {
    imageProcessingService.processDefaultAvatarBase64File.mockReturnValue({
      buffer: Buffer.from('png-data'),
      originalFileName: 'avatar.png',
      mimeType: 'image/png',
      fileExtension: '.png',
      fileSize: 8,
      width: 128,
      height: 128,
    });
    filesService.saveBufferFile.mockResolvedValue({
      originalFileName: 'avatar.png',
      storedFileName: 'default-avatar-uuid.png',
      mimeType: 'image/png',
      fileExtension: '.png',
      fileSize: 8,
      absolutePath:
        'D:/Projects/Office/HRMS/backend/uploads/default-avatars/company-7/default-avatar-uuid.png',
      publicPath: '/uploads/default-avatars/company-7/default-avatar-uuid.png',
    });
    defaultAvatarRepository.save.mockResolvedValue({
      ...maleAvatar,
      id: 81,
      avatar_name: 'PNG Avatar',
      image_path: '/uploads/default-avatars/company-7/default-avatar-uuid.png',
      original_file_name: 'avatar.png',
      stored_file_name: 'default-avatar-uuid.png',
      file_extension: 'png',
      mime_type: 'image/png',
      file_size: '8',
      file_path: '/uploads/default-avatars/company-7/default-avatar-uuid.png',
      file_url: '/uploads/default-avatars/company-7/default-avatar-uuid.png',
      width: 128,
      height: 128,
      is_default: false,
    });
    defaultAvatarRepository.findOne.mockResolvedValue({
      ...maleAvatar,
      id: 81,
      avatar_name: 'PNG Avatar',
      image_path: '/uploads/default-avatars/company-7/default-avatar-uuid.png',
      original_file_name: 'avatar.png',
      stored_file_name: 'default-avatar-uuid.png',
      file_extension: 'png',
      mime_type: 'image/png',
      file_size: '8',
      file_path: '/uploads/default-avatars/company-7/default-avatar-uuid.png',
      file_url: '/uploads/default-avatars/company-7/default-avatar-uuid.png',
      width: 128,
      height: 128,
      is_default: false,
    });

    const result = await service.create(7, {
      avatar_name: 'PNG Avatar',
      gender_category: DefaultAvatarGenderEnum.NEUTRAL,
      image_file: {
        fileName: 'avatar.png',
        fileSize: 8,
        mimeType: 'image/png',
        fileString: Buffer.from('png-data').toString('base64'),
      },
    });

    expect(
      imageProcessingService.processDefaultAvatarBase64File,
    ).toHaveBeenCalled();
    expect(filesService.saveBufferFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'avatar.png',
        mimeType: 'image/png',
        fileNamePrefix: 'default-avatar',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 81,
        mime_type: 'image/png',
        file_extension: 'png',
        url: '/uploads/default-avatars/company-7/default-avatar-uuid.png',
      }),
    );
  });
});
