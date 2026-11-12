import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import {
  AssignmentDto,
  AssignmentUpdateDto,
  DefinitionDto,
  PeriodDto,
  TargetRevisionDto,
  TemplateDto,
} from './dto/kpi.dto';
import { KpiPermissions, KpiRoles, KpiRolesGuard } from './kpi-roles.guard';
import { KpiService } from './kpi.service';
import { KpiWorkflowService } from './kpi-workflow.service';

type SessionRequest = Request & { user: AuthenticatedUser };
const admin = ['COMPANY_ADMIN', 'HR_MANAGER'];
const assign = [...admin, 'DEPARTMENT_MANAGER', 'BRANCH_MANAGER'];
const read = [...assign, 'MANAGEMENT'];

@ApiTags('KPI Phase 1A')
@ApiBearerAuth('access-token')
@Controller('hr/kpi')
@UseGuards(AuthGuard('jwt'), TenantGuard, KpiRolesGuard)
export class KpiController {
  private readonly logger = new Logger(KpiController.name);
  constructor(
    private readonly service: KpiService,
    private readonly workflow: KpiWorkflowService,
  ) {}
  @Post('definitions') @KpiRoles(...admin) createDefinition(
    @Req() req: SessionRequest,
    @Body() dto: DefinitionDto,
  ) {
    return this.service.createDefinition(req.user, dto);
  }
  @Get('definitions')
  @KpiPermissions('kpi_assignments:read')
  @KpiRoles(...read)
  listDefinitions(
    @Req() req: SessionRequest,
    @Query('search') search?: string,
  ) {
    return this.service.listDefinitions(req.user, search);
  }
  @Get('definitions/:id')
  @KpiPermissions('kpi_assignments:read')
  @KpiRoles(...read)
  getDefinition(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.getDefinition(req.user, id);
  }
  @Patch('definitions/:id/draft') @KpiRoles(...admin) updateDefinition(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DefinitionDto,
  ) {
    return this.service.updateDraft(req.user, id, dto);
  }
  @Post('definitions/:id/revisions') @KpiRoles(...admin) createRevision(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.createRevision(req.user, id);
  }
  @Post('definitions/:id/publish') @KpiRoles(...admin) async publishDefinition(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.service.publishDefinition(req.user, id);
    await this.workflow
      .resolveIssue(req.user.companyId!, 'definition')
      .catch(() =>
        this.logger.warn(
          'KPI reminder resolution failed after a successful operation',
        ),
      );
    return result;
  }
  @Delete('definitions/:id') @KpiRoles(...admin) archiveDefinition(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.archiveDefinition(req.user, id);
  }
  @Post('templates') @KpiRoles(...admin) createTemplate(
    @Req() req: SessionRequest,
    @Body() dto: TemplateDto,
  ) {
    return this.service.createTemplate(req.user, dto);
  }
  @Get('templates') @KpiRoles(...read) listTemplates(
    @Req() req: SessionRequest,
    @Query('search') search?: string,
    @Query('status') status?: 'draft' | 'published',
  ) {
    return this.service.listTemplates(req.user, search, status);
  }
  @Patch('templates/:id') @KpiRoles(...admin) updateTemplate(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TemplateDto,
  ) {
    return this.service.updateTemplate(req.user, id, dto);
  }
  @Post('templates/:id/publish') @KpiRoles(...admin) publishTemplate(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.publishTemplate(req.user, id);
  }
  @Post('templates/:id/definitions') @KpiRoles(...admin) createFromTemplate(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body('code') code: string,
  ) {
    return this.service.createFromTemplate(req.user, id, code);
  }
  @Post('periods') @KpiRoles(...admin) async createPeriod(
    @Req() req: SessionRequest,
    @Body() dto: PeriodDto,
  ) {
    const result = await this.service.createPeriod(req.user, dto);
    await this.workflow
      .resolveIssue(req.user.companyId!, 'period')
      .catch(() =>
        this.logger.warn(
          'KPI reminder resolution failed after a successful operation',
        ),
      );
    return result;
  }
  @Get('periods')
  @KpiPermissions('kpi_assignments:read')
  @KpiRoles(...read)
  listPeriods(@Req() req: SessionRequest) {
    return this.service.listPeriods(req.user);
  }
  @Post('assignments')
  @KpiPermissions('kpi_assignments:create')
  @KpiRoles(...assign)
  async createAssignment(
    @Req() req: SessionRequest,
    @Body() dto: AssignmentDto,
  ) {
    const result = await this.service.createAssignment(req.user, dto);
    if (dto.subjectType === 'employee')
      await this.workflow
        .resolveIssue(req.user.companyId!, 'assignment', dto.subjectId)
        .catch(() =>
          this.logger.warn(
            'KPI reminder resolution failed after a successful operation',
          ),
        );
    return result;
  }
  @Get('assignments')
  @KpiPermissions('kpi_assignments:read')
  @KpiRoles(...read)
  listAssignments(@Req() req: SessionRequest) {
    return this.service.listAssignments(req.user);
  }
  @Get('assignments/:id')
  @KpiPermissions('kpi_assignments:read')
  @KpiRoles(...read)
  getAssignment(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.getAssignment(req.user, id);
  }
  @Patch('assignments/:id')
  @KpiPermissions('kpi_assignments:update')
  @KpiRoles(...assign)
  updateAssignment(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignmentUpdateDto,
  ) {
    return this.service.updateAssignment(req.user, id, dto);
  }
  @Post('assignments/:id/targets')
  @KpiPermissions('kpi_targets:revise')
  @KpiRoles(...assign)
  reviseTarget(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TargetRevisionDto,
  ) {
    return this.service.reviseTarget(req.user, id, dto);
  }
  @Get('me/assignments') @KpiRoles('EMPLOYEE', ...read) personalAssignments(
    @Req() req: SessionRequest,
  ) {
    return this.service.personalAssignments(req.user);
  }
}
