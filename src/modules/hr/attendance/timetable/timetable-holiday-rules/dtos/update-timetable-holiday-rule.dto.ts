import { PartialType } from '@nestjs/swagger';
import { CreateTimetableHolidayRuleDto } from './create-timetable-holiday-rule.dto';

export class UpdateTimetableHolidayRuleDto extends PartialType(CreateTimetableHolidayRuleDto) {}
