import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs/promises';
import { resolve } from 'path';
import { Repository } from 'typeorm';
import { FilesService } from '../../files/files.service';
import { Employee } from '../employees/entities/employee.entity';
import { ProfileImageSourceEnum } from '../employees/enums/profile-image-source.enum';
import { DefaultAvatar } from './entities/default-avatar.entity';
import { CreateDefaultAvatarDto } from './dtos/create-default-avatar.dto';
import { DefaultAvatarQueryDto } from './dtos/default-avatar-query.dto';
import { UpdateDefaultAvatarDto } from './dtos/update-default-avatar.dto';
import { DefaultAvatarGenderEnum } from './enums/default-avatar-gender.enum';
import { DefaultAvatarStatusEnum } from './enums/default-avatar-status.enum';

type AvatarAwareEmployee = Pick<
  Employee,
  'id' | 'profile_photo_url' | 'profile_image_source' | 'default_avatar_id'
> & {
  gender?: string | null;
  default_avatar?: DefaultAvatar | null;
};

type ResolvedAvatarPayload = {
  profile_photo_url: string | null;
  uploaded_profile_photo_url: string | null;
  profile_photo_source:
    | ProfileImageSourceEnum
    | 'gender_default'
    | 'neutral_default'
    | 'none';
  default_avatar_id: number | null;
  selected_default_avatar: ReturnType<
    DefaultAvatarsService['mapAvatar']
  > | null;
};

type ProfilePicturePayload = {
  source: 'CUSTOM_UPLOAD' | 'DEFAULT_AVATAR' | 'AUTOMATIC_FALLBACK';
  avatar_id: number | null;
  url: string | null;
  is_custom: boolean;
  is_fallback: boolean;
};

@Injectable()
export class DefaultAvatarsService {
  private readonly uploadsRoot = resolve(process.cwd(), 'uploads');
  private readonly filePresenceCache = new Map<
    string,
    { expiresAt: number; exists: boolean }
  >();
  private readonly filePresenceTtlMs = 5 * 60 * 1000;

  constructor(
    @InjectRepository(DefaultAvatar)
    private readonly defaultAvatarRepository: Repository<DefaultAvatar>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private readonly filesService: FilesService,
  ) {}

  async findAll(companyId: number, query: DefaultAvatarQueryDto = {}) {
    const qb = this.defaultAvatarRepository
      .createQueryBuilder('avatar')
      .where('avatar.company_id = :companyId', { companyId });

    if (query.gender_category) {
      qb.andWhere('avatar.gender_category = :genderCategory', {
        genderCategory: query.gender_category,
      });
    }

    if (query.status) {
      qb.andWhere('avatar.status = :status', { status: query.status });
    } else if (!query.include_inactive) {
      qb.andWhere('avatar.status = :activeStatus', {
        activeStatus: DefaultAvatarStatusEnum.ACTIVE,
      });
    }

    const avatars = await qb
      .orderBy('avatar.display_order', 'ASC')
      .addOrderBy('avatar.avatar_name', 'ASC')
      .getMany();

    return avatars.map((avatar) => this.mapAvatar(avatar));
  }

  async findOne(companyId: number, avatarId: number) {
    const avatar = await this.findAvatarEntityOrFail(companyId, avatarId);
    return this.mapAvatar(avatar);
  }

  async create(companyId: number, dto: CreateDefaultAvatarDto) {
    const storedFile = await this.filesService.saveBase64File(dto.image_file, {
      directorySegments: ['default-avatars', `company-${companyId}`],
      fileNamePrefix: dto.avatar_name,
      allowedMimeTypes: [
        'image/jpeg',
        'image/png',
        'image/svg+xml',
        'image/webp',
      ],
    });

    try {
      const avatar = this.defaultAvatarRepository.create({
        company_id: companyId,
        avatar_name: dto.avatar_name.trim(),
        image_path: storedFile.publicPath,
        gender_category: dto.gender_category,
        status: dto.status ?? DefaultAvatarStatusEnum.ACTIVE,
        display_order: dto.display_order ?? 0,
        is_default: Boolean(dto.is_default),
      });

      const savedAvatar = await this.defaultAvatarRepository.save(avatar);

      if (savedAvatar.is_default) {
        await this.applyDefaultFlag(
          companyId,
          savedAvatar.id,
          savedAvatar.gender_category,
        );
      }

      return this.findOne(companyId, savedAvatar.id);
    } catch (error) {
      await this.filesService.removeManagedFile(storedFile.publicPath);
      throw error;
    }
  }

  async update(
    companyId: number,
    avatarId: number,
    dto: UpdateDefaultAvatarDto,
  ) {
    const avatar = await this.findAvatarEntityOrFail(companyId, avatarId);
    const previousImagePath = avatar.image_path;

    if (dto.avatar_name !== undefined) {
      avatar.avatar_name = dto.avatar_name.trim();
    }
    if (dto.gender_category !== undefined) {
      avatar.gender_category = dto.gender_category;
    }
    if (dto.status !== undefined) {
      avatar.status = dto.status;
      if (dto.status !== DefaultAvatarStatusEnum.ACTIVE) {
        avatar.is_default = false;
      }
    }
    if (dto.display_order !== undefined) {
      avatar.display_order = dto.display_order;
    }
    if (dto.is_default !== undefined) {
      avatar.is_default = dto.is_default;
    }

    if (dto.image_file) {
      const storedFile = await this.filesService.saveBase64File(
        dto.image_file,
        {
          directorySegments: ['default-avatars', `company-${companyId}`],
          fileNamePrefix: dto.avatar_name ?? avatar.avatar_name,
          allowedMimeTypes: [
            'image/jpeg',
            'image/png',
            'image/svg+xml',
            'image/webp',
          ],
        },
      );
      avatar.image_path = storedFile.publicPath;
    }

    try {
      const savedAvatar = await this.defaultAvatarRepository.save(avatar);
      if (savedAvatar.is_default) {
        await this.applyDefaultFlag(
          companyId,
          savedAvatar.id,
          savedAvatar.gender_category,
        );
      }

      if (dto.image_file && previousImagePath !== savedAvatar.image_path) {
        await this.filesService.removeManagedFile(previousImagePath);
      }

      return this.findOne(companyId, savedAvatar.id);
    } catch (error) {
      if (dto.image_file && avatar.image_path !== previousImagePath) {
        await this.filesService.removeManagedFile(avatar.image_path);
        avatar.image_path = previousImagePath;
      }
      throw error;
    }
  }

  async delete(companyId: number, avatarId: number) {
    const avatar = await this.findAvatarEntityOrFail(companyId, avatarId);
    const usageCount = await this.employeeRepository.count({
      where: {
        company_user: {
          company_id: companyId,
        },
        default_avatar_id: avatarId,
      },
    });

    if (usageCount > 0) {
      throw new ConflictException(
        'This avatar is currently assigned to one or more employees.',
      );
    }

    await this.defaultAvatarRepository.remove(avatar);
    await this.filesService.removeManagedFile(avatar.image_path);

    return {
      message: 'Default avatar deleted successfully.',
    };
  }

  async setDefault(companyId: number, avatarId: number) {
    const avatar = await this.findAvatarEntityOrFail(companyId, avatarId);

    if (avatar.status !== DefaultAvatarStatusEnum.ACTIVE) {
      throw new BadRequestException(
        'Only active avatars can be set as default.',
      );
    }

    await this.applyDefaultFlag(companyId, avatar.id, avatar.gender_category);
    return this.findOne(companyId, avatar.id);
  }

  async listAvailableForGender(companyId: number, gender?: string | null) {
    const normalizedGender = this.normalizeEmployeeGender(gender);
    const allowedGenders =
      normalizedGender === DefaultAvatarGenderEnum.MALE
        ? [DefaultAvatarGenderEnum.MALE, DefaultAvatarGenderEnum.NEUTRAL]
        : normalizedGender === DefaultAvatarGenderEnum.FEMALE
          ? [DefaultAvatarGenderEnum.FEMALE, DefaultAvatarGenderEnum.NEUTRAL]
          : [
              DefaultAvatarGenderEnum.MALE,
              DefaultAvatarGenderEnum.FEMALE,
              DefaultAvatarGenderEnum.NEUTRAL,
            ];

    const avatars = await this.defaultAvatarRepository.find({
      where: allowedGenders.map((genderCategory) => ({
        company_id: companyId,
        gender_category: genderCategory,
        status: DefaultAvatarStatusEnum.ACTIVE,
      })),
      order: {
        display_order: 'ASC',
        avatar_name: 'ASC',
      },
    });

    return avatars.map((avatar) => this.mapAvatar(avatar));
  }

  async assertAvatarAvailableForEmployee(
    companyId: number,
    avatarId: number,
    gender?: string | null,
  ): Promise<DefaultAvatar> {
    const avatar = await this.findAvatarEntityOrFail(companyId, avatarId);
    const allowedAvatars = await this.listAvailableForGender(companyId, gender);
    const allowedIds = new Set(
      allowedAvatars
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        .map((entry) => entry.id),
    );

    if (!allowedIds.has(avatar.id)) {
      throw new BadRequestException(
        'The selected avatar is not available for this employee.',
      );
    }

    if (!(await this.pathExists(avatar.image_path))) {
      throw new NotFoundException('The selected avatar file is unavailable.');
    }

    return avatar;
  }

  async resolveEmployeeProfileAvatar(
    companyId: number,
    employee: AvatarAwareEmployee | null | undefined,
  ): Promise<ResolvedAvatarPayload> {
    if (!employee) {
      return {
        profile_photo_url: null,
        uploaded_profile_photo_url: null,
        profile_photo_source: 'none',
        default_avatar_id: null,
        selected_default_avatar: null,
      };
    }

    const uploadedProfilePhotoUrl = employee.profile_photo_url ?? null;
    const selectedAvatar =
      employee.default_avatar ??
      (employee.default_avatar_id
        ? await this.defaultAvatarRepository.findOne({
            where: { id: employee.default_avatar_id, company_id: companyId },
          })
        : null);

    const uploadAvailable = await this.pathExists(uploadedProfilePhotoUrl);
    const selectedAvatarAvailable =
      selectedAvatar &&
      selectedAvatar.status === DefaultAvatarStatusEnum.ACTIVE &&
      (await this.pathExists(selectedAvatar.image_path));

    if (uploadAvailable) {
      return {
        profile_photo_url: uploadedProfilePhotoUrl,
        uploaded_profile_photo_url: uploadedProfilePhotoUrl,
        profile_photo_source: ProfileImageSourceEnum.UPLOADED,
        default_avatar_id: selectedAvatar?.id ?? null,
        selected_default_avatar: selectedAvatar
          ? this.mapAvatar(selectedAvatar)
          : null,
      };
    }

    if (selectedAvatarAvailable) {
      return {
        profile_photo_url: selectedAvatar.image_path,
        uploaded_profile_photo_url: uploadedProfilePhotoUrl,
        profile_photo_source: ProfileImageSourceEnum.DEFAULT_AVATAR,
        default_avatar_id: selectedAvatar.id,
        selected_default_avatar: this.mapAvatar(selectedAvatar),
      };
    }

    const genderDefault = await this.findDefaultAvatarByGender(
      companyId,
      employee.gender,
    );

    if (genderDefault) {
      return {
        profile_photo_url: genderDefault.image_path,
        uploaded_profile_photo_url: uploadedProfilePhotoUrl,
        profile_photo_source:
          genderDefault.gender_category === DefaultAvatarGenderEnum.NEUTRAL
            ? 'neutral_default'
            : 'gender_default',
        default_avatar_id: selectedAvatar?.id ?? null,
        selected_default_avatar: selectedAvatar
          ? this.mapAvatar(selectedAvatar)
          : null,
      };
    }

    return {
      profile_photo_url: null,
      uploaded_profile_photo_url: uploadedProfilePhotoUrl,
      profile_photo_source: 'none',
      default_avatar_id: selectedAvatar?.id ?? null,
      selected_default_avatar: selectedAvatar
        ? this.mapAvatar(selectedAvatar)
        : null,
    };
  }

  mapAvatar(avatar: DefaultAvatar | null | undefined) {
    if (!avatar) {
      return null;
    }

    return {
      id: avatar.id,
      company_id: avatar.company_id,
      avatar_name: avatar.avatar_name,
      image_path: avatar.image_path,
      image_url: avatar.image_path,
      gender_category: avatar.gender_category,
      status: avatar.status,
      display_order: avatar.display_order,
      is_default: avatar.is_default,
      created_at: avatar.created_at,
      updated_at: avatar.updated_at,
    };
  }

  buildProfilePicturePayload(
    resolvedAvatar: ResolvedAvatarPayload,
  ): ProfilePicturePayload {
    const isCustomUpload =
      resolvedAvatar.profile_photo_source === ProfileImageSourceEnum.UPLOADED;
    const isSelectedDefaultAvatar =
      resolvedAvatar.profile_photo_source ===
      ProfileImageSourceEnum.DEFAULT_AVATAR;

    return {
      source: isCustomUpload
        ? 'CUSTOM_UPLOAD'
        : isSelectedDefaultAvatar
          ? 'DEFAULT_AVATAR'
          : 'AUTOMATIC_FALLBACK',
      avatar_id: isSelectedDefaultAvatar
        ? resolvedAvatar.default_avatar_id
        : null,
      url: resolvedAvatar.profile_photo_url,
      is_custom: isCustomUpload,
      is_fallback: !isCustomUpload && !isSelectedDefaultAvatar,
    };
  }

  private async findAvatarEntityOrFail(companyId: number, avatarId: number) {
    const avatar = await this.defaultAvatarRepository.findOne({
      where: {
        id: avatarId,
        company_id: companyId,
      },
    });

    if (!avatar) {
      throw new NotFoundException('Default avatar not found.');
    }

    return avatar;
  }

  private async applyDefaultFlag(
    companyId: number,
    avatarId: number,
    genderCategory: DefaultAvatarGenderEnum,
  ) {
    await this.defaultAvatarRepository.update(
      {
        company_id: companyId,
        gender_category: genderCategory,
      },
      { is_default: false },
    );

    await this.defaultAvatarRepository.update(
      {
        id: avatarId,
        company_id: companyId,
      },
      { is_default: true, status: DefaultAvatarStatusEnum.ACTIVE },
    );
  }

  private normalizeEmployeeGender(
    gender?: string | null,
  ): DefaultAvatarGenderEnum | null {
    const normalized = gender?.trim().toLowerCase();

    if (normalized === DefaultAvatarGenderEnum.MALE) {
      return DefaultAvatarGenderEnum.MALE;
    }

    if (normalized === DefaultAvatarGenderEnum.FEMALE) {
      return DefaultAvatarGenderEnum.FEMALE;
    }

    return null;
  }

  private async findDefaultAvatarByGender(
    companyId: number,
    gender?: string | null,
  ): Promise<DefaultAvatar | null> {
    const normalizedGender = this.normalizeEmployeeGender(gender);
    const preferredCategories = normalizedGender
      ? [normalizedGender, DefaultAvatarGenderEnum.NEUTRAL]
      : [
          DefaultAvatarGenderEnum.NEUTRAL,
          DefaultAvatarGenderEnum.MALE,
          DefaultAvatarGenderEnum.FEMALE,
        ];

    for (const genderCategory of preferredCategories) {
      const avatars = await this.defaultAvatarRepository.find({
        where: {
          company_id: companyId,
          gender_category: genderCategory,
          status: DefaultAvatarStatusEnum.ACTIVE,
        },
        order: {
          is_default: 'DESC',
          display_order: 'ASC',
          avatar_name: 'ASC',
        },
      });

      for (const avatar of avatars) {
        if (await this.pathExists(avatar.image_path)) {
          return avatar;
        }
      }
    }

    return null;
  }

  private async pathExists(publicPath: string | null | undefined) {
    if (!publicPath) {
      return false;
    }

    if (!publicPath.startsWith('/uploads/')) {
      return true;
    }

    const cached = this.filePresenceCache.get(publicPath);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.exists;
    }

    const relativeSegments = publicPath
      .slice('/uploads/'.length)
      .split('/')
      .filter((segment) => segment.length);
    const absolutePath = resolve(this.uploadsRoot, ...relativeSegments);

    let exists = false;
    if (absolutePath.startsWith(this.uploadsRoot)) {
      try {
        await fs.access(absolutePath);
        exists = true;
      } catch {
        exists = false;
      }
    }

    this.filePresenceCache.set(publicPath, {
      expiresAt: Date.now() + this.filePresenceTtlMs,
      exists,
    });

    return exists;
  }
}
