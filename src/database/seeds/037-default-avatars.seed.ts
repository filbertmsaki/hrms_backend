import * as fs from 'fs/promises';
import { join, resolve } from 'path';
import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { DefaultAvatar } from '../../modules/hr/default-avatars/entities/default-avatar.entity';
import { DefaultAvatarGenderEnum } from '../../modules/hr/default-avatars/enums/default-avatar-gender.enum';
import { DefaultAvatarStatusEnum } from '../../modules/hr/default-avatars/enums/default-avatar-status.enum';

type SeedAvatar = {
  key: string;
  avatarName: string;
  genderCategory: DefaultAvatarGenderEnum;
  displayOrder: number;
  isDefault: boolean;
  accentColor: string;
  shirtColor: string;
};

const DEFAULT_AVATAR_LIBRARY: SeedAvatar[] = [
  {
    key: 'male-default',
    avatarName: 'Professional Male One',
    genderCategory: DefaultAvatarGenderEnum.MALE,
    displayOrder: 10,
    isDefault: true,
    accentColor: '#295f86',
    shirtColor: '#d8e5ef',
  },
  {
    key: 'male-secondary',
    avatarName: 'Professional Male Two',
    genderCategory: DefaultAvatarGenderEnum.MALE,
    displayOrder: 20,
    isDefault: false,
    accentColor: '#4f6f52',
    shirtColor: '#dde7dd',
  },
  {
    key: 'female-default',
    avatarName: 'Professional Female One',
    genderCategory: DefaultAvatarGenderEnum.FEMALE,
    displayOrder: 10,
    isDefault: true,
    accentColor: '#8c4a63',
    shirtColor: '#f2dbe4',
  },
  {
    key: 'female-secondary',
    avatarName: 'Professional Female Two',
    genderCategory: DefaultAvatarGenderEnum.FEMALE,
    displayOrder: 20,
    isDefault: false,
    accentColor: '#7a6a35',
    shirtColor: '#efe8cf',
  },
  {
    key: 'neutral-default',
    avatarName: 'Professional Neutral One',
    genderCategory: DefaultAvatarGenderEnum.NEUTRAL,
    displayOrder: 10,
    isDefault: true,
    accentColor: '#4d5b6a',
    shirtColor: '#dde4ea',
  },
  {
    key: 'neutral-secondary',
    avatarName: 'Professional Neutral Two',
    genderCategory: DefaultAvatarGenderEnum.NEUTRAL,
    displayOrder: 20,
    isDefault: false,
    accentColor: '#73624d',
    shirtColor: '#eadfce',
  },
];

function buildAvatarSvg(avatar: SeedAvatar) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="${avatar.avatarName}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f7f4ee"/>
      <stop offset="100%" stop-color="#e6edf3"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="32" fill="url(#bg)"/>
  <circle cx="128" cy="96" r="46" fill="#f0c8a0"/>
  <path d="M72 220c6-44 34-70 56-70s50 26 56 70" fill="${avatar.shirtColor}"/>
  <path d="M80 220c8-37 29-58 48-58s40 21 48 58" fill="${avatar.accentColor}"/>
  <path d="M84 72c11-20 30-30 53-30 19 0 37 8 47 26-10-8-21-11-35-11-18 0-34 5-49 15-5 4-10 7-16 10z" fill="${avatar.accentColor}"/>
  <circle cx="111" cy="96" r="4" fill="#6e4a36"/>
  <circle cx="145" cy="96" r="4" fill="#6e4a36"/>
  <path d="M112 121c10 8 22 8 32 0" fill="none" stroke="#8b5b43" stroke-width="4" stroke-linecap="round"/>
</svg>`;
}

export default class DefaultAvatarsSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void factoryManager;

    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const companyRepository = qr.manager.getRepository(Company);
      const avatarRepository = qr.manager.getRepository(DefaultAvatar);
      const companies = await companyRepository.find({
        where: { status: 'active' },
      });
      const uploadsRoot = resolve(process.cwd(), 'uploads', 'default-avatars');

      let createdCount = 0;
      let existingCount = 0;
      for (const company of companies) {
        const companyDirectory = join(uploadsRoot, `company-${company.id}`);
        await fs.mkdir(companyDirectory, { recursive: true });

        for (const avatarSeed of DEFAULT_AVATAR_LIBRARY) {
          const avatar = await avatarRepository.findOne({
            where: {
              company_id: company.id,
              avatar_name: avatarSeed.avatarName,
            },
          });

          if (avatar) {
            existingCount += 1;
            continue;
          }

          const fileName = `${avatarSeed.key}.svg`;
          const absolutePath = join(companyDirectory, fileName);
          const publicPath = `/uploads/default-avatars/company-${company.id}/${fileName}`;

          await fs.writeFile(absolutePath, buildAvatarSvg(avatarSeed), 'utf8');

          await avatarRepository.save(
            avatarRepository.create({
              company_id: company.id,
              avatar_name: avatarSeed.avatarName,
              image_path: publicPath,
              original_file_name: fileName,
              stored_file_name: fileName,
              file_extension: 'svg',
              mime_type: 'image/svg+xml',
              file_size: String(Buffer.byteLength(buildAvatarSvg(avatarSeed))),
              file_path: publicPath,
              file_url: publicPath,
              width: 256,
              height: 256,
              gender_category: avatarSeed.genderCategory,
              status: DefaultAvatarStatusEnum.ACTIVE,
              display_order: avatarSeed.displayOrder,
              is_default: avatarSeed.isDefault,
            }),
          );
          createdCount += 1;
        }
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][DefaultAvatars] Created ${createdCount} new default avatars (${existingCount} already existed, left unchanged)`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][DefaultAvatars] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
