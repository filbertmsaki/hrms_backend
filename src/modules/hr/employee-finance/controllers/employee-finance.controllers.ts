import {
  BadRequestException,
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
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import type { Response } from 'express';
import {
  Permissions,
  PermissionsAll,
  PermissionsAny,
} from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import {
  ApproveEmployeeFinanceApplicationDto,
  CancelEmployeeFinanceDisbursementDto,
  ConfirmEmployeeFinanceExitRecoveryDto,
  CreateEmployeeFinanceAdjustmentDto,
  CreateEmployeeFinanceApplicationDocumentDto,
  CreateEmployeeFinanceApplicationDto,
  CreateEmployeeFinanceDelegationDto,
  CreateEmployeeFinanceDisbursementDto,
  CreateEmployeeFinanceGuarantorDto,
  CreateEmployeeFinanceProductDto,
  CreateEmployeeFinanceRepaymentDto,
  DecideEmployeeFinanceApplicationDto,
  DecideEmployeeFinanceGuarantorDto,
  DecideEmployeeFinanceServicingRequestDto,
  DelegatedEmployeeFinanceDecisionDto,
  EmployeeFinanceJournalQueryDto,
  EmployeeFinancePaymentBatchDto,
  EmployeeFinancePayrollPreviewQueryDto,
  EmployeeFinanceQueryDto,
  EvaluateEmployeeFinanceEligibilityDto,
  EvaluateMyEmployeeFinanceEligibilityDto,
  ImportEmployeeFinanceMigrationDto,
  ImportEmployeeFinancePaymentFileDto,
  MarkEmployeeFinanceOverdueDto,
  PostEmployeeFinanceAccountingDto,
  PreviewEmployeeFinanceLetterTemplateDto,
  RequestEmployeeFinanceDefermentDto,
  RequestEmployeeFinanceRescheduleDto,
  ResolveEmployeeFinanceShortfallDto,
  SettleEmployeeFinanceQuoteDto,
  SignOffEmployeeFinanceMigrationDto,
  UpdateEmployeeFinanceApplicationDto,
  UpdateEmployeeFinanceIntegrationSettingsDto,
  UploadEmployeeFinanceApplicationDocumentDto,
  UpsertEmployeeFinanceLetterTemplateDto,
  VerifyEmployeeFinanceApplicationDocumentDto,
} from '../dto/employee-finance.dto';
import { EmployeeFinanceApprovalStageEnum } from '../employee-finance.enums';
import {
  EmployeeFinanceAccountService,
  EmployeeFinanceAccountingPostingService,
  EmployeeFinanceApplicationService,
  EmployeeFinanceApprovalService,
  EmployeeFinanceDefermentService,
  EmployeeFinanceDisbursementService,
  EmployeeFinanceEligibilityService,
  EmployeeFinanceExitRecoveryService,
  EmployeeFinancePaymentImportService,
  EmployeeFinanceProductService,
  EmployeeFinanceReconciliationService,
  EmployeeFinanceRepaymentService,
  EmployeeFinanceReportsService,
  EmployeeFinanceRescheduleService,
  EmployeeFinanceSettlementService,
} from '../services/employee-finance-core.services';
import {
  EmployeeFinanceAccountStatusService,
  EmployeeFinanceDelegationService,
  EmployeeFinanceLetterTemplateService,
} from '../services/employee-finance-policy.services';
import {
  EmployeeFinanceAdjustmentService,
  EmployeeFinanceEscalationService,
  EmployeeFinancePayrollOpsService,
} from '../services/employee-finance-workflow.services';
import { EmployeeFinanceLoanReportsService } from '../services/employee-finance-reporting.services';
import { EmployeeFinanceIntegrationService } from '../services/employee-finance-integration.services';
import { EmployeeFinanceMigrationService } from '../services/employee-finance-migration.services';

type AuthedRequest = ExpressRequest & { user: AuthenticatedUser };

@ApiTags('Employee Finance Products')
@ApiBearerAuth('access-token')
@Controller('employee-finance/products')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class EmployeeFinanceProductsController {
  constructor(
    private readonly productService: EmployeeFinanceProductService,
    private readonly eligibilityService: EmployeeFinanceEligibilityService,
  ) {}

  @Post()
  @Permissions('employee_finance:products')
  create(
    @Req() req: AuthedRequest,
    @Body() dto: CreateEmployeeFinanceProductDto,
  ) {
    return this.productService.create(req.user, dto);
  }

  @Get()
  @Permissions('employee_finance:products:read')
  list(@Req() req: AuthedRequest) {
    return this.productService.list(req.user);
  }

  @Patch(':id')
  @Permissions('employee_finance:products')
  update(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateEmployeeFinanceProductDto,
  ) {
    return this.productService.update(req.user, id, dto);
  }

  @Post(':id/versions')
  @Permissions('employee_finance:products')
  createVersion(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateEmployeeFinanceProductDto,
  ) {
    return this.productService.createVersion(req.user, id, dto);
  }

  @Post(':id/retire')
  @Permissions('employee_finance:products')
  retire(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.productService.retire(req.user, id);
  }

  @Post('eligibility')
  @Permissions('employee_finance:applications:read')
  evaluateEligibility(
    @Req() req: AuthedRequest,
    @Body() dto: EvaluateEmployeeFinanceEligibilityDto,
  ) {
    return this.eligibilityService.evaluate(req.user, dto);
  }
}

@ApiTags('My Employee Finance')
@ApiBearerAuth('access-token')
@Controller('me/finance')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class MyEmployeeFinanceController {
  constructor(
    private readonly applicationService: EmployeeFinanceApplicationService,
    private readonly accountService: EmployeeFinanceAccountService,
    private readonly eligibilityService: EmployeeFinanceEligibilityService,
    private readonly productService: EmployeeFinanceProductService,
    private readonly defermentService: EmployeeFinanceDefermentService,
    private readonly loanReportsService: EmployeeFinanceLoanReportsService,
  ) {}

  @Get('products')
  @Permissions('employee_finance:applications:self')
  products(@Req() req: AuthedRequest) {
    return this.productService.listAvailable(req.user);
  }

  @Get('accounts')
  @Permissions('employee_finance:applications:self')
  accounts(@Req() req: AuthedRequest) {
    return this.accountService.listMine(req.user);
  }

  @Patch('applications/:id')
  @Permissions('employee_finance:applications:self')
  updateApplication(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeFinanceApplicationDto,
  ) {
    return this.applicationService.updateMine(req.user, id, dto);
  }

  @Get('applications/:id/sanction-letter')
  @Permissions('employee_finance:applications:self')
  sanctionLetter(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.applicationService.getSanctionLetter(req.user, id);
  }

  @Get('applications/:id/sanction-letter/pdf')
  @Permissions('employee_finance:applications:self')
  async sanctionLetterPdf(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const file = await this.applicationService.getSanctionLetterPdf(
      req.user,
      id,
    );
    sendPdf(res, file);
  }

  @Post('accounts/:id/deferments')
  @Permissions('employee_finance:applications:self')
  requestDeferment(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RequestEmployeeFinanceDefermentDto,
  ) {
    return this.defermentService.request(req.user, id, dto, {
      selfService: true,
    });
  }

  @Post('eligibility')
  @Permissions('employee_finance:applications:self')
  evaluateEligibility(
    @Req() req: AuthedRequest,
    @Body() dto: EvaluateMyEmployeeFinanceEligibilityDto,
  ) {
    return this.eligibilityService.evaluateMine(req.user, dto);
  }

  @Post('applications')
  @Permissions('employee_finance:applications:self')
  createApplication(
    @Req() req: AuthedRequest,
    @Body() dto: CreateEmployeeFinanceApplicationDto,
  ) {
    return this.applicationService.createMine(req.user, dto);
  }

  @Get('applications')
  @Permissions('employee_finance:applications:self')
  listApplications(@Req() req: AuthedRequest) {
    return this.applicationService.listMine(req.user);
  }

  @Post('applications/:id/submit')
  @Permissions('employee_finance:applications:self')
  submit(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.applicationService.submitMine(req.user, id);
  }

  @Post('applications/:id/documents')
  @Permissions('employee_finance:applications:self')
  addDocument(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateEmployeeFinanceApplicationDocumentDto,
  ) {
    return this.applicationService.addDocument(req.user, id, dto);
  }

  @Post('applications/:id/documents/upload')
  @Permissions('employee_finance:applications:self')
  uploadDocument(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UploadEmployeeFinanceApplicationDocumentDto,
  ) {
    return this.applicationService.uploadDocument(req.user, id, dto);
  }

  @Get('applications/:id/documents')
  @Permissions('employee_finance:applications:self')
  listDocuments(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.applicationService.listDocuments(req.user, id);
  }

  @Get('applications/:id/documents/:documentId/download')
  @Permissions('employee_finance:applications:self')
  async downloadDocument(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Res() res: Response,
  ) {
    const file = await this.applicationService.downloadDocument(
      req.user,
      id,
      documentId,
    );
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName.replace(/"/g, '')}"`,
    );
    res.send(file.buffer);
  }

  @Post('applications/:id/guarantors')
  @Permissions('employee_finance:applications:self')
  addGuarantor(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateEmployeeFinanceGuarantorDto,
  ) {
    return this.applicationService.addGuarantor(req.user, id, dto);
  }

  @Get('applications/:id/guarantors')
  @Permissions('employee_finance:applications:self')
  listGuarantors(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.applicationService.listGuarantors(req.user, id);
  }

  @Get('guarantor-requests')
  @Permissions('employee_finance:applications:self')
  listGuarantorRequests(@Req() req: AuthedRequest) {
    return this.applicationService.listMyGuarantorRequests(req.user);
  }

  @Post('guarantor-requests/:id/decide')
  @Permissions('employee_finance:applications:self')
  decideGuarantor(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideEmployeeFinanceGuarantorDto,
  ) {
    return this.applicationService.decideGuarantor(req.user, id, dto);
  }

  @Post('applications/:id/accept')
  @Permissions('employee_finance:applications:self')
  accept(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.applicationService.acceptMine(req.user, id);
  }

  @Post('applications/:id/withdraw')
  @Permissions('employee_finance:applications:self')
  withdraw(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.applicationService.withdrawMine(req.user, id);
  }

  @Get('accounts/:id/statement')
  @Permissions('employee_finance:applications:self')
  statement(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.accountService.getStatement(req.user, id);
  }

  @Get('accounts/:id/statement/download')
  @Permissions('employee_finance:applications:self')
  async downloadStatement(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ) {
    sendFile(
      res,
      await this.loanReportsService.statement(req.user, id, format ?? 'pdf', {
        selfService: true,
      }),
    );
  }
}

@ApiTags('Employee Finance Applications')
@ApiBearerAuth('access-token')
@Controller('employee-finance/applications')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class EmployeeFinanceApplicationsController {
  constructor(
    private readonly service: EmployeeFinanceApplicationService,
    private readonly approvalService: EmployeeFinanceApprovalService,
  ) {}

  @Get(':id/approvals')
  @Permissions('employee_finance:applications:read')
  approvals(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.approvalService.listApprovals(req.user, id);
  }

  /** Reject or return at the current stage; the service checks the stage permission. */
  @Post(':id/decision')
  @PermissionsAny(
    'employee_finance:applications:manager-review',
    'employee_finance:applications:hr-approve',
    'employee_finance:applications:finance-approve',
    'employee_finance:applications:management-approve',
  )
  decide(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideEmployeeFinanceApplicationDto,
  ) {
    return this.approvalService.decide(req.user, id, dto);
  }

  /** A delegate acting for an absent approver under an active delegation. */
  @Post(':id/delegated-decision')
  @PermissionsAny(
    'employee_finance:applications:self',
    'employee_finance:delegations',
  )
  delegatedDecision(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DelegatedEmployeeFinanceDecisionDto,
  ) {
    return this.approvalService.delegatedDecision(req.user, id, dto);
  }

  @Get(':id/sanction-letter/pdf')
  @Permissions('employee_finance:applications:read')
  async sanctionLetterPdf(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    sendPdf(res, await this.service.getSanctionLetterPdf(req.user, id));
  }

  @Get()
  @Permissions('employee_finance:applications:read')
  list(@Req() req: AuthedRequest, @Query() query: EmployeeFinanceQueryDto) {
    return this.service.list(req.user, query);
  }

  @Get(':id')
  @Permissions('employee_finance:applications:read')
  get(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.getApplication(req.user, id);
  }

  @Get(':id/documents')
  @Permissions('employee_finance:applications:read')
  listDocuments(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.listDocuments(req.user, id);
  }

  @Post(':id/documents/:documentId/verify')
  @Permissions('employee_finance:applications:hr-approve')
  verifyDocument(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Body() dto: VerifyEmployeeFinanceApplicationDocumentDto,
  ) {
    return this.service.verifyDocument(req.user, id, documentId, dto);
  }

  @Get(':id/documents/:documentId/download')
  @Permissions('employee_finance:applications:read')
  async downloadDocument(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Res() res: Response,
  ) {
    const file = await this.service.downloadDocument(req.user, id, documentId);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName.replace(/"/g, '')}"`,
    );
    res.send(file.buffer);
  }

  @Get(':id/guarantors')
  @Permissions('employee_finance:applications:read')
  listGuarantors(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.listGuarantors(req.user, id);
  }

  @Get(':id/sanction-letter')
  @Permissions('employee_finance:applications:read')
  sanctionLetter(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.getSanctionLetter(req.user, id);
  }
}

@ApiTags('Manager Employee Finance')
@ApiBearerAuth('access-token')
@Controller('manager/finance')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class ManagerEmployeeFinanceController {
  constructor(private readonly service: EmployeeFinanceApprovalService) {}

  @Post('applications/:id/recommend')
  @Permissions('employee_finance:applications:manager-review')
  recommend(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Omit<ApproveEmployeeFinanceApplicationDto, 'stage'>,
  ) {
    return this.service.approve(req.user, id, {
      ...dto,
      stage: EmployeeFinanceApprovalStageEnum.MANAGER,
    });
  }
}

@ApiTags('HR Employee Finance')
@ApiBearerAuth('access-token')
@Controller('hr/finance')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class HrEmployeeFinanceController {
  constructor(private readonly service: EmployeeFinanceApprovalService) {}

  @Post('applications/:id/approve')
  @Permissions('employee_finance:applications:hr-approve')
  approve(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Omit<ApproveEmployeeFinanceApplicationDto, 'stage'>,
  ) {
    return this.service.approve(req.user, id, {
      ...dto,
      stage: EmployeeFinanceApprovalStageEnum.HR,
    });
  }
}

@ApiTags('Management Employee Finance')
@ApiBearerAuth('access-token')
@Controller('management/finance')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class ManagementEmployeeFinanceController {
  constructor(private readonly service: EmployeeFinanceApprovalService) {}

  @Post('applications/:id/approve')
  @Permissions('employee_finance:applications:management-approve')
  approve(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Omit<ApproveEmployeeFinanceApplicationDto, 'stage'>,
  ) {
    return this.service.approve(req.user, id, {
      ...dto,
      stage: EmployeeFinanceApprovalStageEnum.MANAGEMENT,
    });
  }
}

@ApiTags('Finance Employee Finance')
@ApiBearerAuth('access-token')
@Controller('finance/employee-finance')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class FinanceEmployeeFinanceController {
  constructor(
    private readonly approvalService: EmployeeFinanceApprovalService,
    private readonly accountService: EmployeeFinanceAccountService,
    private readonly disbursementService: EmployeeFinanceDisbursementService,
    private readonly repaymentService: EmployeeFinanceRepaymentService,
    private readonly defermentService: EmployeeFinanceDefermentService,
    private readonly rescheduleService: EmployeeFinanceRescheduleService,
    private readonly settlementService: EmployeeFinanceSettlementService,
    private readonly exitRecoveryService: EmployeeFinanceExitRecoveryService,
    private readonly paymentImportService: EmployeeFinancePaymentImportService,
    private readonly accountingPostingService: EmployeeFinanceAccountingPostingService,
    private readonly adjustmentService: EmployeeFinanceAdjustmentService,
    private readonly accountStatusService: EmployeeFinanceAccountStatusService,
    private readonly escalationService: EmployeeFinanceEscalationService,
    private readonly loanReportsService: EmployeeFinanceLoanReportsService,
  ) {}

  @Post('disbursements/:id/cancel')
  @Permissions('employee_finance:disbursements')
  cancelDisbursement(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelEmployeeFinanceDisbursementDto,
  ) {
    return this.disbursementService.cancel(req.user, id, dto.reason);
  }

  @Get('deferments/pending')
  @PermissionsAny(
    'employee_finance:settlements',
    'employee_finance:settlements:approve',
  )
  pendingDeferments(@Req() req: AuthedRequest) {
    return this.defermentService.listPending(req.user);
  }

  @Post('deferments/:id/decide')
  @Permissions('employee_finance:settlements:approve')
  decideDeferment(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideEmployeeFinanceServicingRequestDto,
  ) {
    return this.defermentService.decide(req.user, id, dto);
  }

  @Get('reschedules/pending')
  @PermissionsAny(
    'employee_finance:settlements',
    'employee_finance:settlements:approve',
  )
  pendingReschedules(@Req() req: AuthedRequest) {
    return this.rescheduleService.listPending(req.user);
  }

  @Post('reschedules/:id/decide')
  @Permissions('employee_finance:settlements:approve')
  decideReschedule(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideEmployeeFinanceServicingRequestDto,
  ) {
    return this.rescheduleService.decide(req.user, id, dto);
  }

  @Post('settlement-quotes/:id/settle')
  @Permissions('employee_finance:settlements')
  settleQuote(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SettleEmployeeFinanceQuoteDto,
  ) {
    return this.settlementService.settle(req.user, id, dto);
  }

  @Get('exit-recoveries')
  @PermissionsAny(
    'employee_finance:settlements',
    'employee_finance:settlements:approve',
  )
  exitRecoveries(
    @Req() req: AuthedRequest,
    @Query('offboarding_request_id') offboardingRequestId?: string,
  ) {
    return this.exitRecoveryService.list(
      req.user,
      offboardingRequestId ? Number(offboardingRequestId) : undefined,
    );
  }

  @Post('exit-recoveries/:id/confirm')
  @Permissions('employee_finance:settlements:approve')
  confirmExitRecovery(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmEmployeeFinanceExitRecoveryDto,
  ) {
    return this.exitRecoveryService.confirmRecovery(req.user, id, dto);
  }

  @Get('adjustments')
  @PermissionsAny(
    'employee_finance:adjustments',
    'employee_finance:adjustments:approve',
  )
  adjustments(
    @Req() req: AuthedRequest,
    @Query('status') status?: string,
    @Query('account_id') accountId?: string,
  ) {
    return this.adjustmentService.list(req.user, {
      status,
      account_id: accountId ? Number(accountId) : undefined,
    });
  }

  @Post('accounts/:id/adjustments')
  @Permissions('employee_finance:adjustments')
  requestAdjustment(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateEmployeeFinanceAdjustmentDto,
  ) {
    return this.adjustmentService.create(req.user, id, dto);
  }

  @Post('adjustments/:id/decide')
  @Permissions('employee_finance:adjustments:approve')
  decideAdjustment(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideEmployeeFinanceServicingRequestDto,
  ) {
    return this.adjustmentService.decide(req.user, id, dto);
  }

  /** Runs the overdue sweep now instead of waiting for the nightly job. */
  @Post('overdue/run')
  @Permissions('employee_finance:reconciliation')
  runOverdue(
    @Req() req: AuthedRequest,
    @Body() dto: MarkEmployeeFinanceOverdueDto,
  ) {
    return this.accountStatusService.markOverdue(req.user.companyId, dto.as_of);
  }

  /** Sends due approval reminders and escalations now. */
  @Post('approvals/escalation-sweep')
  @Permissions('employee_finance:reconciliation')
  runEscalationSweep(@Req() req: AuthedRequest) {
    return this.escalationService.sweep(new Date(), req.user.companyId);
  }

  @Post('applications/:id/approve')
  @Permissions('employee_finance:applications:finance-approve')
  approveApplication(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Omit<ApproveEmployeeFinanceApplicationDto, 'stage'>,
  ) {
    return this.approvalService.approve(req.user, id, {
      ...dto,
      stage: EmployeeFinanceApprovalStageEnum.FINANCE,
    });
  }

  @Get('accounts')
  @Permissions('employee_finance:accounts:read')
  listAccounts(
    @Req() req: AuthedRequest,
    @Query() query: EmployeeFinanceQueryDto,
  ) {
    return this.accountService.list(req.user, query);
  }

  @Get('accounts/:id/statement')
  @Permissions('employee_finance:accounts:read')
  statement(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.accountService.getStatement(req.user, id);
  }

  @Get('accounts/:id/statement/download')
  @Permissions('employee_finance:accounts:read')
  async downloadStatement(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ) {
    sendFile(
      res,
      await this.loanReportsService.statement(req.user, id, format ?? 'pdf'),
    );
  }

  @Post('disbursements')
  @Permissions('employee_finance:disbursements')
  createDisbursement(
    @Req() req: AuthedRequest,
    @Body() dto: CreateEmployeeFinanceDisbursementDto,
  ) {
    return this.disbursementService.create(req.user, dto);
  }

  @Post('disbursements/:id/approve')
  @Permissions('employee_finance:disbursements:approve')
  approveDisbursement(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.disbursementService.approve(req.user, id);
  }

  @Post('disbursements/:id/confirm')
  @Permissions('employee_finance:disbursements')
  confirmDisbursement(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.disbursementService.confirm(req.user, id);
  }

  @Post('repayments')
  @Permissions('employee_finance:repayments')
  createRepayment(
    @Req() req: AuthedRequest,
    @Body() dto: CreateEmployeeFinanceRepaymentDto,
  ) {
    return this.repaymentService.create(req.user, dto);
  }

  @Post('repayments/:id/approve')
  @Permissions('employee_finance:repayments:approve')
  approveRepayment(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.repaymentService.approve(req.user, id);
  }

  @Post('payments/import')
  @Permissions('employee_finance:reconciliation')
  importPayments(
    @Req() req: AuthedRequest,
    @Body() dto: ImportEmployeeFinancePaymentFileDto,
  ) {
    return this.paymentImportService.importFile(req.user, dto);
  }

  @Post('accounting/post')
  @Permissions('employee_finance:reports')
  postAccounting(
    @Req() req: AuthedRequest,
    @Body() dto: PostEmployeeFinanceAccountingDto,
  ) {
    return this.accountingPostingService.post(req.user, dto);
  }

  @Post('accounts/:id/deferments')
  @Permissions('employee_finance:settlements')
  defer(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RequestEmployeeFinanceDefermentDto,
  ) {
    return this.defermentService.request(req.user, id, dto);
  }

  @Post('accounts/:id/reschedules')
  @Permissions('employee_finance:settlements')
  reschedule(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RequestEmployeeFinanceRescheduleDto,
  ) {
    return this.rescheduleService.request(req.user, id, dto);
  }

  @Post('accounts/:id/settlement-quotes')
  @Permissions('employee_finance:settlements')
  quote(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.settlementService.quote(req.user, id);
  }

  @Post('offboarding/:offboardingRequestId/recoveries')
  @Permissions('employee_finance:settlements')
  createExitRecoveries(
    @Req() req: AuthedRequest,
    @Param('offboardingRequestId', ParseIntPipe) offboardingRequestId: number,
  ) {
    return this.exitRecoveryService.createForOffboarding(
      req.user.companyId!,
      offboardingRequestId,
    );
  }
}

@ApiTags('Employee Finance Reports')
@ApiBearerAuth('access-token')
@Controller('employee-finance/reports')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class EmployeeFinanceReportsController {
  constructor(private readonly service: EmployeeFinanceReportsService) {}

  @Get('dashboard')
  @Permissions('employee_finance:reports')
  dashboard(@Req() req: AuthedRequest) {
    return this.service.dashboard(req.user);
  }

  @Get('audit')
  @Permissions('employee_finance:reports')
  audit(@Req() req: AuthedRequest, @Query() query: EmployeeFinanceQueryDto) {
    return this.service.auditTimeline(req.user, query);
  }

  @Get('catalog')
  @Permissions('employee_finance:reports')
  catalog() {
    return this.service.catalog();
  }

  @Get('notifications/catalog')
  @Permissions('employee_finance:reports')
  notificationCatalog() {
    return this.service.notificationCatalog();
  }

  @Get('readiness')
  @Permissions('employee_finance:reports')
  readiness() {
    return this.service.deploymentReadiness();
  }

  @Get(':reportType')
  @Permissions('employee_finance:reports')
  report(
    @Req() req: AuthedRequest,
    @Param('reportType') reportType: string,
    @Query() query: EmployeeFinanceQueryDto,
  ) {
    return this.service.report(req.user, reportType, query);
  }
}

@ApiTags('Employee Finance Reconciliation')
@ApiBearerAuth('access-token')
@Controller('employee-finance/reconciliation')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class EmployeeFinanceReconciliationController {
  constructor(private readonly service: EmployeeFinanceReconciliationService) {}

  @Post('run')
  @Permissions('employee_finance:reconciliation')
  run(@Req() req: AuthedRequest, @Query('account_id') accountId?: string) {
    return this.service.reconcile(
      req.user,
      accountId ? Number(accountId) : undefined,
    );
  }

  /** Books contractual interest missing on older loans; dry run unless dry_run=false. */
  @Post('backfill-interest')
  @Permissions('employee_finance:reconciliation')
  backfillInterest(
    @Req() req: AuthedRequest,
    @Query('dry_run') dryRun?: string,
  ) {
    return this.service.backfillInterestAccruals(req.user, dryRun !== 'false');
  }
}

@ApiTags('Employee Finance Payroll')
@ApiBearerAuth('access-token')
@Controller('employee-finance/payroll')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class EmployeeFinancePayrollController {
  constructor(private readonly service: EmployeeFinancePayrollOpsService) {}

  @Get('preview')
  @Permissions('employee_finance:payroll')
  preview(
    @Req() req: AuthedRequest,
    @Query() query: EmployeeFinancePayrollPreviewQueryDto,
  ) {
    return this.service.preview(req.user, query.payroll_period_id);
  }

  @Get('runs/:runId/deductions')
  @Permissions('employee_finance:payroll')
  runDeductions(
    @Req() req: AuthedRequest,
    @Param('runId', ParseIntPipe) runId: number,
  ) {
    return this.service.runDeductions(req.user, runId);
  }

  @Get('shortfalls')
  @Permissions('employee_finance:payroll')
  shortfalls(
    @Req() req: AuthedRequest,
    @Query('payroll_period_id') payrollPeriodId?: string,
    @Query('include_resolved') includeResolved?: string,
  ) {
    return this.service.shortfalls(req.user, {
      payroll_period_id: payrollPeriodId ? Number(payrollPeriodId) : undefined,
      include_resolved: includeResolved === 'true',
    });
  }

  @Post('shortfalls/:instructionId/resolve')
  @Permissions('employee_finance:payroll')
  resolveShortfall(
    @Req() req: AuthedRequest,
    @Param('instructionId', ParseIntPipe) instructionId: number,
    @Body() dto: ResolveEmployeeFinanceShortfallDto,
  ) {
    return this.service.resolveShortfall(req.user, instructionId, dto);
  }
}

@ApiTags('Employee Finance Delegations')
@ApiBearerAuth('access-token')
@Controller('employee-finance/delegations')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class EmployeeFinanceDelegationsController {
  constructor(private readonly service: EmployeeFinanceDelegationService) {}

  /** Delegations I gave and delegations given to me. */
  @Get()
  @PermissionsAny(
    'employee_finance:delegations',
    'employee_finance:applications:self',
  )
  list(@Req() req: AuthedRequest) {
    return this.service.listMine(req.user);
  }

  @Post()
  @Permissions('employee_finance:delegations')
  create(
    @Req() req: AuthedRequest,
    @Body() dto: CreateEmployeeFinanceDelegationDto,
  ) {
    return this.service.create(req.user, dto);
  }

  @Post(':id/revoke')
  @Permissions('employee_finance:delegations')
  revoke(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.revoke(req.user, id);
  }
}

@ApiTags('Employee Finance Letter Templates')
@ApiBearerAuth('access-token')
@Controller('employee-finance/templates')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class EmployeeFinanceTemplatesController {
  constructor(private readonly service: EmployeeFinanceLetterTemplateService) {}

  @Get('sanction-letter')
  @PermissionsAny('employee_finance:templates', 'employee_finance:products')
  get(@Req() req: AuthedRequest) {
    return this.service.get(req.user);
  }

  @Put('sanction-letter')
  @Permissions('employee_finance:templates')
  upsert(
    @Req() req: AuthedRequest,
    @Body() dto: UpsertEmployeeFinanceLetterTemplateDto,
  ) {
    return this.service.upsert(req.user, dto);
  }

  @Post('sanction-letter/preview')
  @PermissionsAny('employee_finance:templates', 'employee_finance:products')
  preview(@Body() dto: PreviewEmployeeFinanceLetterTemplateDto) {
    return this.service.preview(dto.body);
  }
}

@ApiTags('Employee Finance Loan Reports')
@ApiBearerAuth('access-token')
@Controller('employee-finance/loan-reports')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class EmployeeFinanceLoanReportsController {
  constructor(private readonly service: EmployeeFinanceLoanReportsService) {}

  @Get()
  @Permissions('employee_finance:reports')
  catalog() {
    return this.service.catalog();
  }

  /** Excel or CSV export of any loan report, including the operational ones. */
  @Get(':reportType/export')
  @Permissions('employee_finance:reports')
  async export(
    @Req() req: AuthedRequest,
    @Param('reportType') reportType: string,
    @Query() query: EmployeeFinanceQueryDto,
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ) {
    sendFile(
      res,
      await this.service.export(req.user, reportType, query, format ?? 'xlsx'),
    );
  }

  @Get(':reportType')
  @Permissions('employee_finance:reports')
  report(
    @Req() req: AuthedRequest,
    @Param('reportType') reportType: string,
    @Query() query: EmployeeFinanceQueryDto,
  ) {
    return this.service.report(req.user, reportType, query);
  }
}

function sendFile(
  res: Response,
  file: { buffer: Buffer; fileName: string; contentType: string },
) {
  res.setHeader('Content-Type', file.contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${file.fileName.replace(/"/g, '')}"`,
  );
  res.send(file.buffer);
}

function sendPdf(res: Response, file: { buffer: Buffer; fileName: string }) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${file.fileName.replace(/"/g, '')}"`,
  );
  res.send(file.buffer);
}

@ApiTags('Employee Finance Integrations')
@ApiBearerAuth('access-token')
@Controller('employee-finance/integrations')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class EmployeeFinanceIntegrationsController {
  constructor(private readonly service: EmployeeFinanceIntegrationService) {}

  @Get('settings')
  @PermissionsAny(
    'employee_finance:integrations',
    'employee_finance:reconciliation',
  )
  settings(@Req() req: AuthedRequest) {
    return this.service.getSettings(req.user);
  }

  @Put('settings')
  @Permissions('employee_finance:integrations')
  updateSettings(
    @Req() req: AuthedRequest,
    @Body() dto: UpdateEmployeeFinanceIntegrationSettingsDto,
  ) {
    return this.service.updateSettings(req.user, dto);
  }

  @Post('test/:channel')
  @Permissions('employee_finance:integrations')
  test(@Req() req: AuthedRequest, @Param('channel') channel: string) {
    const normalized = channel.toUpperCase();
    if (normalized !== 'ERP' && normalized !== 'BANK') {
      throw new BadRequestException('Channel must be erp or bank.');
    }
    return this.service.testConnection(req.user, normalized);
  }

  @Get('logs')
  @PermissionsAny(
    'employee_finance:integrations',
    'employee_finance:reconciliation',
  )
  logs(
    @Req() req: AuthedRequest,
    @Query('channel') channel?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listLogs(req.user, { channel, status });
  }

  @Post('logs/:id/retry')
  @Permissions('employee_finance:integrations')
  retry(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.retry(req.user, id);
  }

  /** Journal preview without recording an export. */
  @Get('journal/preview')
  @PermissionsAny('employee_finance:integrations', 'employee_finance:reports')
  journalPreview(
    @Req() req: AuthedRequest,
    @Query() query: EmployeeFinanceJournalQueryDto,
  ) {
    return this.service.buildJournal(req.user.companyId!, {
      date_from: query.date_from,
      date_to: query.date_to,
      only_unexported: query.only_unexported !== 'false',
    });
  }

  @Get('journal/export')
  @PermissionsAny('employee_finance:integrations', 'employee_finance:reports')
  async journalExport(
    @Req() req: AuthedRequest,
    @Query() query: EmployeeFinanceJournalQueryDto,
    @Res() res: Response,
  ) {
    sendFile(
      res,
      await this.service.exportJournal(req.user, {
        date_from: query.date_from,
        date_to: query.date_to,
        only_unexported: query.only_unexported !== 'false',
        format: query.format,
      }),
    );
  }

  @Post('journal/post')
  @Permissions('employee_finance:integrations')
  journalPost(
    @Req() req: AuthedRequest,
    @Body() dto: EmployeeFinanceJournalQueryDto,
  ) {
    return this.service.postJournal(req.user, dto);
  }

  @Post('bank/payment-file')
  @Permissions('employee_finance:disbursements')
  async paymentFile(
    @Req() req: AuthedRequest,
    @Body() dto: EmployeeFinancePaymentBatchDto,
    @Res() res: Response,
  ) {
    sendFile(
      res,
      await this.service.bankPaymentFile(req.user, dto.disbursement_ids),
    );
  }

  @Post('bank/submit-payments')
  @PermissionsAll(
    'employee_finance:disbursements',
    'employee_finance:integrations',
  )
  submitPayments(
    @Req() req: AuthedRequest,
    @Body() dto: EmployeeFinancePaymentBatchDto,
  ) {
    return this.service.submitPayments(req.user, dto.disbursement_ids);
  }

  @Post('bank/statement-import')
  @Permissions('employee_finance:reconciliation')
  importStatement(
    @Req() req: AuthedRequest,
    @Body() dto: ImportEmployeeFinancePaymentFileDto,
  ) {
    return this.service.importStatement(req.user, dto);
  }
}

@ApiTags('Employee Finance Migration')
@ApiBearerAuth('access-token')
@Controller('employee-finance/migration')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class EmployeeFinanceMigrationController {
  constructor(private readonly service: EmployeeFinanceMigrationService) {}

  @Get('template')
  @Permissions('employee_finance:migration')
  async template(@Res() res: Response) {
    sendFile(res, await this.service.template());
  }

  /** Dry run by default; send dry_run=false to commit a file with no errors. */
  @Post('import')
  @Permissions('employee_finance:migration')
  import(
    @Req() req: AuthedRequest,
    @Body() dto: ImportEmployeeFinanceMigrationDto,
  ) {
    return this.service.import(req.user, dto);
  }

  @Get('batches')
  @Permissions('employee_finance:migration')
  batches(@Req() req: AuthedRequest) {
    return this.service.listBatches(req.user);
  }

  @Post('batches/:batchId/sign-off')
  @Permissions('employee_finance:migration')
  signOff(
    @Req() req: AuthedRequest,
    @Param('batchId') batchId: string,
    @Body() dto: SignOffEmployeeFinanceMigrationDto,
  ) {
    return this.service.signOff(req.user, batchId, dto.comments);
  }
}
