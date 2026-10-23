import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ApproveMobilePunchOverrideDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @Matches(/\S/, { message: 'reviewNote must include a non-whitespace reason' })
  reviewNote!: string;
}
