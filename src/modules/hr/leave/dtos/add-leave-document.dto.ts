import { IsString, MaxLength } from 'class-validator';

export class AddLeaveDocumentDto {
  @IsString()
  file_url: string;

  @IsString()
  @MaxLength(180)
  file_name: string;

  @IsString()
  @MaxLength(80)
  file_type: string;
}
