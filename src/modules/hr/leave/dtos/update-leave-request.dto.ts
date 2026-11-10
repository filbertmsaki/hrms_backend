import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateLeaveRequestDto } from './create-leave-request.dto';

/** Editable fields of a draft or returned leave request. */
export class UpdateLeaveRequestDto extends PartialType(
  OmitType(CreateLeaveRequestDto, [
    'employee_id',
    'submit',
    'evidence_document_id',
  ] as const),
) {}
