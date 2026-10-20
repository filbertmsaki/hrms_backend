import { IsDateString, IsNotEmpty, IsString, MaxLength } from 'class-validator';
export class ExtendLeaveEvidenceDto {
  @IsDateString()
  evidence_due_at: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}
