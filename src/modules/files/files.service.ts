import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'path';
import { tmpdir } from 'os';
import {
  Base64FileDto,
  FILE_NAME_PATTERN,
  MIME_TYPE_PATTERN,
} from './dtos/base64-file.dto';
import { StoredFile } from './interfaces/stored-file.interface';

type SaveBufferFileOptions = {
  buffer: Buffer;
  fileName: string;
  fileSize?: number;
  mimeType: string;
  directorySegments: string[];
  fileNamePrefix?: string;
  allowedMimeTypes?: string[];
  maxFileSizeBytes?: number;
  validateFileSignature?: boolean;
};

type SaveBase64FileOptions = Omit<
  SaveBufferFileOptions,
  'buffer' | 'fileName' | 'fileSize' | 'mimeType'
>;

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly uploadsRoot: string;
  private readonly privateUploadsRoot: string;
  private readonly globalMaximumFileSize: number;

  constructor(private readonly configService: ConfigService) {
    this.uploadsRoot = resolve(
      process.cwd(),
      this.configService.get<string>('APP_PUBLIC_STORAGE_PATH') ?? 'uploads',
    );
    this.privateUploadsRoot = resolve(
      process.cwd(),
      this.configService.get<string>('APP_PRIVATE_STORAGE_PATH') ??
        'private-uploads',
    );
    this.globalMaximumFileSize =
      this.configService.get<number>('MAX_UPLOAD_FILE_SIZE_BYTES') ??
      10 * 1024 * 1024;
  }

  async saveBase64File(
    file: Base64FileDto,
    options: SaveBase64FileOptions,
  ): Promise<StoredFile> {
    const buffer = this.decodeBase64FileString(file.fileString);

    return this.saveBufferFile({
      ...options,
      buffer,
      fileName: file.fileName,
      fileSize: file.fileSize,
      mimeType: file.mimeType,
    });
  }

  async savePrivateBase64File(
    file: Base64FileDto,
    options: SaveBase64FileOptions,
  ): Promise<StoredFile> {
    const buffer = this.decodeBase64FileString(file.fileString);

    return this.savePrivateBufferFile({
      ...options,
      buffer,
      fileName: file.fileName,
      fileSize: file.fileSize,
      mimeType: file.mimeType,
    });
  }

  async saveBufferFile(options: SaveBufferFileOptions): Promise<StoredFile> {
    return this.saveBufferFileToRoot(options, {
      absoluteRoot: this.uploadsRoot,
      publicPrefix: '/uploads',
    });
  }

  async savePrivateBufferFile(
    options: SaveBufferFileOptions,
  ): Promise<StoredFile> {
    return this.saveBufferFileToRoot(options, {
      absoluteRoot: this.privateUploadsRoot,
      publicPrefix: '/private-uploads',
    });
  }

  async removeManagedFile(
    publicPath: string | null | undefined,
  ): Promise<void> {
    const resolved = this.resolveManagedFile(publicPath);
    if (!resolved) {
      return;
    }

    await fs.rm(resolved.absolutePath, { force: true });
  }

  async readManagedFile(
    publicPath: string | null | undefined,
  ): Promise<Buffer | null> {
    const resolved = this.resolveManagedFile(publicPath);
    if (!resolved) {
      return null;
    }

    try {
      return await fs.readFile(resolved.absolutePath);
    } catch {
      return null;
    }
  }

  resolveManagedFileAbsolutePath(
    publicPath: string | null | undefined,
  ): string | null {
    return this.resolveManagedFile(publicPath)?.absolutePath ?? null;
  }

  private async saveBufferFileToRoot(
    options: SaveBufferFileOptions,
    rootConfig: {
      absoluteRoot: string;
      publicPrefix: '/uploads' | '/private-uploads';
    },
  ): Promise<StoredFile> {
    const normalizedMimeType = this.normalizeMimeType(options.mimeType);
    this.assertFileName(options.fileName);
    this.assertAllowedMimeType(normalizedMimeType, options.allowedMimeTypes);
    this.assertBufferSize(
      options.buffer,
      options.fileSize,
      options.maxFileSizeBytes,
    );
    this.assertMimeTypeMatchesExtension(options.fileName, normalizedMimeType);

    if (options.validateFileSignature) {
      this.assertFileSignature(options.buffer, normalizedMimeType);
    }
    await this.scanForMalware(options.buffer);

    const extension = this.resolveFileExtension(options.fileName);
    const targetDirectory = await this.ensureTargetDirectory(
      rootConfig.absoluteRoot,
      options.directorySegments,
    );
    const storedFileName = this.buildStoredFileName(
      options.fileNamePrefix,
      options.fileName,
      extension,
    );
    const absolutePath = join(targetDirectory, storedFileName);

    await fs.writeFile(absolutePath, options.buffer, {
      flag: 'wx',
      mode: 0o640,
    });

    return {
      originalFileName: options.fileName.trim(),
      storedFileName,
      mimeType: normalizedMimeType,
      fileExtension: extension,
      fileSize: options.buffer.length,
      absolutePath,
      publicPath: this.buildPublicPath(rootConfig.publicPrefix, [
        ...this.normalizeDirectorySegments(options.directorySegments),
        storedFileName,
      ]),
    };
  }

  private async scanForMalware(buffer: Buffer): Promise<void> {
    const mode = this.configService.get<string>('FILE_MALWARE_SCAN_MODE') ?? 'optional';
    if (mode === 'disabled') return;
    const directory = await fs.mkdtemp(join(tmpdir(), 'hrms-upload-scan-'));
    const path = join(directory, 'upload');
    try {
      await fs.writeFile(path, buffer, { mode: 0o600 });
      await promisify(execFile)(
        this.configService.get<string>('FILE_MALWARE_SCAN_COMMAND') ?? 'clamdscan',
        [path],
        { timeout: this.configService.get<number>('FILE_MALWARE_SCAN_TIMEOUT_MS') ?? 30000, windowsHide: true },
      );
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (String(code) === '1') {
        throw new BadRequestException('Upload failed malware scanning');
      }
      if (mode === 'optional' && code === 'ENOENT') {
        this.logger.warn('Malware scanner is not installed; upload accepted in optional mode');
        return;
      }
      throw new ServiceUnavailableException('Malware scanning is unavailable');
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  }

  private decodeBase64FileString(value: string): Buffer {
    const normalized = value.trim().replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(normalized, 'base64');

    if (
      !buffer.length ||
      buffer.toString('base64') !== normalized.replace(/\s+/g, '')
    ) {
      throw new BadRequestException(
        'fileString must contain valid Base64 data.',
      );
    }

    return buffer;
  }

  private normalizeMimeType(value: string): string {
    const normalized = value.trim().toLowerCase();

    if (!normalized || !MIME_TYPE_PATTERN.test(normalized)) {
      throw new BadRequestException('mimeType must be a valid MIME type.');
    }

    return normalized;
  }

  private assertFileName(fileName: string) {
    const normalized = fileName.trim();

    if (!normalized || !FILE_NAME_PATTERN.test(normalized)) {
      throw new BadRequestException(
        'fileName must include a valid file name and extension.',
      );
    }
  }

  private assertAllowedMimeType(mimeType: string, allowedMimeTypes?: string[]) {
    if (!allowedMimeTypes?.length) {
      return;
    }

    const allowedSet = new Set(
      allowedMimeTypes.map((value) => value.trim().toLowerCase()),
    );

    if (!allowedSet.has(mimeType)) {
      throw new BadRequestException(
        `mimeType '${mimeType}' is not allowed for this upload.`,
      );
    }
  }

  private assertBufferSize(
    buffer: Buffer,
    declaredFileSize?: number,
    requestedMaximum?: number,
  ): void {
    const maximumFileSize = Math.min(
      requestedMaximum ?? this.globalMaximumFileSize,
      this.globalMaximumFileSize,
    );

    if (buffer.length < 1) {
      throw new BadRequestException('Uploaded file is empty.');
    }

    if (buffer.length > maximumFileSize) {
      throw new BadRequestException(
        `Uploaded file exceeds the maximum size of ${maximumFileSize} bytes.`,
      );
    }

    if (declaredFileSize === undefined) {
      return;
    }

    if (!Number.isInteger(declaredFileSize) || declaredFileSize < 1) {
      throw new BadRequestException('fileSize must be a positive integer.');
    }

    if (buffer.length !== declaredFileSize) {
      throw new BadRequestException(
        'fileSize does not match the decoded file content.',
      );
    }
  }

  private assertMimeTypeMatchesExtension(
    fileName: string,
    mimeType: string,
  ): void {
    const extension = extname(fileName.trim()).toLowerCase();

    const allowedExtensions: Record<string, string[]> = {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'image/svg+xml': ['.svg'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        ['.docx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
        '.xlsx',
      ],
      'text/plain': ['.txt'],
    };

    const expectedExtensions = allowedExtensions[mimeType];

    if (!expectedExtensions) {
      return;
    }

    if (!expectedExtensions.includes(extension)) {
      throw new BadRequestException(
        `The file extension '${extension}' does not match MIME type '${mimeType}'.`,
      );
    }
  }

  private assertFileSignature(buffer: Buffer, mimeType: string): void {
    const startsWith = (signature: number[]): boolean =>
      signature.every((value, index) => buffer[index] === value);
    const isZipContainer = startsWith([0x50, 0x4b, 0x03, 0x04]);
    const isOleCompoundFile = startsWith([
      0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
    ]);

    let isValid = true;

    switch (mimeType) {
      case 'application/pdf':
        isValid = buffer.subarray(0, 5).toString('ascii') === '%PDF-';
        break;
      case 'image/jpeg':
        isValid = startsWith([0xff, 0xd8, 0xff]);
        break;
      case 'image/png':
        isValid = startsWith([0x89, 0x50, 0x4e, 0x47]);
        break;
      case 'image/webp':
        isValid =
          buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
          buffer.subarray(8, 12).toString('ascii') === 'WEBP';
        break;
      case 'application/msword':
      case 'application/vnd.ms-excel':
        isValid = isOleCompoundFile;
        break;
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        isValid = isZipContainer;
        break;
      case 'text/plain':
        isValid = true;
        break;
      default:
        isValid = true;
        break;
    }

    if (!isValid) {
      throw new BadRequestException(
        `Uploaded file content does not match MIME type '${mimeType}'.`,
      );
    }
  }

  private resolveFileExtension(fileName: string): string {
    const extension = extname(fileName.trim()).toLowerCase();

    if (!extension) {
      throw new BadRequestException(
        'fileName must include a valid file extension.',
      );
    }

    return extension;
  }

  private buildStoredFileName(
    fileNamePrefix: string | undefined,
    originalFileName: string,
    extension: string,
  ): string {
    const prefixSource =
      fileNamePrefix?.trim() || originalFileName.replace(extension, '');
    const safePrefix = prefixSource
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);

    return `${safePrefix || 'file'}-${randomUUID()}${extension}`;
  }

  private async ensureTargetDirectory(
    rootDirectory: string,
    directorySegments: string[],
  ) {
    const normalizedSegments =
      this.normalizeDirectorySegments(directorySegments);
    const directory = join(rootDirectory, ...normalizedSegments);

    await fs.mkdir(directory, { recursive: true });

    return directory;
  }

  private normalizeDirectorySegments(directorySegments: string[]) {
    if (!directorySegments.length) {
      throw new BadRequestException(
        'At least one target upload directory is required.',
      );
    }

    return directorySegments.map((segment) => {
      const normalized = segment.trim().replace(/[^A-Za-z0-9_-]/g, '-');

      if (!normalized) {
        throw new BadRequestException(
          'Upload directory contains an invalid segment.',
        );
      }

      return normalized;
    });
  }

  private buildPublicPath(
    prefix: '/uploads' | '/private-uploads',
    pathSegments: string[],
  ) {
    return `${prefix}/${pathSegments.join('/')}`;
  }

  private resolveManagedFile(publicPath: string | null | undefined): {
    absolutePath: string;
  } | null {
    if (!publicPath) {
      return null;
    }

    const rootConfig = publicPath.startsWith('/uploads/')
      ? {
          prefix: '/uploads/',
          absoluteRoot: this.uploadsRoot,
        }
      : publicPath.startsWith('/private-uploads/')
        ? {
            prefix: '/private-uploads/',
            absoluteRoot: this.privateUploadsRoot,
          }
        : null;

    if (!rootConfig) {
      return null;
    }

    const relativeSegments = publicPath
      .slice(rootConfig.prefix.length)
      .split('/')
      .filter((segment) => segment.length);
    const absolutePath = resolve(rootConfig.absoluteRoot, ...relativeSegments);
    const relativePath = relative(rootConfig.absoluteRoot, absolutePath);

    if (
      relativePath.startsWith('..') ||
      isAbsolute(relativePath) ||
      absolutePath === rootConfig.absoluteRoot
    ) {
      return null;
    }

    return {
      absolutePath,
    };
  }
}
