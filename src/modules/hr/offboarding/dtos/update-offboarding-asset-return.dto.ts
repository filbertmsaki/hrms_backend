import { PartialType } from '@nestjs/mapped-types';
import { CreateOffboardingAssetReturnDto } from './create-offboarding-asset-return.dto';

export class UpdateOffboardingAssetReturnDto extends PartialType(
  CreateOffboardingAssetReturnDto,
) {}
