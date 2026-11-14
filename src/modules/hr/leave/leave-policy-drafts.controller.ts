import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsObject, IsString, Matches, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { LeavePolicyDraftService } from './services/leave-policy-draft.service';

class CreateLeavePolicyDraftDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  proposed_effective_date: string;

  @IsObject()
  rules: Record<string, unknown>;

  @IsString()
  @MaxLength(500)
  reason: string;
}

class ValidateLeavePolicyDraftDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  proposed_effective_date: string;

  @IsObject()
  rules: Record<string, unknown>;
}

@ApiTags('Leave')
@ApiBearerAuth('access-token')
@Controller('leave/policies/:policyId/draft-revisions')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class LeavePolicyDraftsController {
  constructor(private readonly drafts: LeavePolicyDraftService) {}

  @Post('validate')
  @Permissions('leave_policies:update')
  @ApiOperation({
    summary:
      'Validate the shape of a Mainland policy draft without activating it',
  })
  validate(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('policyId', ParseIntPipe) policyId: number,
    @Body() dto: ValidateLeavePolicyDraftDto,
  ) {
    return this.drafts.validate(
      req.user.companyId!,
      policyId,
      dto.proposed_effective_date,
      dto.rules,
    );
  }

  @Get()
  @Permissions('leave_policies:read')
  @ApiOperation({
    summary: 'List stored leave policy drafts; drafts are not active',
  })
  list(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('policyId', ParseIntPipe) policyId: number,
  ) {
    return this.drafts.list(req.user.companyId!, policyId);
  }

  @Post()
  @Permissions('leave_policies:update')
  @ApiOperation({ summary: 'Store an inactive leave policy draft revision' })
  create(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('policyId', ParseIntPipe) policyId: number,
    @Body() dto: CreateLeavePolicyDraftDto,
  ) {
    return this.drafts.create(req.user.companyId!, policyId, req.user, {
      proposedEffectiveDate: dto.proposed_effective_date,
      rules: dto.rules,
      reason: dto.reason,
    });
  }
}
