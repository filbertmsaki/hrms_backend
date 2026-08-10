import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import {
  ApproveEmployeeFinanceApplicationDto,
  CreateEmployeeFinanceApplicationDto,
  CreateEmployeeFinanceDisbursementDto,
  CreateEmployeeFinanceProductDto,
  CreateEmployeeFinanceRepaymentDto,
  EmployeeFinanceQueryDto,
  EvaluateEmployeeFinanceEligibilityDto,
  RequestEmployeeFinanceDefermentDto,
  RequestEmployeeFinanceRescheduleDto,
} from '../dto/employee-finance.dto';
import { EmployeeFinanceApprovalStageEnum } from '../employee-finance.enums';
import {
  EmployeeFinanceAccountService,
  EmployeeFinanceApplicationService,
  EmployeeFinanceApprovalService,
  EmployeeFinanceDefermentService,
  EmployeeFinanceDisbursementService,
  EmployeeFinanceEligibilityService,
  EmployeeFinanceExitRecoveryService,
  EmployeeFinanceProductService,
  EmployeeFinanceReconciliationService,
  EmployeeFinanceRepaymentService,
  EmployeeFinanceReportsService,
  EmployeeFinanceRescheduleService,
  EmployeeFinanceSettlementService,
} from '../services/employee-finance-core.services';

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
  ) {}

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
}

@ApiTags('Employee Finance Applications')
@ApiBearerAuth('access-token')
@Controller('employee-finance/applications')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class EmployeeFinanceApplicationsController {
  constructor(private readonly service: EmployeeFinanceApplicationService) {}

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
  ) {}

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
}
