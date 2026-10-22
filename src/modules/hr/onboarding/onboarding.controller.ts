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
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Request as ExpressRequest } from 'express';
import { CurrentAuditContext } from '../../../common/decorators/audit-request-context.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import type { AuditRequestContext } from '../../../common/interfaces/audit-request-context.interface';
import { AcknowledgeOnboardingDto } from './dtos/acknowledge-onboarding.dto';
import { CancelOnboardingRequestDto } from './dtos/cancel-onboarding-request.dto';
import { CloneOnboardingWorkflowDto } from './dtos/clone-onboarding-workflow.dto';
import { CompleteOnboardingTaskDto } from './dtos/complete-onboarding-task.dto';
import { CreateOnboardingRequestDto } from './dtos/create-onboarding-request.dto';
import { CreateOnboardingTaskDto } from './dtos/create-onboarding-task.dto';
import { CreateOnboardingWorkflowStepDto } from './dtos/create-onboarding-workflow-step.dto';
import { CreateOnboardingWorkflowDto } from './dtos/create-onboarding-workflow.dto';
import { DelegateOnboardingApprovalDto } from './dtos/delegate-onboarding-approval.dto';
import { OnboardingApprovalActionDto } from './dtos/onboarding-approval-action.dto';
import { OnboardingRequestQueryDto } from './dtos/onboarding-request-query.dto';
import { OnboardingWorkflowQueryDto } from './dtos/onboarding-workflow-query.dto';
import { ReassignOnboardingTaskDto } from './dtos/reassign-onboarding-task.dto';
import { RejectOnboardingDto } from './dtos/reject-onboarding.dto';
import { ReviewOnboardingEmployeeDetailsDto } from './dtos/review-onboarding-employee-details.dto';
import { SubmitOnboardingEmployeeDetailsDto } from './dtos/submit-onboarding-employee-details.dto';
import { StartOnboardingWorkflowDto } from './dtos/start-onboarding-workflow.dto';
import { UpdateOnboardingRequestDto } from './dtos/update-onboarding-request.dto';
import { UpdateOnboardingWorkflowStepDto } from './dtos/update-onboarding-workflow-step.dto';
import { UpdateOnboardingWorkflowDto } from './dtos/update-onboarding-workflow.dto';
import { UpdateDocumentDto } from './dtos/update-document.dto';
import { UploadDocumentDto } from './dtos/upload-document.dto';
import { VerifyDocumentDto } from './dtos/verify-document.dto';
import { OnboardingService } from './onboarding.service';
import { OnboardingWorkspaceService } from './services/onboarding-workspace.service';
import { OnboardingWorkspaceNoteDto } from './dtos/onboarding-workspace-note.dto';
import { OnboardingOverviewQueryDto } from './dtos/onboarding-overview-query.dto';
import { createDownloadStream } from '../../files/file-download.util';

@ApiTags('Onboarding')
@ApiBearerAuth('access-token')
@Controller('onboarding')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class OnboardingController {
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly workspace: OnboardingWorkspaceService,
  ) {}

  @Get('requests/:id/workspace/notes')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_requests:read')
  workspaceNotes(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.workspace.notes(req.user.companyId!, id, req.user);
  }

  @Get('requests/:id/workspace/my-notes')
  employeeWorkspaceNotes(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.workspace.notes(req.user.companyId!, id, req.user, true);
  }

  @Post('requests/:id/workspace/notes')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_requests:update')
  addWorkspaceNote(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: OnboardingWorkspaceNoteDto,
  ) {
    return this.workspace.addNote(req.user.companyId!, id, req.user, dto);
  }

  @Post('requests/:id/workspace/visit')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_requests:read')
  visitWorkspace(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.workspace.visit(req.user.companyId!, id, req.user);
  }

  @Post('workflows')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_workflows:create')
  @ApiOperation({ summary: 'Create onboarding workflow' })
  createWorkflow(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateOnboardingWorkflowDto,
  ) {
    return this.onboardingService.createOnboardingWorkflow(
      req.user.companyId!,
      dto,
      req.user,
    );
  }

  @Get('workflows')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_workflows:read')
  @ApiOperation({ summary: 'List onboarding workflows' })
  listWorkflows(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: OnboardingWorkflowQueryDto,
  ) {
    return this.onboardingService.findAllOnboardingWorkflows(
      req.user.companyId!,
      query,
    );
  }

  @Get('workflows/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_workflows:read')
  @ApiOperation({ summary: 'Get onboarding workflow by id' })
  getWorkflow(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.onboardingService.findOneOnboardingWorkflow(
      req.user.companyId!,
      id,
    );
  }

  @Patch('workflows/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_workflows:update')
  @ApiOperation({ summary: 'Update onboarding workflow' })
  updateWorkflow(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOnboardingWorkflowDto,
  ) {
    return this.onboardingService.updateOnboardingWorkflow(
      req.user.companyId!,
      id,
      dto,
      req.user,
    );
  }

  @Post('workflows/:id/steps')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_workflows:update')
  @ApiOperation({ summary: 'Create onboarding workflow step' })
  createWorkflowStep(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateOnboardingWorkflowStepDto,
  ) {
    return this.onboardingService.createOnboardingWorkflowStep(
      req.user.companyId!,
      id,
      dto,
      req.user,
    );
  }

  @Patch('workflows/:id/steps/:stepId')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_workflows:update')
  @ApiOperation({ summary: 'Update onboarding workflow step' })
  updateWorkflowStep(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @Body() dto: UpdateOnboardingWorkflowStepDto,
  ) {
    return this.onboardingService.updateOnboardingWorkflowStep(
      req.user.companyId!,
      id,
      stepId,
      dto,
      req.user,
    );
  }

  @Delete('workflows/:id/steps/:stepId')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_workflows:update')
  @ApiOperation({ summary: 'Delete onboarding workflow step' })
  removeWorkflowStep(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('stepId', ParseIntPipe) stepId: number,
  ) {
    return this.onboardingService.removeOnboardingWorkflowStep(
      req.user.companyId!,
      id,
      stepId,
      req.user,
    );
  }

  @Delete('workflows/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_workflows:delete')
  @ApiOperation({ summary: 'Deactivate onboarding workflow' })
  removeWorkflow(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.onboardingService.removeOnboardingWorkflow(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Post('requests')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_requests:create')
  @ApiOperation({ summary: 'Create onboarding request' })
  createOnboardingRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateOnboardingRequestDto,
  ) {
    return this.onboardingService.createOnboardingRequest(
      req.user.companyId!,
      dto,
      req.user,
    );
  }

  @Patch('requests/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_requests:update')
  @ApiOperation({ summary: 'Update onboarding request' })
  updateOnboardingRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOnboardingRequestDto,
  ) {
    return this.onboardingService.updateOnboardingRequest(
      req.user.companyId!,
      id,
      dto,
      req.user,
    );
  }

  @Post('requests/:id/employee-details/submit')
  @ApiOperation({ summary: 'Submit my employee details for HR review' })
  submitEmployeeDetails(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitOnboardingEmployeeDetailsDto,
  ) {
    return this.onboardingService.submitEmployeeDetailsForReview(
      req.user.companyId!,
      id,
      req.user,
      dto,
    );
  }

  @Post('requests/:id/employee-details/review')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_requests:update')
  @ApiOperation({ summary: 'Review submitted employee onboarding details' })
  reviewEmployeeDetails(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewOnboardingEmployeeDetailsDto,
  ) {
    return this.onboardingService.reviewEmployeeDetails(
      req.user.companyId!,
      id,
      dto,
      req.user,
    );
  }

  @Post('requests/:id/submit')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_requests:update')
  @ApiOperation({
    summary: 'Start the workflow for a draft onboarding request',
  })
  submitDraftOnboardingRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StartOnboardingWorkflowDto,
  ) {
    return this.onboardingService.submitDraftOnboardingRequest(
      req.user.companyId!,
      id,
      dto,
      req.user,
    );
  }

  @Get('requests/overview')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_requests:read')
  @ApiOperation({
    summary: 'List scoped onboarding readiness in batches of 50',
  })
  getOverview(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: OnboardingOverviewQueryDto,
  ) {
    return this.onboardingService.getOverview(
      req.user.companyId!,
      query.after ?? 0,
      req.user,
    );
  }

  @Get('requests/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_requests:read')
  @ApiOperation({ summary: 'Get onboarding request by id' })
  getOnboardingRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.onboardingService.findOneOnboardingRequest(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Get('requests')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_requests:read')
  @ApiOperation({ summary: 'List onboarding requests' })
  listOnboardingRequests(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: OnboardingRequestQueryDto,
  ) {
    return this.onboardingService.findAllOnboardingRequests(
      req.user.companyId!,
      query,
      req.user,
    );
  }

  @Post('requests/:id/complete')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_requests:complete')
  @ApiOperation({ summary: 'Complete onboarding' })
  completeOnboarding(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.onboardingService.completeOnboarding(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Post('requests/:id/cancel')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_requests:cancel')
  @ApiOperation({ summary: 'Cancel onboarding' })
  cancelOnboarding(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelOnboardingRequestDto,
  ) {
    return this.onboardingService.cancelOnboarding(
      req.user.companyId!,
      id,
      dto,
      req.user,
    );
  }

  @Post('requests/:id/documents')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_documents:create')
  @ApiOperation({
    summary:
      'Upload onboarding document (stored in polymorphic documents table)',
  })
  uploadDocument(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UploadDocumentDto,
  ) {
    return this.onboardingService.addDocument(
      req.user.companyId!,
      id,
      dto,
      req.user,
    );
  }

  @Get('requests/:id/documents')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_documents:read')
  @ApiOperation({ summary: 'List onboarding documents' })
  listDocuments(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.onboardingService.listDocuments(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Post('requests/:id/acknowledge')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_requests:update')
  @ApiOperation({ summary: 'Record employee onboarding acknowledgement' })
  acknowledgeOnboarding(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AcknowledgeOnboardingDto,
  ) {
    return this.onboardingService.acknowledgeOnboarding(
      req.user.companyId!,
      id,
      dto,
      req.user,
      context,
    );
  }

  @Post('workflows/:id/clone')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_workflows:create')
  @ApiOperation({
    summary: 'Clone onboarding workflow into a new editable version',
  })
  cloneWorkflow(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CloneOnboardingWorkflowDto,
  ) {
    return this.onboardingService.cloneOnboardingWorkflow(
      req.user.companyId!,
      id,
      dto,
      req.user,
    );
  }

  @Get('requests/:id/documents/:documentId/download')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_documents:read')
  async downloadDocument(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('documentId', ParseIntPipe) documentId: number,
  ): Promise<StreamableFile> {
    const file = await this.onboardingService.downloadDocument(
      req.user.companyId!,
      id,
      documentId,
      req.user,
    );

    return createDownloadStream(file);
  }

  @Patch('requests/:id/documents/:documentId')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_documents:update')
  @ApiOperation({ summary: 'Update onboarding document metadata' })
  updateDocument(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.onboardingService.updateDocument(
      req.user.companyId!,
      id,
      documentId,
      dto,
      req.user,
    );
  }

  @Patch('requests/:id/documents/:documentId/verify')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_documents:verify')
  @ApiOperation({ summary: 'Verify or unverify onboarding document' })
  verifyDocument(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Body() dto: VerifyDocumentDto,
  ) {
    return this.onboardingService.verifyDocument(
      req.user.companyId!,
      id,
      documentId,
      dto,
      req.user,
    );
  }

  @Delete('requests/:id/documents/:documentId')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_documents:delete')
  @ApiOperation({ summary: 'Delete onboarding document' })
  removeDocument(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('documentId', ParseIntPipe) documentId: number,
  ) {
    return this.onboardingService.removeDocument(
      req.user.companyId!,
      id,
      documentId,
      req.user,
    );
  }

  @Get('requests/:id/tasks')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_tasks:read')
  @ApiOperation({ summary: 'List tasks for an onboarding request' })
  listTasks(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.onboardingService.findAllTasks(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Get('requests/:id/tasks/:taskId')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_tasks:read')
  @ApiOperation({ summary: 'Get a single onboarding task' })
  getTask(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    return this.onboardingService.findOneTask(
      req.user.companyId!,
      id,
      taskId,
      req.user,
    );
  }

  @Patch('requests/:id/tasks/:taskId/assign')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_tasks:update')
  @ApiOperation({ summary: 'Reassign an onboarding task' })
  reassignTask(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: ReassignOnboardingTaskDto,
  ) {
    return this.onboardingService.reassignTask(
      req.user.companyId!,
      id,
      taskId,
      dto,
      req.user,
    );
  }

  @Post('requests/:id/tasks')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_tasks:create')
  @ApiOperation({ summary: 'Create onboarding task' })
  createTask(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateOnboardingTaskDto,
  ) {
    return this.onboardingService.createTask(
      req.user.companyId!,
      id,
      dto,
      req.user,
    );
  }

  @Post('requests/:id/tasks/:taskId/complete')
  @ApiOperation({ summary: 'Complete onboarding task' })
  completeTask(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: CompleteOnboardingTaskDto,
  ) {
    return this.onboardingService.completeTask(
      req.user.companyId!,
      id,
      taskId,
      dto,
      req.user,
    );
  }

  @Post('requests/:id/approve')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_requests:approve')
  @ApiOperation({ summary: 'Approve onboarding request at current level' })
  approveOnboarding(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: OnboardingApprovalActionDto,
  ) {
    return this.onboardingService.applyApprovalAction(
      req.user.companyId!,
      id,
      dto,
      req.user,
    );
  }

  @Post('requests/:id/reject')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_requests:approve')
  @ApiOperation({ summary: 'Reject onboarding request at current level' })
  rejectOnboarding(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectOnboardingDto,
  ) {
    return this.onboardingService.applyApprovalAction(
      req.user.companyId!,
      id,
      {
        approve: false,
        comments: dto.comments,
        signature_url: dto.signature_url,
      },
      req.user,
    );
  }

  @Post('requests/:id/approvals/:approvalId/delegate')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_requests:update')
  @ApiOperation({ summary: 'Delegate a pending onboarding approval' })
  delegateApproval(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('approvalId', ParseIntPipe) approvalId: number,
    @Body() dto: DelegateOnboardingApprovalDto,
  ) {
    return this.onboardingService.delegateApproval(
      req.user.companyId!,
      id,
      approvalId,
      dto,
      req.user,
    );
  }

  @Get('requests/:id/readiness')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_requests:read')
  @ApiOperation({
    summary: 'Get activation requirements and outstanding blockers',
  })
  getActivationReadiness(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.onboardingService.getActivationReadiness(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Get('requests/:id/progress')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_requests:read')
  @ApiOperation({ summary: 'Get onboarding progress' })
  getOnboardingProgress(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.onboardingService.getOnboardingProgress(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Get('requests/:id/audit-logs')
  @UseGuards(PermissionsGuard)
  @Permissions('onboarding_requests:read')
  @ApiOperation({ summary: 'Get onboarding audit logs' })
  getOnboardingAuditLogs(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.onboardingService.getOnboardingAuditLogs(
      req.user.companyId!,
      id,
      req.user,
    );
  }
}
