import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { CreateMyLeaveRequestDto } from '../../self-service/dtos/create-my-leave-request.dto';
import { CreateLeaveRequestDto } from './create-leave-request.dto';

/** A leave request to dry-run: everything except the reason and submit flag. */
export class PreviewLeaveRequestDto extends OmitType(CreateLeaveRequestDto, [
  'reason',
  'submit',
  'evidence_document_id',
] as const) {
  @ApiPropertyOptional({
    description: 'The request being edited, so it does not overlap itself.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  ignore_request_id?: number;
}

/** The employee's own request to dry-run. */
export class PreviewMyLeaveRequestDto extends OmitType(
  CreateMyLeaveRequestDto,
  ['reason', 'submit', 'evidence_document_id'] as const,
) {
  @ApiPropertyOptional({
    description: 'The request being edited, so it does not overlap itself.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  ignore_request_id?: number;
}
