import { Type } from 'class-transformer';
import { IsDefined, ValidateNested } from 'class-validator';
import { Base64FileDto } from '../../../files/dtos/base64-file.dto';

export class AddLeaveDocumentDto {
  @IsDefined()
  @Type(() => Base64FileDto)
  @ValidateNested()
  file: Base64FileDto;
}
