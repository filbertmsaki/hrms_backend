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
import { Type } from 'class-transformer';
import { IsInt, IsString, Matches, MaxLength, Min } from 'class-validator';
import type { Request } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { LeaveOpeningReviewService } from './services/leave-opening-review.service';

class ReviewOpeningPreviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  balance_id: number;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  fingerprint: string;

  @IsString()
  @MaxLength(500)
  reason: string;
}

@ApiTags('Leave')
@ApiBearerAuth('access-token')
@Controller('leave/opening-preview-reviews')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class LeaveOpeningReviewsController {
  constructor(private readonly reviews: LeaveOpeningReviewService) {}

  @Get(':balanceId')
  @Permissions('leave-balances.manage')
  @ApiOperation({ summary: 'List recorded legacy balance preview reviews' })
  list(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('balanceId', ParseIntPipe) balanceId: number,
  ) {
    return this.reviews.listPreviewReviews(
      req.user.companyId!,
      req.user,
      balanceId,
    );
  }

  @Post()
  @Permissions('leave-balances.manage')
  @ApiOperation({
    summary: 'Record review of a legacy balance preview (not cutover sign-off)',
  })
  review(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() dto: ReviewOpeningPreviewDto,
  ) {
    return this.reviews.recordPreviewReview(req.user.companyId!, req.user, {
      balanceId: dto.balance_id,
      fingerprint: dto.fingerprint,
      reason: dto.reason,
    });
  }
}
