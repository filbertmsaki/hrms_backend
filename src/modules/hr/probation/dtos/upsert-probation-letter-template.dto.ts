import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ProbationLetterTypeEnum } from '../enums/probation-letter-type.enum';

export class UpsertProbationLetterTemplateDto {
  @IsEnum(ProbationLetterTypeEnum)
  letter_type: ProbationLetterTypeEnum;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  letterhead: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  body: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  signatory_name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  signatory_title: string;
}
