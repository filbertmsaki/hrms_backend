import { PartialType } from '@nestjs/swagger';
import { CreateEmployeeTimetableDto } from './create-employee-timetable.dto';

export class UpdateEmployeeTimetableDto extends PartialType(CreateEmployeeTimetableDto) {}
