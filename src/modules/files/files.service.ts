import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import { extname, join, resolve } from 'path';
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
};

type SaveBase64FileOptions = Omit<
  SaveBufferFileOptions,
  'buffer' | 'fileName' | 'fileSize' | 'mimeType'
>;

@Injectable()
export class FilesService {
  private readonly uploadsRoot = resolve(process.cwd(), 'uploads');
  private readonly privateUploadsRoot = resolve(
    process.cwd(),
    'private-uploads',
  );

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
    this.assertBufferSize(options.buffer, options.fileSize);

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

    await fs.writeFile(absolutePath, options.buffer);

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

  private assertBufferSize(buffer: Buffer, declaredFileSize?: number) {
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

    if (!absolutePath.startsWith(rootConfig.absoluteRoot)) {
      return null;
    }

    return {
      absolutePath,
    };
  }
}
