export interface ProcessedImageFile {
  buffer: Buffer;
  originalFileName: string;
  mimeType: string;
  fileExtension: string;
  fileSize: number;
  width: number | null;
  height: number | null;
}
