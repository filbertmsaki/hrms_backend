import { Type } from 'class-transformer';
import { IsInt, IsString, Matches, MaxLength, Min } from 'class-validator';

export const FILE_NAME_PATTERN =
  /^(?!\.{1,2}$)(?!.*[\\/])[^<>:"|?*\r\n]+\.[A-Za-z0-9]{1,20}$/;
export const MIME_TYPE_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/;
export const BASE64_CONTENT_PATTERN =
  /^(?:data:[^;]+;base64,)?(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export class Base64FileDto {
  @IsString()
  @MaxLength(255)
  @Matches(FILE_NAME_PATTERN, {
    message: 'fileName must include a valid file name and extension.',
  })
  fileName: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  fileSize: number;

  @IsString()
  @MaxLength(150)
  @Matches(MIME_TYPE_PATTERN, {
    message: 'mimeType must be a valid MIME type.',
  })
  mimeType: string;

  @IsString()
  @Matches(BASE64_CONTENT_PATTERN, {
    message: 'fileString must be valid Base64 content.',
  })
  fileString: string;
}
