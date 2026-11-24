import { IsEnum, Matches, IsString, MaxLength } from 'class-validator';
import { ProbationLetterTypeEnum } from '../enums/probation-letter-type.enum';

export class UpsertProbationLetterTemplateDto {
  @IsEnum(ProbationLetterTypeEnum)
  letter_type: ProbationLetterTypeEnum;

  @IsString()
  @Matches(/\S/, { message: '$property must contain text' })
  @MaxLength(1000)
  letterhead: string;

  @IsString()
  @Matches(/\S/, { message: '$property must contain text' })
  @MaxLength(10000)
  body: string;

  @IsString()
  @Matches(/\S/, { message: '$property must contain text' })
  @MaxLength(160)
  signatory_name: string;

  @IsString()
  @Matches(/\S/, { message: '$property must contain text' })
  @MaxLength(160)
  signatory_title: string;
}
