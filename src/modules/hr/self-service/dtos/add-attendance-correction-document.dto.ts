import { IsDefined, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Base64FileDto } from '../../../files/dtos/base64-file.dto';

export class AddAttendanceCorrectionDocumentDto {
  @IsDefined()
  @Type(() => Base64FileDto)
  @ValidateNested()
  file: Base64FileDto;
}
