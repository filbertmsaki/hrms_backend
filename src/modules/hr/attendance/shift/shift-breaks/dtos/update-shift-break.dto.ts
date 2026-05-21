import { PartialType } from '@nestjs/swagger';
import { CreateShiftBreakDto } from './create-shift-break.dto';

export class UpdateShiftBreakDto extends PartialType(CreateShiftBreakDto) {}
