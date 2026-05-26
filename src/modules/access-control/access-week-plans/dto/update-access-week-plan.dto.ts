import { PartialType } from '@nestjs/mapped-types';
import { CreateAccessWeekPlanDto } from './create-access-week-plan.dto';

export class UpdateAccessWeekPlanDto extends PartialType(CreateAccessWeekPlanDto) {}
