import {
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/** The signature itself: a typed name or a drawn image (PNG, base64). */
export class LeaveSignatureMarkDto {
  @IsIn(['TYPED', 'DRAWN'])
  kind: 'TYPED' | 'DRAWN';

  @ValidateIf((dto: LeaveSignatureMarkDto) => dto.kind === 'TYPED')
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  text?: string;

  /** PNG, base64 (optionally a data URL), max ~200 KB. */
  @ValidateIf((dto: LeaveSignatureMarkDto) => dto.kind === 'DRAWN')
  @IsString()
  @IsNotEmpty()
  @MaxLength(280_000)
  png_base64?: string;
}
