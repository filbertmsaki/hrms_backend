import { BadRequestException } from '@nestjs/common';
import { ImageProcessingService } from './image-processing.service';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z1ioAAAAASUVORK5CYII=';
const VALID_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#123456"/>
</svg>`;

function buildMinimalJpegBase64() {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11,
    0x08, 0x00, 0x01, 0x00, 0x01, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00,
    0x03, 0x11, 0x00, 0xff, 0xd9,
  ]).toString('base64');
}

const JPEG_BASE64 = buildMinimalJpegBase64();

describe('ImageProcessingService', () => {
  let service: ImageProcessingService;

  beforeEach(() => {
    service = new ImageProcessingService();
  });

  it.each([
    [
      'avatar.svg',
      'image/svg+xml',
      Buffer.from(VALID_SVG, 'utf8').toString('base64'),
      'image/svg+xml',
      '.svg',
    ],
    ['avatar.jpg', 'image/jpeg', JPEG_BASE64, 'image/jpeg', '.jpg'],
    ['avatar.jpeg', 'image/jpeg', JPEG_BASE64, 'image/jpeg', '.jpeg'],
    ['avatar.png', 'image/png', PNG_BASE64, 'image/png', '.png'],
  ])(
    'accepts a valid %s upload',
    (fileName, mimeType, fileString, expectedMimeType, expectedExtension) => {
      const result = service.processDefaultAvatarBase64File(
        {
          fileName,
          fileSize: Buffer.from(fileString, 'base64').length,
          mimeType,
          fileString,
        },
        {
          allowedMimeTypes: ['image/svg+xml', 'image/jpeg', 'image/png'],
          allowedExtensions: ['.svg', '.jpg', '.jpeg', '.png'],
          maxFileSizeBytes: 5 * 1024 * 1024,
        },
      );

      expect(result.mimeType).toBe(expectedMimeType);
      expect(result.fileExtension).toBe(expectedExtension);
      expect(result.fileSize).toBeGreaterThan(0);
    },
  );

  it('rejects an invalid mime type', () => {
    expect(() =>
      service.processDefaultAvatarBase64File(
        {
          fileName: 'avatar.png',
          fileSize: Buffer.from(PNG_BASE64, 'base64').length,
          mimeType: 'image/gif',
          fileString: PNG_BASE64,
        },
        {
          allowedMimeTypes: ['image/svg+xml', 'image/jpeg', 'image/png'],
          allowedExtensions: ['.svg', '.jpg', '.jpeg', '.png'],
          maxFileSizeBytes: 5 * 1024 * 1024,
        },
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects an unsupported extension', () => {
    expect(() =>
      service.processDefaultAvatarBase64File(
        {
          fileName: 'avatar.gif',
          fileSize: Buffer.from(PNG_BASE64, 'base64').length,
          mimeType: 'image/png',
          fileString: PNG_BASE64,
        },
        {
          allowedMimeTypes: ['image/svg+xml', 'image/jpeg', 'image/png'],
          allowedExtensions: ['.svg', '.jpg', '.jpeg', '.png'],
          maxFileSizeBytes: 5 * 1024 * 1024,
        },
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects an extension and mime type mismatch', () => {
    expect(() =>
      service.processDefaultAvatarBase64File(
        {
          fileName: 'avatar.png',
          fileSize: Buffer.from(PNG_BASE64, 'base64').length,
          mimeType: 'image/jpeg',
          fileString: PNG_BASE64,
        },
        {
          allowedMimeTypes: ['image/svg+xml', 'image/jpeg', 'image/png'],
          allowedExtensions: ['.svg', '.jpg', '.jpeg', '.png'],
          maxFileSizeBytes: 5 * 1024 * 1024,
        },
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a corrupted PNG image', () => {
    expect(() =>
      service.processDefaultAvatarBase64File(
        {
          fileName: 'avatar.png',
          fileSize: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', 'base64')
            .length,
          mimeType: 'image/png',
          fileString: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
        },
        {
          allowedMimeTypes: ['image/svg+xml', 'image/jpeg', 'image/png'],
          allowedExtensions: ['.svg', '.jpg', '.jpeg', '.png'],
          maxFileSizeBytes: 5 * 1024 * 1024,
        },
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a corrupted JPEG image', () => {
    const corruptedJpeg = JPEG_BASE64.slice(0, -20);

    expect(() =>
      service.processDefaultAvatarBase64File(
        {
          fileName: 'avatar.jpg',
          fileSize: Buffer.from(corruptedJpeg, 'base64').length,
          mimeType: 'image/jpeg',
          fileString: corruptedJpeg,
        },
        {
          allowedMimeTypes: ['image/svg+xml', 'image/jpeg', 'image/png'],
          allowedExtensions: ['.svg', '.jpg', '.jpeg', '.png'],
          maxFileSizeBytes: 5 * 1024 * 1024,
        },
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a malformed SVG', () => {
    const malformedSvg = '<svg><g></svg>';

    expect(() =>
      service.processDefaultAvatarBase64File(
        {
          fileName: 'avatar.svg',
          fileSize: Buffer.byteLength(malformedSvg),
          mimeType: 'image/svg+xml',
          fileString: Buffer.from(malformedSvg, 'utf8').toString('base64'),
        },
        {
          allowedMimeTypes: ['image/svg+xml', 'image/jpeg', 'image/png'],
          allowedExtensions: ['.svg', '.jpg', '.jpeg', '.png'],
          maxFileSizeBytes: 5 * 1024 * 1024,
        },
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects an unsafe SVG payload', () => {
    const unsafeSvg =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';

    expect(() =>
      service.processDefaultAvatarBase64File(
        {
          fileName: 'avatar.svg',
          fileSize: Buffer.byteLength(unsafeSvg),
          mimeType: 'image/svg+xml',
          fileString: Buffer.from(unsafeSvg, 'utf8').toString('base64'),
        },
        {
          allowedMimeTypes: ['image/svg+xml', 'image/jpeg', 'image/png'],
          allowedExtensions: ['.svg', '.jpg', '.jpeg', '.png'],
          maxFileSizeBytes: 5 * 1024 * 1024,
        },
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects an oversized upload', () => {
    expect(() =>
      service.processDefaultAvatarBase64File(
        {
          fileName: 'avatar.png',
          fileSize: 6 * 1024 * 1024,
          mimeType: 'image/png',
          fileString: PNG_BASE64,
        },
        {
          allowedMimeTypes: ['image/svg+xml', 'image/jpeg', 'image/png'],
          allowedExtensions: ['.svg', '.jpg', '.jpeg', '.png'],
          maxFileSizeBytes: 5 * 1024 * 1024,
        },
      ),
    ).toThrow(BadRequestException);
  });
});
