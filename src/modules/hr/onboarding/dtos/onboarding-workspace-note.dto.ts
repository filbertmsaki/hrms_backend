import { Transform } from 'class-transformer';
import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class OnboardingWorkspaceNoteDto {
  @IsString() @MaxLength(180) @MinLength(1) requirement_id: string;
  @IsIn(['internal', 'employee']) visibility: 'internal' | 'employee';
  @IsUUID() client_key: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;
}
