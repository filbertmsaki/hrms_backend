import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { CancelOffboardingRequestDto } from './dtos/cancel-offboarding-request.dto';
import { CompleteOffboardingClearanceDto } from './dtos/complete-offboarding-clearance.dto';
import { CompleteOffboardingTaskDto } from './dtos/complete-offboarding-task.dto';
import { CreateOffboardingClearanceDto } from './dtos/create-offboarding-clearance.dto';
import { CreateOffboardingRequestDto } from './dtos/create-offboarding-request.dto';
import { CreateOffboardingTaskDto } from './dtos/create-offboarding-task.dto';
import { CreateOffboardingWorkflowStepDto } from './dtos/create-offboarding-workflow-step.dto';
import { CreateOffboardingWorkflowDto } from './dtos/create-offboarding-workflow.dto';
import { OffboardingApprovalActionDto } from './dtos/offboarding-approval-action.dto';
import { OffboardingRequestQueryDto } from './dtos/offboarding-request-query.dto';
import { OffboardingWorkflowQueryDto } from './dtos/offboarding-workflow-query.dto';
import { RejectOffboardingTaskDto } from './dtos/reject-offboarding-task.dto';
import { RejectOffboardingDto } from './dtos/reject-offboarding.dto';
import { SubmitOffboardingRequestDto } from './dtos/submit-offboarding-request.dto';
import { UpdateOffboardingRequestDto } from './dtos/update-offboarding-request.dto';
import { UpdateOffboardingWorkflowStepDto } from './dtos/update-offboarding-workflow-step.dto';
import { UpdateOffboardingWorkflowDto } from './dtos/update-offboarding-workflow.dto';
import { UploadOffboardingDocumentDto } from './dtos/upload-offboarding-document.dto';
import { OffboardingService } from './offboarding.service';

@ApiTags('Offboarding')
@ApiBearerAuth('access-token')
@Controller('offboarding')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class OffboardingController {
  constructor(private readonly offboardingService: OffboardingService) {}

  private getRequestContext(req: ExpressRequest): {
    ip_address: string | null;
    user_agent: string | null;
  } {
    const userAgentHeader = req.headers['user-agent'];
    return {
      ip_address: req.ip ?? null,
      user_agent: typeof userAgentHeader === 'string' ? userAgentHeader : null,
    };
  }

  @Post('workflows')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_workflows:create')
  @ApiOperation({ summary: 'Create offboarding workflow' })
  createWorkflow(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateOffboardingWorkflowDto,
  ) {
    return this.offboardingService.createOffboardingWorkflow(
      req.user.companyId!,
      dto,
      req.user,
    );
  }

  @Get('workflows')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_workflows:read')
  @ApiOperation({ summary: 'List offboarding workflows' })
  listWorkflows(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: OffboardingWorkflowQueryDto,
  ) {
    return this.offboardingService.findAllOffboardingWorkflows(req.user.companyId!, query);
  }

  @Get('workflows/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_workflows:read')
  @ApiOperation({ summary: 'Get offboarding workflow by id' })
  getWorkflow(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.offboardingService.findOneOffboardingWorkflow(req.user.companyId!, id);
  }

  @Patch('workflows/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_workflows:update')
  @ApiOperation({ summary: 'Update offboarding workflow' })
  updateWorkflow(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOffboardingWorkflowDto,
  ) {
    return this.offboardingService.updateOffboardingWorkflow(
      req.user.companyId!,
      id,
      dto,
      req.user,
    );
  }

  @Post('workflows/:id/steps')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_workflows:update')
  @ApiOperation({ summary: 'Create offboarding workflow step' })
  createWorkflowStep(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateOffboardingWorkflowStepDto,
  ) {
    return this.offboardingService.createOffboardingWorkflowStep(
      req.user.companyId!,
      id,
      dto,
      req.user,
    );
  }

  @Patch('workflows/:id/steps/:stepId')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_workflows:update')
  @ApiOperation({ summary: 'Update offboarding workflow step' })
  updateWorkflowStep(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @Body() dto: UpdateOffboardingWorkflowStepDto,
  ) {
    return this.offboardingService.updateOffboardingWorkflowStep(
      req.user.companyId!,
      id,
      stepId,
      dto,
      req.user,
    );
  }

  @Delete('workflows/:id/steps/:stepId')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_workflows:update')
  @ApiOperation({ summary: 'Delete offboarding workflow step' })
  removeWorkflowStep(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('stepId', ParseIntPipe) stepId: number,
  ) {
    return this.offboardingService.removeOffboardingWorkflowStep(
      req.user.companyId!,
      id,
      stepId,
      req.user,
    );
  }

  @Delete('workflows/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_workflows:delete')
  @ApiOperation({ summary: 'Deactivate offboarding workflow' })
  removeWorkflow(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.offboardingService.removeOffboardingWorkflow(req.user.companyId!, id, req.user);
  }

  @Post('requests')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:create')
  @ApiOperation({ summary: 'Create offboarding request' })
  createOffboardingRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateOffboardingRequestDto,
  ) {
    return this.offboardingService.createOffboardingRequest(
      req.user.companyId!,
      dto,
      req.user,
      this.getRequestContext(req),
    );
  }

  @Post('requests/:id/submit')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:submit')
  @ApiOperation({ summary: 'Submit offboarding request' })
  submitOffboardingRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitOffboardingRequestDto,
  ) {
    return this.offboardingService.submitOffboardingRequest(
      req.user.companyId!,
      id,
      dto,
      req.user,
      this.getRequestContext(req),
    );
  }

  @Patch('requests/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:update')
  @ApiOperation({ summary: 'Update offboarding request' })
  updateOffboardingRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOffboardingRequestDto,
  ) {
    return this.offboardingService.updateOffboardingRequest(
      req.user.companyId!,
      id,
      dto,
      req.user,
      this.getRequestContext(req),
    );
  }

  @Post('requests/:id/cancel')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:cancel')
  @ApiOperation({ summary: 'Cancel offboarding request' })
  cancelOffboardingRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelOffboardingRequestDto,
  ) {
    return this.offboardingService.cancelOffboardingRequest(
      req.user.companyId!,
      id,
      dto,
      req.user,
      this.getRequestContext(req),
    );
  }

  @Post('requests/:id/complete')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:complete')
  @ApiOperation({ summary: 'Complete offboarding request' })
  completeOffboardingRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.offboardingService.completeOffboardingRequest(
      req.user.companyId!,
      id,
      req.user,
      this.getRequestContext(req),
    );
  }

  @Get('requests/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:read')
  @ApiOperation({ summary: 'Get offboarding request by id' })
  getOffboardingRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.offboardingService.findOneOffboardingRequest(req.user.companyId!, id, req.user);
  }

  @Get('requests')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:read')
  @ApiOperation({ summary: 'List offboarding requests' })
  listOffboardingRequests(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: OffboardingRequestQueryDto,
  ) {
    return this.offboardingService.findAllOffboardingRequests(req.user.companyId!, query, req.user);
  }

  @Post('requests/:id/documents')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_documents:create')
  @ApiOperation({ summary: 'Upload offboarding document' })
  uploadDocument(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UploadOffboardingDocumentDto,
  ) {
    return this.offboardingService.addDocument(
      req.user.companyId!,
      id,
      dto,
      req.user,
      this.getRequestContext(req),
    );
  }

  @Get('requests/:id/documents')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_documents:read')
  @ApiOperation({ summary: 'List offboarding documents' })
  listDocuments(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.offboardingService.listDocuments(req.user.companyId!, id, req.user);
  }

  @Post('requests/:id/tasks')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_tasks:create')
  @ApiOperation({ summary: 'Create offboarding task' })
  createTask(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateOffboardingTaskDto,
  ) {
    return this.offboardingService.createTask(
      req.user.companyId!,
      id,
      dto,
      req.user,
      this.getRequestContext(req),
    );
  }

  @Post('requests/:id/tasks/:taskId/complete')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_tasks:complete')
  @ApiOperation({ summary: 'Complete offboarding task' })
  completeTask(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: CompleteOffboardingTaskDto,
  ) {
    return this.offboardingService.completeTask(
      req.user.companyId!,
      id,
      taskId,
      dto,
      req.user,
      this.getRequestContext(req),
    );
  }

  @Post('requests/:id/tasks/:taskId/reject')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_tasks:reject')
  @ApiOperation({ summary: 'Reject offboarding task' })
  rejectTask(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: RejectOffboardingTaskDto,
  ) {
    return this.offboardingService.rejectTask(
      req.user.companyId!,
      id,
      taskId,
      dto,
      req.user,
      this.getRequestContext(req),
    );
  }

  @Post('requests/:id/approve')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:approve')
  @ApiOperation({ summary: 'Approve offboarding request at current level' })
  approveOffboarding(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: OffboardingApprovalActionDto,
  ) {
    return this.offboardingService.applyApprovalAction(
      req.user.companyId!,
      id,
      { approve: true, comments: dto.comments },
      req.user,
      this.getRequestContext(req),
    );
  }

  @Post('requests/:id/reject')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:approve')
  @ApiOperation({ summary: 'Reject offboarding request at current level' })
  rejectOffboarding(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectOffboardingDto,
  ) {
    return this.offboardingService.applyApprovalAction(
      req.user.companyId!,
      id,
      { approve: false, comments: dto.comments },
      req.user,
      this.getRequestContext(req),
    );
  }

  @Post('requests/:id/clearances')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_clearances:create')
  @ApiOperation({ summary: 'Create offboarding clearance' })
  createClearance(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateOffboardingClearanceDto,
  ) {
    return this.offboardingService.createClearance(
      req.user.companyId!,
      id,
      dto,
      req.user,
      this.getRequestContext(req),
    );
  }

  @Post('requests/:id/clearances/:clearanceId/complete')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_clearances:complete')
  @ApiOperation({ summary: 'Complete offboarding clearance' })
  completeClearance(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('clearanceId', ParseIntPipe) clearanceId: number,
    @Body() dto: CompleteOffboardingClearanceDto,
  ) {
    return this.offboardingService.completeClearance(
      req.user.companyId!,
      id,
      clearanceId,
      dto,
      req.user,
      this.getRequestContext(req),
    );
  }

  @Get('requests/:id/progress')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:read')
  @ApiOperation({ summary: 'Get offboarding progress' })
  getProgress(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.offboardingService.getProgress(req.user.companyId!, id, req.user);
  }

  @Get('requests/:id/approvals')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:read')
  @ApiOperation({ summary: 'Get offboarding approvals' })
  getApprovals(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.offboardingService.getApprovals(req.user.companyId!, id, req.user);
  }

  @Get('requests/:id/audit-logs')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:read')
  @ApiOperation({ summary: 'Get offboarding audit logs' })
  getAuditLogs(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.offboardingService.getAuditLogs(req.user.companyId!, id, req.user);
  }
}

