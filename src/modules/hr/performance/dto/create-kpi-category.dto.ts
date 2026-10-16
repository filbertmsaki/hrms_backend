import { Transform } from 'class-transformer';
import { IsString, IsOptional, MaxLength, MinLength } from 'class-validator';
export class CreateKpiCategoryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.normalize('NFC').trim().replace(/\s+/g, ' ')
      : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}
