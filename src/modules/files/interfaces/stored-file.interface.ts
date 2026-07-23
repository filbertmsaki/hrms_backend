export interface StoredFile {
  originalFileName: string;
  storedFileName: string;
  mimeType: string;
  fileExtension: string;
  fileSize: number;
  absolutePath: string;
  publicPath: string;
}
