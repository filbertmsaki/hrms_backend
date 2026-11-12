import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { KpiRoles, KpiRolesGuard } from './kpi-roles.guard';
import {
  AchievementDraftDto,
  AchievementReviewDto,
  AchievementUpdateDto,
  EvidenceRuleDto,
  EvidenceUploadDto,
} from './dto/achievement.dto';
import { AchievementService } from './achievement.service';

type SessionRequest = Request & { user: AuthenticatedUser };
const managers = [
  'COMPANY_ADMIN',
  'HR_MANAGER',
  'DEPARTMENT_MANAGER',
  'BRANCH_MANAGER',
];
const readers = ['EMPLOYEE', ...managers, 'MANAGEMENT'];

@ApiTags('KPI Phase 3 Achievements')
@ApiBearerAuth('access-token')
@Controller('hr/kpi')
@UseGuards(AuthGuard('jwt'), TenantGuard, KpiRolesGuard)
export class AchievementController {
  constructor(private readonly service: AchievementService) {}
  @Get('me/achievements') @KpiRoles(...readers) mine(
    @Req() req: SessionRequest,
  ) {
    return this.service.mine(req.user);
  }
  @Get('achievements/pending') @KpiRoles(...managers) pending(
    @Req() req: SessionRequest,
    @Query('status') status?: string,
  ) {
    return this.service.pending(req.user, status);
  }
  @Post('achievements') @KpiRoles(...readers) create(
    @Req() req: SessionRequest,
    @Body() dto: AchievementDraftDto,
  ) {
    return this.service.create(req.user, dto);
  }
  @Get('achievements/:id') @KpiRoles(...readers) get(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.get(req.user, id);
  }
  @Patch('achievements/:id/draft') @KpiRoles(...readers) update(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AchievementUpdateDto,
  ) {
    return this.service.update(req.user, id, dto);
  }
  @Post('achievements/:id/submit') @KpiRoles(...readers) submit(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AchievementReviewDto,
  ) {
    return this.service.submit(req.user, id, dto.rowVersion);
  }
  @Post('achievements/:id/review') @KpiRoles(...managers) review(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AchievementReviewDto,
  ) {
    return this.service.startReview(req.user, id, dto.rowVersion);
  }
  @Post('achievements/:id/approve') @KpiRoles(...managers) approve(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AchievementReviewDto,
  ) {
    return this.service.decide(req.user, id, 'approved', dto);
  }
  @Post('achievements/:id/return') @KpiRoles(...managers) returnForCorrection(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AchievementReviewDto,
  ) {
    return this.service.decide(req.user, id, 'returned', dto);
  }
  @Post('achievements/:id/reject') @KpiRoles(...managers) reject(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AchievementReviewDto,
  ) {
    return this.service.decide(req.user, id, 'rejected', dto);
  }
  @Post('achievements/:id/correction') @KpiRoles(...managers) correction(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.correction(req.user, id);
  }
  @Post('achievements/:id/evidence') @KpiRoles(...readers) upload(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EvidenceUploadDto,
  ) {
    return this.service.upload(req.user, id, dto);
  }
  @Get('achievements/:id/evidence/:evidenceId') @KpiRoles(...readers) download(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('evidenceId', ParseIntPipe) evidenceId: number,
  ) {
    return this.service.download(req.user, id, evidenceId);
  }
  @Put('definition-versions/:id/evidence-rule')
  @KpiRoles('COMPANY_ADMIN', 'HR_MANAGER')
  evidenceRule(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EvidenceRuleDto,
  ) {
    return this.service.evidenceRule(req.user, id, dto.required);
  }
}
