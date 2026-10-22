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
import {
  Permissions,
  PermissionsAny,
} from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { AssignOffboardingClearanceDto } from './dtos/assign-offboarding-clearance.dto';
import { CancelOffboardingRequestDto } from './dtos/cancel-offboarding-request.dto';
import { CompleteOffboardingClearanceDto } from './dtos/complete-offboarding-clearance.dto';
import { CompleteOffboardingTaskDto } from './dtos/complete-offboarding-task.dto';
import { CreateOffboardingActionDto } from './dtos/create-offboarding-action.dto';
import { CreateOffboardingAssetReturnDto } from './dtos/create-offboarding-asset-return.dto';
import { CreateOffboardingClearanceDto } from './dtos/create-offboarding-clearance.dto';
import { CreateOffboardingRequestDto } from './dtos/create-offboarding-request.dto';
import { CreateOffboardingSettlementItemDto } from './dtos/create-offboarding-settlement-item.dto';
import { CreateOffboardingTaskDto } from './dtos/create-offboarding-task.dto';
import { CreateOffboardingWorkflowStepDto } from './dtos/create-offboarding-workflow-step.dto';
import { CreateOffboardingWorkflowDto } from './dtos/create-offboarding-workflow.dto';
import { MyOffboardingApprovalQueryDto } from './dtos/my-offboarding-approval-query.dto';
import { MyOffboardingClearanceQueryDto } from './dtos/my-offboarding-clearance-query.dto';
import { MyOffboardingTaskQueryDto } from './dtos/my-offboarding-task-query.dto';
import { OffboardingApprovalActionDto } from './dtos/offboarding-approval-action.dto';
import { OffboardingDashboardQueryDto } from './dtos/offboarding-dashboard-query.dto';
import { OffboardingRequestQueryDto } from './dtos/offboarding-request-query.dto';
import { OffboardingWorkflowQueryDto } from './dtos/offboarding-workflow-query.dto';
import { ReassignOffboardingTaskDto } from './dtos/reassign-offboarding-task.dto';
import { ReopenOffboardingTaskDto } from './dtos/reopen-offboarding-task.dto';
import { RejectOffboardingTaskDto } from './dtos/reject-offboarding-task.dto';
import { RejectOffboardingDto } from './dtos/reject-offboarding.dto';
import { SubmitOffboardingRequestDto } from './dtos/submit-offboarding-request.dto';
import { UpdateOffboardingActionDto } from './dtos/update-offboarding-action.dto';
import { UpdateOffboardingAssetReturnDto } from './dtos/update-offboarding-asset-return.dto';
import { UpdateOffboardingRequestDto } from './dtos/update-offboarding-request.dto';
import { UpdateOffboardingSettlementItemDto } from './dtos/update-offboarding-settlement-item.dto';
import { UpdateOffboardingWorkflowStepDto } from './dtos/update-offboarding-workflow-step.dto';
import { UpdateOffboardingWorkflowDto } from './dtos/update-offboarding-workflow.dto';
import { UpdateOffboardingDocumentDto } from './dtos/update-offboarding-document.dto';
import { UpsertOffboardingExitInterviewDto } from './dtos/upsert-offboarding-exit-interview.dto';
import { UploadOffboardingDocumentDto } from './dtos/upload-offboarding-document.dto';
import { EmergencyAccessTerminationDto } from './dtos/emergency-access-termination.dto';
import { DelegateOffboardingApprovalDto } from './dtos/delegate-offboarding-approval.dto';
import { OffboardingService } from './offboarding.service';
import { OffboardingNoticeService } from './services/offboarding-notice.service';
import { UpsertOffboardingNoticePolicyDto } from './dtos/upsert-offboarding-notice-policy.dto';
import { createDownloadStream } from '../../files/file-download.util';

@ApiTags('Offboarding')
@ApiBearerAuth('access-token')
@Controller('offboarding')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class OffboardingController {
  constructor(
    private readonly offboardingService: OffboardingService,
    private readonly noticeService: OffboardingNoticeService,
  ) {}

  @Get('notice-policies')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:read')
  listNoticePolicies(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.noticeService.listPolicies(req.user.companyId!);
  }

  @Post('notice-policies')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:update')
  createNoticePolicy(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: UpsertOffboardingNoticePolicyDto,
  ) {
    return this.noticeService.createPolicy(req.user.companyId!, dto);
  }

  @Patch('notice-policies/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:update')
  updateNoticePolicy(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertOffboardingNoticePolicyDto,
  ) {
    return this.noticeService.updatePolicy(req.user.companyId!, id, dto);
  }

  @Delete('notice-policies/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:update')
  deleteNoticePolicy(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.noticeService.deletePolicy(req.user.companyId!, id);
  }

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
    return this.offboardingService.findAllOffboardingWorkflows(
      req.user.companyId!,
      query,
    );
  }

  @Get('workflows/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_workflows:read')
  @ApiOperation({ summary: 'Get offboarding workflow by id' })
  getWorkflow(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.offboardingService.findOneOffboardingWorkflow(
      req.user.companyId!,
      id,
    );
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
    return this.offboardingService.removeOffboardingWorkflow(
      req.user.companyId!,
      id,
      req.user,
    );
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

  @Get('requests/:id/access-operations')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_access:read')
  @ApiOperation({ summary: 'List access-termination operations' })
  listAccessOperations(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.offboardingService.listAccessOperations(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Post('requests/:id/access-termination/retry')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_access:retry')
  @ApiOperation({ summary: 'Retry a failed access termination' })
  retryAccessTermination(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.offboardingService.retryAccessTermination(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Post('requests/:id/access-termination/emergency')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_access:emergency-terminate')
  @ApiOperation({ summary: 'Immediately terminate employee access' })
  emergencyTerminateAccess(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EmergencyAccessTerminationDto,
  ) {
    return this.offboardingService.emergencyTerminateAccess(
      req.user.companyId!,
      id,
      dto,
      req.user,
      this.getRequestContext(req),
    );
  }

  @Post('requests/:id/finalize')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:finalize')
  @ApiOperation({ summary: 'Finalize employee offboarding' })
  finalizeOffboarding(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.offboardingService.finalizeOffboarding(
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
    return this.offboardingService.findOneOffboardingRequest(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Get('requests')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:read')
  @ApiOperation({ summary: 'List offboarding requests' })
  listOffboardingRequests(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: OffboardingRequestQueryDto,
  ) {
    return this.offboardingService.findAllOffboardingRequests(
      req.user.companyId!,
      query,
      req.user,
    );
  }

  @Get('dashboard')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:read')
  @ApiOperation({ summary: 'Get offboarding operational dashboard' })
  getDashboard(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: OffboardingDashboardQueryDto,
  ) {
    return this.offboardingService.getDashboard(
      req.user.companyId!,
      query,
      req.user,
    );
  }

  @Get('tasks/my')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_tasks:read')
  @ApiOperation({ summary: 'List my assigned offboarding tasks' })
  listMyTasks(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: MyOffboardingTaskQueryDto,
  ) {
    return this.offboardingService.findMyOffboardingTasks(req.user, query);
  }

  @Get('clearances/my')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_clearances:read')
  @ApiOperation({ summary: 'List my assigned offboarding clearances' })
  listMyClearances(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: MyOffboardingClearanceQueryDto,
  ) {
    return this.offboardingService.findMyOffboardingClearances(req.user, query);
  }

  @Get('approvals/my')
  @ApiOperation({ summary: 'List my offboarding approvals' })
  listMyApprovals(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: MyOffboardingApprovalQueryDto,
  ) {
    return this.offboardingService.findMyOffboardingApprovals(req.user, query);
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
    return this.offboardingService.listDocuments(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Get('requests/:id/letters')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_letters:read')
  @ApiOperation({ summary: 'List generated relieving and service letters' })
  listLetters(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.offboardingService.listLetters(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Get('requests/:id/documents/:documentId/download')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_documents:read')
  async downloadDocument(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('documentId', ParseIntPipe) documentId: number,
  ): Promise<StreamableFile> {
    const file = await this.offboardingService.downloadDocument(
      req.user.companyId!,
      id,
      documentId,
      req.user,
      this.getRequestContext(req),
    );

    return createDownloadStream(file);
  }

  @Patch('requests/:id/documents/:documentId')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_documents:update')
  @ApiOperation({ summary: 'Update offboarding document metadata' })
  updateDocument(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Body() dto: UpdateOffboardingDocumentDto,
  ) {
    return this.offboardingService.updateDocument(
      req.user.companyId!,
      id,
      documentId,
      dto,
      req.user,
      this.getRequestContext(req),
    );
  }

  @Delete('requests/:id/documents/:documentId')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_documents:delete')
  @ApiOperation({ summary: 'Delete offboarding document' })
  removeDocument(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('documentId', ParseIntPipe) documentId: number,
  ) {
    return this.offboardingService.removeDocument(
      req.user.companyId!,
      id,
      documentId,
      req.user,
      this.getRequestContext(req),
    );
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

  @Get('requests/:id/actions')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:read')
  @ApiOperation({ summary: 'List offboarding actions' })
  listActions(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.offboardingService.listActions(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Post('requests/:id/actions')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:update')
  @ApiOperation({ summary: 'Create offboarding action' })
  createAction(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateOffboardingActionDto,
  ) {
    return this.offboardingService.createAction(
      req.user.companyId!,
      id,
      dto,
      req.user,
      this.getRequestContext(req),
    );
  }

  @Patch('requests/:id/actions/:actionId')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:update')
  @ApiOperation({ summary: 'Update offboarding action' })
  updateAction(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('actionId', ParseIntPipe) actionId: number,
    @Body() dto: UpdateOffboardingActionDto,
  ) {
    return this.offboardingService.updateAction(
      req.user.companyId!,
      id,
      actionId,
      dto,
      req.user,
      this.getRequestContext(req),
    );
  }

  @Get('requests/:id/assets')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:read')
  @ApiOperation({ summary: 'List offboarding asset returns' })
  listAssetReturns(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.offboardingService.listAssetReturns(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Post('requests/:id/assets')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:update')
  @ApiOperation({ summary: 'Create offboarding asset return entry' })
  createAssetReturn(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateOffboardingAssetReturnDto,
  ) {
    return this.offboardingService.createAssetReturn(
      req.user.companyId!,
      id,
      dto,
      req.user,
      this.getRequestContext(req),
    );
  }

  @Patch('requests/:id/assets/:assetReturnId')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:update')
  @ApiOperation({ summary: 'Update offboarding asset return entry' })
  updateAssetReturn(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('assetReturnId', ParseIntPipe) assetReturnId: number,
    @Body() dto: UpdateOffboardingAssetReturnDto,
  ) {
    return this.offboardingService.updateAssetReturn(
      req.user.companyId!,
      id,
      assetReturnId,
      dto,
      req.user,
      this.getRequestContext(req),
    );
  }

  @Get('requests/:id/settlements')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:read')
  @ApiOperation({ summary: 'List offboarding settlement items' })
  listSettlementItems(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.offboardingService.listSettlementItems(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Post('requests/:id/settlements')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:update')
  @ApiOperation({ summary: 'Create offboarding settlement item' })
  createSettlementItem(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateOffboardingSettlementItemDto,
  ) {
    return this.offboardingService.createSettlementItem(
      req.user.companyId!,
      id,
      dto,
      req.user,
      this.getRequestContext(req),
    );
  }

  @Patch('requests/:id/settlements/:itemId')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:update')
  @ApiOperation({ summary: 'Update offboarding settlement item' })
  updateSettlementItem(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdateOffboardingSettlementItemDto,
  ) {
    return this.offboardingService.updateSettlementItem(
      req.user.companyId!,
      id,
      itemId,
      dto,
      req.user,
      this.getRequestContext(req),
    );
  }

  @Get('requests/:id/exit-interview')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:read')
  @ApiOperation({ summary: 'Get offboarding exit interview' })
  getExitInterview(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.offboardingService.getExitInterview(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Patch('requests/:id/exit-interview')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:update')
  @ApiOperation({ summary: 'Create or update offboarding exit interview' })
  upsertExitInterview(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertOffboardingExitInterviewDto,
  ) {
    return this.offboardingService.upsertExitInterview(
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

  @Patch('requests/:id/tasks/:taskId/reassign')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_tasks:create')
  @ApiOperation({ summary: 'Reassign offboarding task' })
  reassignTask(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: ReassignOffboardingTaskDto,
  ) {
    return this.offboardingService.reassignTask(
      req.user.companyId!,
      id,
      taskId,
      dto,
      req.user,
      this.getRequestContext(req),
    );
  }

  @Post('requests/:id/tasks/:taskId/reopen')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_tasks:create')
  @ApiOperation({ summary: 'Reopen offboarding task' })
  reopenTask(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: ReopenOffboardingTaskDto,
  ) {
    return this.offboardingService.reopenTask(
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

  @Post('requests/:id/approvals/:approvalId/delegate')
  @UseGuards(PermissionsGuard)
  @PermissionsAny(
    'offboarding_approvals:delegate',
    'offboarding_approvals:delegate-any',
  )
  @ApiOperation({ summary: 'Delegate an offboarding approval' })
  delegateApproval(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('approvalId', ParseIntPipe) approvalId: number,
    @Body() dto: DelegateOffboardingApprovalDto,
  ) {
    return this.offboardingService.delegateApproval(
      req.user.companyId!,
      id,
      approvalId,
      dto,
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

  @Patch('requests/:id/clearances/:clearanceId/assign')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_clearances:create')
  @ApiOperation({ summary: 'Assign offboarding clearance owner' })
  assignClearance(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('clearanceId', ParseIntPipe) clearanceId: number,
    @Body() dto: AssignOffboardingClearanceDto,
  ) {
    return this.offboardingService.assignClearance(
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
    return this.offboardingService.getProgress(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Get('requests/:id/approvals')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:read')
  @ApiOperation({ summary: 'Get offboarding approvals' })
  getApprovals(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.offboardingService.getApprovals(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Get('requests/:id/audit-logs')
  @UseGuards(PermissionsGuard)
  @Permissions('offboarding_requests:read')
  @ApiOperation({ summary: 'Get offboarding audit logs' })
  getAuditLogs(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.offboardingService.getAuditLogs(
      req.user.companyId!,
      id,
      req.user,
    );
  }
}
