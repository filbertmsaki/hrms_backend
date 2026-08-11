import { Type } from 'class-transformer';
import { IsBoolean, IsString, MaxLength } from 'class-validator';

export class AcknowledgeOnboardingDto {
  @Type(() => Boolean)
  @IsBoolean()
  accepted: boolean;

  @IsString()
  @MaxLength(50)
  acknowledgement_version: string;
}
