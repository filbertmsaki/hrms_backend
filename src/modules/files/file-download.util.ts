import { StreamableFile } from '@nestjs/common';

type DownloadableFile = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/["\r\n]/g, '_');
}

export function createDownloadStream(file: DownloadableFile): StreamableFile {
  return new StreamableFile(file.buffer, {
    type: file.mimeType,
    disposition: `attachment; filename="${sanitizeFileName(file.fileName)}"`,
    length: file.buffer.length,
  });
}
