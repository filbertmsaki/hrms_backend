import { BadRequestException, Injectable } from '@nestjs/common';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { extname } from 'path';
import { Base64FileDto } from './dtos/base64-file.dto';
import { ProcessedImageFile } from './interfaces/processed-image-file.interface';

type ImageValidationOptions = {
  allowedMimeTypes: string[];
  allowedExtensions: string[];
  maxFileSizeBytes: number;
};

type RasterDimensions = {
  width: number;
  height: number;
};

const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);
const SVG_UNSAFE_TAGS = new Set([
  'script',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'audio',
  'video',
  'canvas',
  'style',
  'animate',
  'animatemotion',
  'animatetransform',
  'set',
]);
const SVG_UNSAFE_ATTRIBUTE_NAMES = new Set([
  'href',
  'xlink:href',
  'src',
  'style',
]);

@Injectable()
export class ImageProcessingService {
  private readonly xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    processEntities: false,
    allowBooleanAttributes: true,
    trimValues: true,
  });

  processDefaultAvatarBase64File(
    file: Base64FileDto,
    options: ImageValidationOptions,
  ): ProcessedImageFile {
    const originalFileName = file.fileName.trim();
    const fileExtension = this.normalizeExtension(
      extname(originalFileName).toLowerCase(),
    );
    const normalizedMimeType = file.mimeType.trim().toLowerCase();

    this.assertAllowedExtension(fileExtension, options.allowedExtensions);
    this.assertAllowedMimeType(normalizedMimeType, options.allowedMimeTypes);
    this.assertExtensionMimeMatch(fileExtension, normalizedMimeType);
    this.assertMaxFileSize(file.fileSize, options.maxFileSizeBytes);
    this.assertDataUriMimeMatches(file.fileString, normalizedMimeType);

    const buffer = this.decodeBase64FileString(file.fileString);

    if (buffer.length !== file.fileSize) {
      throw new BadRequestException(
        'fileSize does not match the decoded file content.',
      );
    }

    const processed = this.processImageBuffer(
      buffer,
      fileExtension,
      normalizedMimeType,
    );

    this.assertMaxFileSize(processed.buffer.length, options.maxFileSizeBytes);

    return {
      buffer: processed.buffer,
      originalFileName,
      mimeType: processed.mimeType,
      fileExtension,
      fileSize: processed.buffer.length,
      width: processed.width,
      height: processed.height,
    };
  }

  private processImageBuffer(
    buffer: Buffer,
    fileExtension: string,
    declaredMimeType: string,
  ): Omit<
    ProcessedImageFile,
    'originalFileName' | 'fileExtension' | 'fileSize'
  > {
    if (fileExtension === '.svg') {
      const svg = this.validateAndSanitizeSvg(buffer);

      if (declaredMimeType !== 'image/svg+xml') {
        throw new BadRequestException(
          'mimeType does not match the file extension.',
        );
      }

      return {
        buffer: Buffer.from(svg.content, 'utf8'),
        mimeType: 'image/svg+xml',
        width: svg.width,
        height: svg.height,
      };
    }

    if (fileExtension === '.png') {
      const dimensions = this.validatePng(buffer);

      if (declaredMimeType !== 'image/png') {
        throw new BadRequestException(
          'mimeType does not match the actual file content.',
        );
      }

      return {
        buffer,
        mimeType: 'image/png',
        width: dimensions.width,
        height: dimensions.height,
      };
    }

    if (fileExtension === '.jpg' || fileExtension === '.jpeg') {
      const dimensions = this.validateJpeg(buffer);

      if (declaredMimeType !== 'image/jpeg') {
        throw new BadRequestException(
          'mimeType does not match the actual file content.',
        );
      }

      return {
        buffer,
        mimeType: 'image/jpeg',
        width: dimensions.width,
        height: dimensions.height,
      };
    }

    throw new BadRequestException('Unsupported image file extension.');
  }

  private validatePng(buffer: Buffer): RasterDimensions {
    const pngSignature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    if (buffer.length < 33 || !buffer.subarray(0, 8).equals(pngSignature)) {
      throw new BadRequestException('The PNG file content is invalid.');
    }

    const ihdrLength = buffer.readUInt32BE(8);
    const ihdrType = buffer.subarray(12, 16).toString('ascii');

    if (ihdrLength !== 13 || ihdrType !== 'IHDR') {
      throw new BadRequestException('The PNG file content is invalid.');
    }

    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);

    if (width < 1 || height < 1) {
      throw new BadRequestException('PNG image dimensions are invalid.');
    }

    const hasIend = buffer.includes(Buffer.from('IEND', 'ascii'));

    if (!hasIend) {
      throw new BadRequestException('The PNG file appears to be corrupted.');
    }

    return { width, height };
  }

  private validateJpeg(buffer: Buffer): RasterDimensions {
    if (
      buffer.length < 12 ||
      buffer[0] !== 0xff ||
      buffer[1] !== 0xd8 ||
      buffer[buffer.length - 2] !== 0xff ||
      buffer[buffer.length - 1] !== 0xd9
    ) {
      throw new BadRequestException('The JPEG file content is invalid.');
    }

    let offset = 2;

    while (offset < buffer.length) {
      while (offset < buffer.length && buffer[offset] === 0xff) {
        offset += 1;
      }

      if (offset >= buffer.length) {
        break;
      }

      const marker = buffer[offset];
      offset += 1;

      if (marker === 0xd9) {
        break;
      }

      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        continue;
      }

      if (offset + 1 >= buffer.length) {
        break;
      }

      const segmentLength = buffer.readUInt16BE(offset);

      if (segmentLength < 2 || offset + segmentLength > buffer.length) {
        throw new BadRequestException('The JPEG file appears to be corrupted.');
      }

      if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
        if (segmentLength < 7) {
          throw new BadRequestException('JPEG image dimensions are invalid.');
        }

        const height = buffer.readUInt16BE(offset + 3);
        const width = buffer.readUInt16BE(offset + 5);

        if (width < 1 || height < 1) {
          throw new BadRequestException('JPEG image dimensions are invalid.');
        }

        return { width, height };
      }

      offset += segmentLength;
    }

    throw new BadRequestException('The JPEG file appears to be corrupted.');
  }

  private validateAndSanitizeSvg(buffer: Buffer): {
    content: string;
    width: number | null;
    height: number | null;
  } {
    const raw = buffer
      .toString('utf8')
      .replace(/^\uFEFF/, '')
      .trim();

    if (!raw || raw.includes('\u0000')) {
      throw new BadRequestException('The SVG file content is invalid.');
    }

    if (/<!(DOCTYPE|ENTITY)/i.test(raw)) {
      throw new BadRequestException(
        'SVG files must not contain DTD or entity declarations.',
      );
    }

    if (/<\?xml-stylesheet/i.test(raw)) {
      throw new BadRequestException(
        'SVG files must not contain external stylesheet declarations.',
      );
    }

    const validationResult = XMLValidator.validate(raw);

    if (validationResult !== true) {
      throw new BadRequestException('The SVG file content is malformed.');
    }

    const parsed = this.xmlParser.parse(raw) as Record<string, unknown>;
    const svgNode = parsed.svg;

    if (!svgNode || typeof svgNode !== 'object' || Array.isArray(svgNode)) {
      throw new BadRequestException(
        'The file must contain a valid SVG root element.',
      );
    }

    this.assertSvgNodeIsSafe('svg', svgNode as Record<string, unknown>);

    const dimensions = this.resolveSvgDimensions(
      svgNode as Record<string, unknown>,
    );

    return {
      content: raw,
      width: dimensions.width,
      height: dimensions.height,
    };
  }

  private assertSvgNodeIsSafe(
    nodeName: string,
    node: Record<string, unknown>,
  ): void {
    if (SVG_UNSAFE_TAGS.has(nodeName.toLowerCase())) {
      throw new BadRequestException(
        `SVG files must not contain the <${nodeName}> element.`,
      );
    }

    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('@_')) {
        this.assertSvgAttributeIsSafe(key.slice(2), value);
        continue;
      }

      if (key === '#text') {
        continue;
      }

      const childName = key.toLowerCase();

      if (SVG_UNSAFE_TAGS.has(childName)) {
        throw new BadRequestException(
          `SVG files must not contain the <${key}> element.`,
        );
      }

      if (Array.isArray(value)) {
        value.forEach((entry) => {
          if (entry && typeof entry === 'object') {
            this.assertSvgNodeIsSafe(
              childName,
              entry as Record<string, unknown>,
            );
          }
        });
        continue;
      }

      if (value && typeof value === 'object') {
        this.assertSvgNodeIsSafe(childName, value as Record<string, unknown>);
      }
    }
  }

  private assertSvgAttributeIsSafe(name: string, value: unknown) {
    const normalizedName = name.trim().toLowerCase();
    const stringValue = typeof value === 'string' ? value.trim() : '';
    const normalizedValue = stringValue.toLowerCase();

    if (normalizedName.startsWith('on')) {
      throw new BadRequestException(
        `SVG files must not contain the '${name}' event handler attribute.`,
      );
    }

    if (SVG_UNSAFE_ATTRIBUTE_NAMES.has(normalizedName)) {
      if (
        normalizedName === 'style' ||
        normalizedValue.startsWith('javascript:') ||
        normalizedValue.startsWith('data:') ||
        normalizedValue.startsWith('http:') ||
        normalizedValue.startsWith('https:') ||
        normalizedValue.startsWith('file:') ||
        normalizedValue.startsWith('//') ||
        (normalizedName !== 'style' && !normalizedValue.startsWith('#'))
      ) {
        throw new BadRequestException(
          `SVG files must not contain unsafe '${name}' attribute values.`,
        );
      }
    }

    if (
      normalizedValue.includes('javascript:') ||
      normalizedValue.includes('expression(') ||
      normalizedValue.includes('url(http') ||
      normalizedValue.includes('url(https') ||
      normalizedValue.includes('url(data:') ||
      normalizedValue.includes('url(file:')
    ) {
      throw new BadRequestException(
        `SVG files must not contain unsafe '${name}' attribute values.`,
      );
    }
  }

  private resolveSvgDimensions(node: Record<string, unknown>) {
    const width = this.parseSvgDimension(node['@_width']);
    const height = this.parseSvgDimension(node['@_height']);

    if (width !== null && height !== null) {
      return { width, height };
    }

    const viewBox =
      typeof node['@_viewBox'] === 'string' ? node['@_viewBox'] : null;

    if (viewBox) {
      const values = viewBox
        .trim()
        .split(/[\s,]+/)
        .map((value) => Number(value));

      if (
        values.length === 4 &&
        values.every((value) => Number.isFinite(value))
      ) {
        const parsedWidth = width ?? Math.round(values[2]);
        const parsedHeight = height ?? Math.round(values[3]);

        return {
          width: parsedWidth > 0 ? parsedWidth : null,
          height: parsedHeight > 0 ? parsedHeight : null,
        };
      }
    }

    return {
      width,
      height,
    };
  }

  private parseSvgDimension(value: unknown): number | null {
    if (typeof value !== 'string') {
      return null;
    }

    const match = value.trim().match(/^(\d+(?:\.\d+)?)(px)?$/i);

    if (!match) {
      return null;
    }

    const parsed = Number(match[1]);

    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
  }

  private decodeBase64FileString(value: string): Buffer {
    const normalized = value.trim().replace(/^data:[^;]+;base64,/i, '');
    const compact = normalized.replace(/\s+/g, '');
    const buffer = Buffer.from(compact, 'base64');

    if (!buffer.length || buffer.toString('base64') !== compact) {
      throw new BadRequestException(
        'fileString must contain valid Base64 data.',
      );
    }

    return buffer;
  }

  private assertDataUriMimeMatches(fileString: string, mimeType: string) {
    const match = fileString.trim().match(/^data:([^;]+);base64,/i);

    if (!match) {
      return;
    }

    if (match[1].trim().toLowerCase() !== mimeType) {
      throw new BadRequestException(
        'The Base64 data URI MIME type does not match the declared mimeType.',
      );
    }
  }

  private assertAllowedMimeType(mimeType: string, allowedMimeTypes: string[]) {
    const allowedSet = new Set(
      allowedMimeTypes.map((value) => value.trim().toLowerCase()),
    );

    if (!allowedSet.has(mimeType)) {
      throw new BadRequestException(
        `mimeType '${mimeType}' is not allowed for this upload.`,
      );
    }
  }

  private assertAllowedExtension(
    fileExtension: string,
    allowedExtensions: string[],
  ) {
    const allowedSet = new Set(
      allowedExtensions.map((value) => this.normalizeExtension(value)),
    );

    if (!allowedSet.has(fileExtension)) {
      throw new BadRequestException(
        `The file extension '${fileExtension}' is not allowed for this upload.`,
      );
    }
  }

  private assertExtensionMimeMatch(fileExtension: string, mimeType: string) {
    const expectedMimeTypes =
      this.getExpectedMimeTypesForExtension(fileExtension);

    if (!expectedMimeTypes.includes(mimeType)) {
      throw new BadRequestException(
        'The file extension does not match the declared mimeType.',
      );
    }
  }

  private getExpectedMimeTypesForExtension(fileExtension: string) {
    switch (fileExtension) {
      case '.svg':
        return ['image/svg+xml'];
      case '.jpg':
      case '.jpeg':
        return ['image/jpeg'];
      case '.png':
        return ['image/png'];
      default:
        return [];
    }
  }

  private assertMaxFileSize(fileSize: number, maxFileSizeBytes: number) {
    if (fileSize > maxFileSizeBytes) {
      throw new BadRequestException(
        `The uploaded file exceeds the maximum size of ${maxFileSizeBytes} bytes.`,
      );
    }
  }

  private normalizeExtension(extension: string) {
    if (!extension.startsWith('.')) {
      return `.${extension.toLowerCase()}`;
    }

    return extension.toLowerCase();
  }
}
