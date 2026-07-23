import { PartialType } from '@nestjs/mapped-types';
import { CreateOffboardingSettlementItemDto } from './create-offboarding-settlement-item.dto';

export class UpdateOffboardingSettlementItemDto extends PartialType(
  CreateOffboardingSettlementItemDto,
) {}
