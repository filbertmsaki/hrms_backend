import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
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
  CloneDto,
  PolicyDraftDto,
  PolicyDto,
  PreviewDto,
  ScorecardCreateDto,
  ScorecardDraftDto,
  ScorecardTemplateDto,
  UseScorecardTemplateDto,
} from './dto/scorecard.dto';
import { ScorecardService } from './scorecard.service';

type SessionRequest = Request & { user: AuthenticatedUser };
const admins = ['COMPANY_ADMIN', 'HR_MANAGER'];
const managers = [...admins, 'DEPARTMENT_MANAGER', 'BRANCH_MANAGER'];
const readers = [...managers, 'MANAGEMENT'];

@ApiTags('KPI Phase 2 Scorecards')
@ApiBearerAuth('access-token')
@Controller('hr/kpi')
@UseGuards(AuthGuard('jwt'), TenantGuard, KpiRolesGuard)
export class ScorecardController {
  constructor(private readonly service: ScorecardService) {}
  @Get('scorecards') @KpiRoles(...readers) list(@Req() req: SessionRequest) {
    return this.service.list(req.user);
  }
  @Get('scorecards/me') @KpiRoles('EMPLOYEE', ...readers) mine(
    @Req() req: SessionRequest,
  ) {
    return this.service.mine(req.user);
  }
  @Post('scorecards') @KpiRoles(...managers) create(
    @Req() req: SessionRequest,
    @Body() dto: ScorecardCreateDto,
  ) {
    return this.service.create(req.user, dto);
  }
  @Get('scorecards/:id') @KpiRoles('EMPLOYEE', ...readers) get(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.get(req.user, id);
  }
  @Patch('scorecards/:id/draft') @KpiRoles(...managers) update(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ScorecardDraftDto,
  ) {
    return this.service.updateDraft(req.user, id, dto);
  }
  @Post('scorecards/:id/revisions') @KpiRoles(...managers) revise(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.revise(req.user, id);
  }
  @Post('scorecards/:id/publish') @KpiRoles(...managers) publish(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.publish(req.user, id);
  }
  @Post('scorecards/:id/activate') @KpiRoles(...managers) activate(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.activate(req.user, id);
  }
  @Post('scorecards/:id/clone') @KpiRoles(...managers) clone(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CloneDto,
  ) {
    return this.service.clone(req.user, id, dto);
  }
  @Delete('scorecards/:id') @KpiRoles(...managers) archive(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.archive(req.user, id);
  }
  @Post('scorecards/:id/preview') @KpiRoles(...managers) preview(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PreviewDto,
  ) {
    return this.service.preview(req.user, id, dto);
  }

  @Get('scoring-policies') @KpiRoles(...readers) policies(
    @Req() req: SessionRequest,
  ) {
    return this.service.listPolicies(req.user);
  }
  @Post('scoring-policies') @KpiRoles(...admins) createPolicy(
    @Req() req: SessionRequest,
    @Body() dto: PolicyDto,
  ) {
    return this.service.createPolicy(req.user, dto);
  }
  @Get('scoring-policies/:id') @KpiRoles(...readers) policy(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.getPolicy(req.user, id);
  }
  @Patch('scoring-policies/:id/draft') @KpiRoles(...admins) updatePolicy(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PolicyDraftDto,
  ) {
    return this.service.updatePolicyDraft(req.user, id, dto);
  }
  @Post('scoring-policies/:id/revisions') @KpiRoles(...admins) revisePolicy(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.revisePolicy(req.user, id);
  }
  @Post('scoring-policies/:id/publish') @KpiRoles(...admins) publishPolicy(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.publishPolicy(req.user, id);
  }

  @Get('scorecard-templates') @KpiRoles(...readers) templates(
    @Req() req: SessionRequest,
  ) {
    return this.service.listTemplates(req.user);
  }
  @Post('scorecard-templates') @KpiRoles(...admins) createTemplate(
    @Req() req: SessionRequest,
    @Body() dto: ScorecardTemplateDto,
  ) {
    return this.service.createTemplate(req.user, dto);
  }
  @Patch('scorecard-templates/:id') @KpiRoles(...admins) updateTemplate(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ScorecardTemplateDto,
  ) {
    return this.service.updateTemplate(req.user, id, dto);
  }
  @Post('scorecard-templates/:id/publish') @KpiRoles(...admins) publishTemplate(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.publishTemplate(req.user, id);
  }
  @Post('scorecard-templates/:id/scorecards')
  @KpiRoles(...managers)
  useTemplate(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UseScorecardTemplateDto,
  ) {
    return this.service.useTemplate(req.user, id, dto);
  }
}
