process.env.DB_NAME = process.env.DB_NAME ?? 'hrms_test_db';

let currentUser = {
  id: 7,
  email: 'admin@example.com',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 7,
  companyMembershipId: 44,
  roles: ['COMPANY_ADMIN'],
  permissions: ['default_avatars:create'],
};

jest.mock('@nestjs/passport', () => ({
  AuthGuard: () =>
    class MockJwtAuthGuard {
      canActivate(context: {
        switchToHttp: () => { getRequest: () => Record<string, unknown> };
      }) {
        const request = context.switchToHttp().getRequest();
        request.user = currentUser;
        return true;
      }
    },
}));

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  rm: jest.fn().mockResolvedValue(undefined),
}));

import 'reflect-metadata';
import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as fs from 'fs/promises';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { TenantGuard } from '../src/common/guards/tenant.guard';
import { FilesService } from '../src/modules/files/files.service';
import { ImageProcessingService } from '../src/modules/files/image-processing.service';
import { SecurityEventsService } from '../src/modules/security/security-events.service';
import { DefaultAvatarsController } from '../src/modules/hr/default-avatars/default-avatars.controller';
import { DefaultAvatarsService } from '../src/modules/hr/default-avatars/default-avatars.service';
import { DefaultAvatar } from '../src/modules/hr/default-avatars/entities/default-avatar.entity';
import { DefaultAvatarGenderEnum } from '../src/modules/hr/default-avatars/enums/default-avatar-gender.enum';
import { DefaultAvatarStatusEnum } from '../src/modules/hr/default-avatars/enums/default-avatar-status.enum';
import { Employee } from '../src/modules/hr/employees/entities/employee.entity';

type FindOneWhere = {
  id: number;
  company_id: number;
};

function buildMinimalJpegBase64() {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11,
    0x08, 0x00, 0x01, 0x00, 0x01, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00,
    0x03, 0x11, 0x00, 0xff, 0xd9,
  ]).toString('base64');
}

describe('Default Avatar Upload (e2e)', () => {
  let app: INestApplication;
  let savedAvatar: DefaultAvatar | null;
  let saveError: Error | null;
  let defaultAvatarRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };
  let employeeRepository: {
    count: jest.Mock;
  };

  beforeEach(async () => {
    savedAvatar = null;
    saveError = null;
    currentUser = {
      id: 7,
      email: 'admin@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 7,
      companyMembershipId: 44,
      roles: ['COMPANY_ADMIN'],
      permissions: ['default_avatars:create'],
    };

    defaultAvatarRepository = {
      create: jest
        .fn()
        .mockImplementation((value: Partial<DefaultAvatar>) => value),
      save: jest.fn().mockImplementation((value: Partial<DefaultAvatar>) => {
        if (saveError) {
          return Promise.reject(saveError);
        }

        savedAvatar = {
          id: 81,
          company_id: value.company_id ?? 7,
          avatar_name: value.avatar_name ?? 'Default Avatar',
          image_path: value.image_path ?? '',
          original_file_name: value.original_file_name ?? null,
          stored_file_name: value.stored_file_name ?? null,
          file_extension: value.file_extension ?? null,
          mime_type: value.mime_type ?? null,
          file_size: value.file_size ?? null,
          file_path: value.file_path ?? null,
          file_url: value.file_url ?? null,
          width: value.width ?? null,
          height: value.height ?? null,
          gender_category:
            value.gender_category ?? DefaultAvatarGenderEnum.NEUTRAL,
          status: value.status ?? DefaultAvatarStatusEnum.ACTIVE,
          display_order: value.display_order ?? 0,
          is_default: value.is_default ?? false,
          created_at: new Date('2026-07-28T09:00:00.000Z'),
          updated_at: new Date('2026-07-28T09:00:00.000Z'),
          company: null as never,
          employees: [],
        };

        return Promise.resolve(savedAvatar);
      }),
      findOne: jest
        .fn()
        .mockImplementation((options: { where: FindOneWhere }) => {
          const { where } = options;

          if (
            savedAvatar &&
            savedAvatar.id === where.id &&
            savedAvatar.company_id === where.company_id
          ) {
            return Promise.resolve(savedAvatar);
          }

          return Promise.resolve(null);
        }),
    };
    employeeRepository = {
      count: jest.fn().mockResolvedValue(0),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [DefaultAvatarsController],
      providers: [
        DefaultAvatarsService,
        FilesService,
        ImageProcessingService,
        PermissionsGuard,
        TenantGuard,
        Reflector,
        {
          provide: SecurityEventsService,
          useValue: { logBestEffort: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              switch (key) {
                case 'APP_PUBLIC_STORAGE_PATH':
                  return 'uploads';
                case 'APP_PRIVATE_STORAGE_PATH':
                  return 'private-uploads';
                case 'MAX_UPLOAD_FILE_SIZE_BYTES':
                  return 10 * 1024 * 1024;
                case 'FILE_MALWARE_SCAN_MODE':
                  return 'disabled';
                default:
                  return undefined;
              }
            }),
          },
        },
        {
          provide: getRepositoryToken(DefaultAvatar),
          useValue: defaultAvatarRepository,
        },
        {
          provide: getRepositoryToken(Employee),
          useValue: employeeRepository,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    jest.clearAllMocks();

    if (app) {
      await app.close();
    }
  });

  it('uploads a JPG default avatar and returns stored metadata', async () => {
    const jpgBase64 = buildMinimalJpegBase64();

    const response = await request(app.getHttpServer() as App)
      .post('/default-avatars')
      .send({
        avatar_name: 'Male Avatar 01',
        gender_category: 'male',
        image_file: {
          fileName: 'male-avatar.jpg',
          fileSize: Buffer.from(jpgBase64, 'base64').length,
          mimeType: 'image/jpeg',
          fileString: jpgBase64,
        },
      })
      .expect(201);

    const body = response.body as {
      id: number;
      avatar_name: string;
      mime_type: string;
      file_extension: string;
      original_file_name: string;
      stored_file_name: string;
      width: number;
      height: number;
      url: string;
      is_active: boolean;
    };

    expect(defaultAvatarRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 7,
        avatar_name: 'Male Avatar 01',
        mime_type: 'image/jpeg',
        file_extension: 'jpg',
      }),
    );
    expect(body).toEqual(
      expect.objectContaining({
        id: 81,
        avatar_name: 'Male Avatar 01',
        mime_type: 'image/jpeg',
        file_extension: 'jpg',
        original_file_name: 'male-avatar.jpg',
        width: 1,
        height: 1,
        is_active: true,
      }),
    );
    expect(body.stored_file_name).toMatch(/^default-avatar-.*\.jpg$/);
    expect(body.url).toMatch(
      /^\/uploads\/default-avatars\/company-7\/default-avatar-.*\.jpg$/,
    );
    expect(fs.mkdir).toHaveBeenCalledWith(
      expect.stringContaining('uploads'),
      expect.objectContaining({ recursive: true }),
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/default-avatar-.*\.jpg$/),
      expect.any(Buffer),
      expect.objectContaining({
        flag: 'wx',
        mode: 0o640,
      }),
    );
  });

  it('returns the original upload error when cleanup also fails', async () => {
    const jpgBase64 = buildMinimalJpegBase64();

    saveError = new BadRequestException('Avatar metadata is invalid.');
    jest.mocked(fs.rm).mockRejectedValueOnce(new Error('cleanup failed'));

    const response = await request(app.getHttpServer() as App)
      .post('/default-avatars')
      .send({
        avatar_name: 'Broken Avatar',
        gender_category: 'male',
        image_file: {
          fileName: 'broken-avatar.jpg',
          fileSize: Buffer.from(jpgBase64, 'base64').length,
          mimeType: 'image/jpeg',
          fileString: jpgBase64,
        },
      })
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        message: 'Avatar metadata is invalid.',
        statusCode: 400,
      }),
    );
  });
});
