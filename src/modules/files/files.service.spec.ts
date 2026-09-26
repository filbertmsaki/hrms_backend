import * as fs from 'fs/promises';
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  rm: jest.fn().mockResolvedValue(undefined),
}));
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FilesService } from './files.service';

describe('FilesService', () => {
  let service: FilesService;
  let configService: Pick<ConfigService, 'get'>;

  beforeEach(() => {
    jest.clearAllMocks();
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
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
    };
    service = new FilesService(configService as ConfigService);
  });

  it('stores a base64 file and returns normalized metadata', async () => {
    const result = await service.saveBase64File(
      {
        fileName: 'document.pdf',
        fileSize: 12,
        mimeType: 'application/pdf',
        fileString: Buffer.from('hello world!').toString('base64'),
      },
      {
        directorySegments: ['documents', 'employees', 'company-7'],
        fileNamePrefix: 'employee-15',
      },
    );

    expect(fs.mkdir).toHaveBeenCalled();
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('uploads'),
      expect.any(Buffer),
      expect.objectContaining({
        flag: 'wx',
        mode: 0o640,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        originalFileName: 'document.pdf',
        mimeType: 'application/pdf',
        fileExtension: '.pdf',
        fileSize: 12,
      }),
    );
    expect(result.publicPath).toMatch(
      /^\/uploads\/documents\/employees\/company-7\/employee-15-.+\.pdf$/,
    );
  });

  it('rejects a file when the declared size does not match the decoded content', async () => {
    await expect(
      service.saveBase64File(
        {
          fileName: 'document.pdf',
          fileSize: 99,
          mimeType: 'application/pdf',
          fileString: Buffer.from('hello world!').toString('base64'),
        },
        {
          directorySegments: ['documents'],
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
