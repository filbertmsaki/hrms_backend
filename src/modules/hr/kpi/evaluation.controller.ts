import {
  Body,
  Controller,
  Get,
  Logger,
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
  EvaluationActionDto,
  EvaluationAckDto,
  EvaluationCycleDto,
  EvaluationDeadlineExceptionDto,
  EvaluationDeadlinePolicyDto,
  EvaluationEnrollDto,
  EvaluationReviewerDto,
  EvaluationTemplateDto,
  ManagerAssessmentDto,
  SelfAssessmentDto,
  TemplateRevisionDto,
} from './dto/evaluation.dto';
import { EvaluationService } from './evaluation.service';
import { KpiWorkflowService } from './kpi-workflow.service';

type SessionRequest = Request & { user: AuthenticatedUser };
const administrators = ['COMPANY_ADMIN', 'HR_MANAGER'];
const reviewers = [...administrators, 'DEPARTMENT_MANAGER', 'BRANCH_MANAGER'];
const readers = [...reviewers, 'EMPLOYEE'];

@ApiTags('KPI Phase 4 Evaluations')
@ApiBearerAuth('access-token')
@Controller('hr/kpi/evaluations')
@UseGuards(AuthGuard('jwt'), TenantGuard, KpiRolesGuard)
export class EvaluationController {
  private readonly logger = new Logger(EvaluationController.name);
  constructor(
    private readonly service: EvaluationService,
    private readonly workflow: KpiWorkflowService,
  ) {}
  @Get('templates') @KpiRoles(...administrators) templates(
    @Req() req: SessionRequest,
  ) {
    return this.service.templates(req.user);
  }
  @Post('templates') @KpiRoles(...administrators) createTemplate(
    @Req() req: SessionRequest,
    @Body() dto: EvaluationTemplateDto,
  ) {
    return this.service.createTemplate(req.user, dto);
  }
  @Post('templates/:id/revisions') @KpiRoles(...administrators) reviseTemplate(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TemplateRevisionDto,
  ) {
    return this.service.reviseTemplate(req.user, id, dto);
  }
  @Post('template-versions/:id/publish')
  @KpiRoles(...administrators)
  publishTemplate(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.publishTemplate(req.user, id);
  }
  @Get('cycles') @KpiRoles(...administrators) cycles(
    @Req() req: SessionRequest,
  ) {
    return this.service.cycles(req.user);
  }
  @Post('cycles') @KpiRoles(...administrators) createCycle(
    @Req() req: SessionRequest,
    @Body() dto: EvaluationCycleDto,
  ) {
    return this.service.createCycle(req.user, dto);
  }
  @Post('cycles/:id/open') @KpiRoles(...administrators) openCycle(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.cycleStatus(req.user, id, 'open');
  }
  @Post('cycles/:id/in-progress') @KpiRoles(...administrators) inProgressCycle(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.cycleStatus(req.user, id, 'in_progress');
  }
  @Post('cycles/:id/review') @KpiRoles(...administrators) reviewCycle(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.cycleStatus(req.user, id, 'review');
  }
  @Post('cycles/:id/close') @KpiRoles(...administrators) closeCycle(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.cycleStatus(req.user, id, 'closed');
  }
  @Post('cycles/:id/participants') @KpiRoles(...administrators) enroll(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EvaluationEnrollDto,
  ) {
    return this.service.enroll(req.user, id, dto);
  }
  @Post('cycles/:id/deadline-policy')
  @KpiRoles(...administrators)
  deadlinePolicy(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EvaluationDeadlinePolicyDto,
  ) {
    return this.service.setDeadlinePolicy(req.user, id, dto);
  }
  @Get('dashboard') @KpiRoles(...readers) dashboard(
    @Req() req: SessionRequest,
  ) {
    return this.service.dashboard(req.user);
  }
  @Get('me') @KpiRoles(...readers) mine(@Req() req: SessionRequest) {
    return this.service.mine(req.user);
  }
  @Get() @KpiRoles(...readers) list(@Req() req: SessionRequest) {
    return this.service.list(req.user);
  }
  @Get(':id') @KpiRoles(...readers) get(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.get(req.user, id);
  }
  @Patch(':id/self') @KpiRoles(...readers) self(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SelfAssessmentDto,
  ) {
    return this.service.saveSelf(req.user, id, dto);
  }
  @Post(':id/self/submit') @KpiRoles(...readers) submitSelf(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EvaluationActionDto,
  ) {
    return this.service.submitSelf(req.user, id, dto);
  }
  @Patch(':id/manager') @KpiRoles(...reviewers) manager(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ManagerAssessmentDto,
  ) {
    return this.service.saveManager(req.user, id, dto);
  }
  @Post(':id/manager/submit') @KpiRoles(...reviewers) submitManager(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EvaluationActionDto,
  ) {
    return this.service.managerAction(req.user, id, 'submit', dto);
  }
  @Post(':id/manager/return') @KpiRoles(...reviewers) returnSelf(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EvaluationActionDto,
  ) {
    return this.service.managerAction(req.user, id, 'return', dto);
  }
  @Post(':id/hr/review') @KpiRoles(...administrators) hrReview(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EvaluationActionDto,
  ) {
    return this.service.hrAction(req.user, id, 'review', dto);
  }
  @Post(':id/hr/approve') @KpiRoles(...administrators) hrApprove(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EvaluationActionDto,
  ) {
    return this.service.hrAction(req.user, id, 'approve', dto);
  }
  @Post(':id/hr/return') @KpiRoles(...administrators) hrReturn(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EvaluationActionDto,
  ) {
    return this.service.hrAction(req.user, id, 'return', dto);
  }
  @Post(':id/finalize') @KpiRoles(...administrators) async finalize(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EvaluationActionDto,
  ) {
    const result = await this.service.finalize(req.user, id, dto);
    await this.workflow
      .resolveIssue(req.user.companyId!, `hr_finalization:${id}`)
      .catch(() =>
        this.logger.warn(
          'KPI reminder resolution failed after a successful operation',
        ),
      );
    return result;
  }
  @Post(':id/acknowledge') @KpiRoles(...readers) acknowledge(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EvaluationAckDto,
  ) {
    return this.service.acknowledge(req.user, id, dto);
  }
  @Post(':id/amend') @KpiRoles(...administrators) amend(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason: string,
  ) {
    return this.service.amend(req.user, id, reason);
  }
  @Post(':id/cancel') @KpiRoles(...administrators) cancel(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EvaluationActionDto,
  ) {
    return this.service.cancel(req.user, id, dto);
  }
  @Post(':id/reassign-manager') @KpiRoles(...administrators) reassign(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body('managerEmployeeId', ParseIntPipe) managerEmployeeId: number,
    @Body('reason') reason: string,
  ) {
    return this.service.reassignManager(
      req.user,
      id,
      managerEmployeeId,
      reason,
    );
  }
  @Post(':id/reassign-hr-reviewer') @KpiRoles(...administrators) reassignHr(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EvaluationReviewerDto,
  ) {
    return this.service.reassignHrReviewer(req.user, id, dto);
  }
  @Post(':id/deadline-exceptions')
  @KpiRoles(...administrators)
  deadlineException(
    @Req() req: SessionRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EvaluationDeadlineExceptionDto,
  ) {
    return this.service.grantDeadlineException(req.user, id, dto);
  }
}
