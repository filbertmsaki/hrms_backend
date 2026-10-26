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
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import type { Response as ExpressResponse } from 'express';
import {
  Permissions,
  PermissionsAny,
} from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import {
  ApprovePayrollRunDto,
  AssignEmployeeSalaryDto,
  CreateSalaryStructureVersionDto,
  EmployeeSalaryPreviewQueryDto,
  SalaryStructureQueryDto,
  UpdateSalaryStructureDto,
  CreatePayrollAccountingMappingDto,
  CreatePayrollAdjustmentDto,
  CreatePayrollBonusSchemeDto,
  CreatePayrollCalendarDto,
  CreatePayrollComponentDto,
  CreatePayrollGroupDto,
  CreatePayrollGroupAssignmentDto,
  CreatePayrollInputDto,
  CreatePayrollLeaveRuleDto,
  CreatePayrollOvertimePolicyDto,
  CreatePayrollRunDto,
  CreatePayrollSourceRecordBatchDto,
  CreatePayrollSourceRecordDto,
  DecidePayrollOvertimeDto,
  CreateSalaryStructureDto,
  UpdatePayrollCalendarDto,
  UpdatePayrollPeriodDatesDto,
  UpdatePayrollSecurityPolicyDto,
  ProcessPayrollRunDto,
  CreateStatutoryRuleDto,
  CreateStatutorySchemeDto,
  GeneratePayrollPeriodDto,
  GeneratePayrollSourceRecordsDto,
  ImportPayrollBankStatementDto,
  ImportPayrollSourceFileDto,
  PayrollOvertimeApprovalQueryDto,
  PayrollReportQueryDto,
  PayrollQueryDto,
  PostPayrollJournalDto,
  ReconcilePayrollPaymentDto,
  SimulatePayrollPaymentDto,
  DecidePayrollFinalSettlementDto,
  SimulateFinalSettlementPaymentDto,
  UpsertEmployeePayrollProfileDto,
} from '../dto/payroll.dto';
import {
  EmployeePayrollProfileService,
  EmployeeSalaryService,
  PayrollAccountingService,
  PayrollAuditService,
  PayrollBankService,
  PayrollConfigurationService,
  PayrollFinalSettlementService,
  PayrollInputService,
  PayrollOvertimeApprovalService,
  PayrollReportsService,
  PayrollReconciliationService,
  PayrollRunService,
  PayrollSourceService,
  PayslipService,
} from '../services/payroll-core.services';

type AuthedRequest = ExpressRequest & { user: AuthenticatedUser };

@ApiTags('Payroll Configuration')
@ApiBearerAuth('access-token')
@Controller('payroll/configuration')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class PayrollConfigurationController {
  constructor(private readonly service: PayrollConfigurationService) {}

  @Get('security-policy')
  @Permissions('payroll:config:read')
  getSecurityPolicy(@Req() req: AuthedRequest) {
    return this.service.getSecurityPolicy(req.user);
  }

  @Patch('security-policy')
  @Permissions('payroll:config')
  updateSecurityPolicy(
    @Req() req: AuthedRequest,
    @Body() dto: UpdatePayrollSecurityPolicyDto,
  ) {
    return this.service.updateSecurityPolicy(req.user, dto);
  }

  @Post('components')
  @Permissions('payroll:config')
  createComponent(
    @Req() req: AuthedRequest,
    @Body() dto: CreatePayrollComponentDto,
  ) {
    return this.service.createComponent(req.user, dto);
  }

  @Get('components')
  @Permissions('payroll:config:read')
  listComponents(@Req() req: AuthedRequest) {
    return this.service.listComponents(req.user);
  }

  @Post('salary-structures')
  @Permissions('payroll:config')
  createStructure(
    @Req() req: AuthedRequest,
    @Body() dto: CreateSalaryStructureDto,
  ) {
    return this.service.createStructure(req.user, dto);
  }

  @Get('salary-structures')
  @PermissionsAny('payroll:config:read', 'onboarding_requests:update')
  listStructures(
    @Req() req: AuthedRequest,
    @Query() query: SalaryStructureQueryDto,
  ) {
    return this.service.listStructures(req.user, query);
  }

  @Get('salary-structures/:id')
  @PermissionsAny('payroll:config:read', 'onboarding_requests:update')
  getStructure(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.getStructure(req.user, id);
  }

  @Patch('salary-structures/:id')
  @Permissions('payroll:config')
  updateStructure(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalaryStructureDto,
  ) {
    return this.service.updateStructure(req.user, id, dto);
  }

  @Delete('salary-structures/:id')
  @Permissions('payroll:config')
  deleteStructure(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.deleteStructure(req.user, id);
  }

  @Post('salary-structures/:id/activate')
  @Permissions('payroll:config')
  activateStructure(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.activateStructure(req.user, id);
  }

  @Post('salary-structures/:id/retire')
  @Permissions('payroll:config')
  retireStructure(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.retireStructure(req.user, id);
  }

  @Post('salary-structures/:id/versions')
  @Permissions('payroll:config')
  createStructureVersion(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateSalaryStructureVersionDto,
  ) {
    return this.service.createStructureVersion(req.user, id, dto);
  }

  @Get('salary-structures/:id/employees')
  @Permissions('payroll:config:read')
  listStructureEmployees(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.listStructureEmployees(req.user, id);
  }

  @Post('calendars')
  @Permissions('payroll:config')
  createCalendar(
    @Req() req: AuthedRequest,
    @Body() dto: CreatePayrollCalendarDto,
  ) {
    return this.service.createCalendar(req.user, dto);
  }

  @Patch('calendars/:id')
  @Permissions('payroll:config')
  updateCalendar(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePayrollCalendarDto,
  ) {
    return this.service.updateCalendar(req.user, id, dto);
  }

  @Get('calendars')
  @Permissions('payroll:config:read')
  listCalendars(@Req() req: AuthedRequest) {
    return this.service.listCalendars(req.user);
  }

  @Post('periods/generate')
  @Permissions('payroll:periods')
  generatePeriod(
    @Req() req: AuthedRequest,
    @Body() dto: GeneratePayrollPeriodDto,
  ) {
    return this.service.generatePeriod(req.user, dto);
  }

  @Patch('periods/:id/dates')
  @Permissions('payroll:periods')
  updatePeriodDates(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePayrollPeriodDatesDto,
  ) {
    return this.service.updatePeriodDates(req.user, id, dto);
  }

  @Get('periods')
  @Permissions('payroll:periods:read')
  listPeriods(@Req() req: AuthedRequest) {
    return this.service.listPeriods(req.user);
  }

  @Post('statutory-schemes')
  @Permissions('payroll:config')
  createScheme(
    @Req() req: AuthedRequest,
    @Body() dto: CreateStatutorySchemeDto,
  ) {
    return this.service.createScheme(req.user, dto);
  }

  @Get('statutory-schemes')
  @Permissions('payroll:config:read')
  listSchemes(@Req() req: AuthedRequest) {
    return this.service.listSchemes(req.user);
  }

  @Get('statutory-rules')
  @Permissions('payroll:config:read')
  listRules(@Req() req: AuthedRequest) {
    return this.service.listRules(req.user);
  }

  @Post('statutory-rules')
  @Permissions('payroll:config')
  createRule(@Req() req: AuthedRequest, @Body() dto: CreateStatutoryRuleDto) {
    return this.service.createRule(req.user, dto);
  }

  @Post('statutory-rules/:id/approve')
  @Permissions('payroll:statutory:approve')
  approveRule(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.approveRule(req.user, id);
  }

  @Post('accounting-mappings')
  @Permissions('payroll:config')
  createAccountingMapping(
    @Req() req: AuthedRequest,
    @Body() dto: CreatePayrollAccountingMappingDto,
  ) {
    return this.service.createAccountingMapping(req.user, dto);
  }

  @Get('accounting-mappings')
  @Permissions('payroll:config:read')
  listAccountingMappings(@Req() req: AuthedRequest) {
    return this.service.listAccountingMappings(req.user);
  }

  @Post('groups')
  @Permissions('payroll:config')
  createGroup(@Req() req: AuthedRequest, @Body() dto: CreatePayrollGroupDto) {
    return this.service.createGroup(req.user, dto);
  }

  @Get('groups')
  @Permissions('payroll:config:read')
  listGroups(@Req() req: AuthedRequest) {
    return this.service.listGroups(req.user);
  }

  @Post('group-assignments')
  @Permissions('payroll:config')
  createGroupAssignment(
    @Req() req: AuthedRequest,
    @Body() dto: CreatePayrollGroupAssignmentDto,
  ) {
    return this.service.createGroupAssignment(req.user, dto);
  }

  @Get('group-assignments')
  @Permissions('payroll:config:read')
  listGroupAssignments(
    @Req() req: AuthedRequest,
    @Query('payroll_group_id') payrollGroupId?: string,
  ) {
    return this.service.listGroupAssignments(
      req.user,
      payrollGroupId ? Number(payrollGroupId) : undefined,
    );
  }

  @Post('overtime-policies')
  @Permissions('payroll:config')
  createOvertimePolicy(
    @Req() req: AuthedRequest,
    @Body() dto: CreatePayrollOvertimePolicyDto,
  ) {
    return this.service.createOvertimePolicy(req.user, dto);
  }

  @Get('overtime-policies')
  @Permissions('payroll:config:read')
  listOvertimePolicies(@Req() req: AuthedRequest) {
    return this.service.listOvertimePolicies(req.user);
  }

  @Post('bonus-schemes')
  @Permissions('payroll:config')
  createBonusScheme(
    @Req() req: AuthedRequest,
    @Body() dto: CreatePayrollBonusSchemeDto,
  ) {
    return this.service.createBonusScheme(req.user, dto);
  }

  @Get('bonus-schemes')
  @Permissions('payroll:config:read')
  listBonusSchemes(@Req() req: AuthedRequest) {
    return this.service.listBonusSchemes(req.user);
  }

  @Post('leave-rules')
  @Permissions('payroll:config')
  createLeaveRule(
    @Req() req: AuthedRequest,
    @Body() dto: CreatePayrollLeaveRuleDto,
  ) {
    return this.service.createLeaveRule(req.user, dto);
  }

  @Get('leave-rules')
  @Permissions('payroll:config:read')
  listLeaveRules(@Req() req: AuthedRequest) {
    return this.service.listLeaveRules(req.user);
  }
}

@ApiTags('Employee Payroll')
@ApiBearerAuth('access-token')
@Controller('payroll/employees')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class EmployeePayrollController {
  constructor(
    private readonly service: EmployeePayrollProfileService,
    private readonly salaryService: EmployeeSalaryService,
  ) {}

  @Get(':employeeId/salary')
  @PermissionsAny('payroll:profiles:read', 'onboarding_requests:update')
  getSalary(
    @Req() req: AuthedRequest,
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Query() query: EmployeeSalaryPreviewQueryDto,
  ) {
    return this.salaryService.getEmployeeSalary(
      req.user,
      employeeId,
      query.as_of,
    );
  }

  @Post(':employeeId/salary')
  @PermissionsAny('payroll:profiles', 'onboarding_requests:update')
  assignSalary(
    @Req() req: AuthedRequest,
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: AssignEmployeeSalaryDto,
  ) {
    return this.salaryService.assignInitialSalary(req.user, employeeId, dto);
  }

  @Post(':employeeId/salary/approve')
  @Permissions('payroll:profiles')
  approveSalary(
    @Req() req: AuthedRequest,
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.salaryService.approveInitialSalary(req.user, employeeId);
  }

  @Post('profiles')
  @Permissions('payroll:profiles')
  upsertProfile(
    @Req() req: AuthedRequest,
    @Body() dto: UpsertEmployeePayrollProfileDto,
  ) {
    return this.service.upsert(req.user, dto);
  }

  @Get('profiles')
  @Permissions('payroll:profiles:read')
  listProfiles(@Req() req: AuthedRequest, @Query() query: PayrollQueryDto) {
    return this.service.list(req.user, query);
  }
}

@ApiTags('Payroll Inputs')
@ApiBearerAuth('access-token')
@Controller('payroll/inputs')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class PayrollInputsController {
  constructor(private readonly service: PayrollInputService) {}

  @Post()
  @Permissions('payroll:inputs')
  create(@Req() req: AuthedRequest, @Body() dto: CreatePayrollInputDto) {
    return this.service.create(req.user, dto);
  }

  @Get()
  @Permissions('payroll:inputs:read')
  list(@Req() req: AuthedRequest, @Query() query: PayrollQueryDto) {
    return this.service.list(req.user, query);
  }

  @Post(':id/approve')
  @Permissions('payroll:inputs:approve')
  approve(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.approve(req.user, id);
  }

  @Post('adjustments')
  @Permissions('payroll:inputs')
  createAdjustment(
    @Req() req: AuthedRequest,
    @Body() dto: CreatePayrollAdjustmentDto,
  ) {
    return this.service.createAdjustment(req.user, dto);
  }
}

@ApiTags('Payroll Sources')
@ApiBearerAuth('access-token')
@Controller('payroll/sources')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class PayrollSourcesController {
  constructor(private readonly service: PayrollSourceService) {}

  @Post()
  @Permissions('payroll:inputs')
  create(@Req() req: AuthedRequest, @Body() dto: CreatePayrollSourceRecordDto) {
    return this.service.create(req.user, dto);
  }

  @Post('batch')
  @Permissions('payroll:inputs')
  createBatch(
    @Req() req: AuthedRequest,
    @Body() dto: CreatePayrollSourceRecordBatchDto,
  ) {
    return this.service.createBatch(req.user, dto);
  }

  @Post('generate')
  @Permissions('payroll:inputs')
  generate(
    @Req() req: AuthedRequest,
    @Body() dto: GeneratePayrollSourceRecordsDto,
  ) {
    return this.service.generate(req.user, dto);
  }

  @Post('import')
  @Permissions('payroll:inputs')
  importFile(
    @Req() req: AuthedRequest,
    @Body() dto: ImportPayrollSourceFileDto,
  ) {
    return this.service.importFile(req.user, dto);
  }

  @Get()
  @Permissions('payroll:inputs:read')
  list(@Req() req: AuthedRequest, @Query() query: PayrollQueryDto) {
    return this.service.list(req.user, query);
  }

  @Post(':id/approve')
  @Permissions('payroll:inputs:approve')
  approve(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.approve(req.user, id);
  }

  @Post(':id/reject')
  @Permissions('payroll:inputs:approve')
  reject(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.reject(req.user, id);
  }

  @Post(':id/post')
  @Permissions('payroll:inputs')
  post(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.post(req.user, id);
  }
}

@ApiTags('Payroll Overtime Approvals')
@ApiBearerAuth('access-token')
@Controller('payroll/overtime-approvals')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class PayrollOvertimeApprovalsController {
  constructor(private readonly service: PayrollOvertimeApprovalService) {}

  @Get()
  @Permissions('payroll:inputs:read')
  list(
    @Req() req: AuthedRequest,
    @Query() query: PayrollOvertimeApprovalQueryDto,
  ) {
    return this.service.list(req.user, query);
  }

  @Post(':id/approve')
  @Permissions('payroll:inputs:approve')
  approve(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecidePayrollOvertimeDto,
  ) {
    return this.service.approve(req.user, id, dto);
  }

  @Post(':id/reject')
  @Permissions('payroll:inputs:approve')
  reject(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecidePayrollOvertimeDto,
  ) {
    return this.service.reject(req.user, id, dto);
  }
}

@ApiTags('Payroll Runs')
@ApiBearerAuth('access-token')
@Controller('payroll/runs')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class PayrollRunsController {
  constructor(private readonly service: PayrollRunService) {}

  @Post()
  @Permissions('payroll:runs')
  create(@Req() req: AuthedRequest, @Body() dto: CreatePayrollRunDto) {
    return this.service.create(req.user, dto);
  }

  @Get()
  @Permissions('payroll:runs:read')
  list(@Req() req: AuthedRequest, @Query() query: PayrollQueryDto) {
    return this.service.list(req.user, query);
  }

  @Get(':id')
  @Permissions('payroll:runs:read')
  get(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.get(req.user, id);
  }

  @Post(':id/process')
  @Permissions('payroll:runs:process')
  process(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ProcessPayrollRunDto = {},
  ) {
    return this.service.process(req.user, id, dto);
  }

  @Get(':id/validation')
  @Permissions('payroll:runs:read')
  validate(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.validate(req.user, id);
  }

  @Post(':id/approve')
  @Permissions('payroll:runs:approve')
  approve(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApprovePayrollRunDto,
  ) {
    return this.service.approve(req.user, id, dto);
  }

  @Post(':id/lock')
  @Permissions('payroll:runs:lock')
  lock(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.lock(req.user, id);
  }

  @Post(':id/mark-paid')
  @Permissions('payroll:runs:lock')
  markPaid(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.markPaid(req.user, id);
  }

  @Post(':id/close')
  @Permissions('payroll:runs:lock')
  close(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.close(req.user, id);
  }
}

@ApiTags('Payroll Payslips')
@ApiBearerAuth('access-token')
@Controller('payroll/payslips')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class PayslipsController {
  constructor(private readonly service: PayslipService) {}

  @Post('runs/:runId/generate')
  @Permissions('payroll:payslips')
  generateForRun(
    @Req() req: AuthedRequest,
    @Param('runId', ParseIntPipe) runId: number,
  ) {
    return this.service.generateForRun(req.user, runId);
  }

  @Get('runs/:runId')
  @Permissions('payroll:payslips:read')
  listForRun(
    @Req() req: AuthedRequest,
    @Param('runId', ParseIntPipe) runId: number,
  ) {
    return this.service.listForRun(req.user, runId);
  }
}

@ApiTags('My Payslips')
@ApiBearerAuth('access-token')
@Controller('me/payslips')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class MyPayslipsController {
  constructor(private readonly service: PayslipService) {}

  @Get()
  @Permissions('payroll:payslips:self')
  listMine(@Req() req: AuthedRequest) {
    return this.service.listMine(req.user);
  }

  @Get('summary/current')
  @Permissions('payroll:payslips:self')
  summaryMine(@Req() req: AuthedRequest, @Query('year') year?: string) {
    return this.service.summaryMine(req.user, year ? Number(year) : undefined);
  }

  @Get(':id')
  @Permissions('payroll:payslips:self')
  getMine(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.getMine(req.user, id);
  }

  @Get(':id/download')
  @Permissions('payroll:payslips:self')
  downloadMine(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: ExpressResponse,
  ) {
    return this.service.downloadMine(req.user, id).then((file) =>
      res
        .set({
          'Content-Type': file.mime_type,
          'Content-Disposition': `attachment; filename="${file.file_name}"`,
          'Cache-Control': 'private, no-store',
        })
        .send(file.content),
    );
  }
}

@ApiTags('Payroll Banking')
@ApiBearerAuth('access-token')
@Controller('payroll/banking')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class PayrollBankingController {
  constructor(private readonly service: PayrollBankService) {}

  @Post('runs/:runId/batches')
  @Permissions('payroll:banking')
  generate(
    @Req() req: AuthedRequest,
    @Param('runId', ParseIntPipe) runId: number,
  ) {
    return this.service.generate(req.user, runId);
  }

  @Post('runs/:runId/batches/bank-ready')
  @Permissions('payroll:banking')
  generateBankReady(
    @Req() req: AuthedRequest,
    @Param('runId', ParseIntPipe) runId: number,
  ) {
    return this.service.generateBankReady(req.user, runId);
  }

  @Get('batches/:batchId/download')
  @Permissions('payroll:banking')
  download(
    @Req() req: AuthedRequest,
    @Param('batchId', ParseIntPipe) batchId: number,
  ) {
    return this.service.download(req.user, batchId);
  }

  @Get('runs/:runId/history')
  @Permissions('payroll:banking')
  paymentHistory(
    @Req() req: AuthedRequest,
    @Param('runId', ParseIntPipe) runId: number,
  ) {
    return this.service.listPaymentHistory(req.user, runId);
  }

  @Post('runs/:runId/reconcile')
  @Permissions('payroll:banking')
  reconcile(
    @Req() req: AuthedRequest,
    @Param('runId', ParseIntPipe) runId: number,
    @Body() dto: ReconcilePayrollPaymentDto,
  ) {
    return this.service.reconcile(req.user, runId, dto);
  }

  @Post('runs/:runId/simulate-payment')
  @Permissions('payroll:banking')
  simulatePayment(
    @Req() req: AuthedRequest,
    @Param('runId', ParseIntPipe) runId: number,
    @Body() dto: SimulatePayrollPaymentDto,
  ) {
    return this.service.simulateDemoPayment(req.user, runId, dto);
  }

  @Post('imports')
  @Permissions('payroll:banking')
  importStatement(
    @Req() req: AuthedRequest,
    @Body() dto: ImportPayrollBankStatementDto,
  ) {
    return this.service.importStatement(req.user, dto);
  }
}

@ApiTags('Payroll Accounting')
@ApiBearerAuth('access-token')
@Controller('payroll/accounting')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class PayrollAccountingController {
  constructor(private readonly service: PayrollAccountingService) {}

  @Get('journals')
  @Permissions('payroll:accounting')
  listJournals(
    @Req() req: AuthedRequest,
    @Query('payroll_run_id') payrollRunId?: string,
  ) {
    return this.service.listJournals(
      req.user,
      payrollRunId ? Number(payrollRunId) : undefined,
    );
  }

  @Get('ledger')
  @Permissions('payroll:accounting')
  internalLedger(
    @Req() req: AuthedRequest,
    @Query('payroll_run_id') payrollRunId?: string,
  ) {
    return this.service.internalLedger(
      req.user,
      payrollRunId ? Number(payrollRunId) : undefined,
    );
  }

  @Post('runs/:runId/journals')
  @Permissions('payroll:accounting')
  generate(
    @Req() req: AuthedRequest,
    @Param('runId', ParseIntPipe) runId: number,
  ) {
    return this.service.generate(req.user, runId);
  }

  @Get('journals/:batchId/export')
  @Permissions('payroll:accounting')
  exportJournal(
    @Req() req: AuthedRequest,
    @Param('batchId', ParseIntPipe) batchId: number,
    @Query('format') format?: string,
  ) {
    return this.service.exportJournal(req.user, batchId, format ?? 'csv');
  }

  @Post('journals/:batchId/post')
  @Permissions('payroll:accounting')
  postJournal(
    @Req() req: AuthedRequest,
    @Param('batchId', ParseIntPipe) batchId: number,
    @Body() dto: PostPayrollJournalDto,
  ) {
    return this.service.post(req.user, batchId, dto);
  }

  @Post('journals/:batchId/reverse')
  @Permissions('payroll:accounting')
  reverseJournal(
    @Req() req: AuthedRequest,
    @Param('batchId', ParseIntPipe) batchId: number,
    @Body() dto: PostPayrollJournalDto,
  ) {
    return this.service.reverse(req.user, batchId, dto);
  }
}

@ApiTags('Payroll Reports')
@ApiBearerAuth('access-token')
@Controller('payroll/reports')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class PayrollReportsController {
  constructor(
    private readonly reportsService: PayrollReportsService,
    private readonly reconciliationService: PayrollReconciliationService,
    private readonly finalSettlementService: PayrollFinalSettlementService,
    private readonly auditService: PayrollAuditService,
  ) {}

  @Get('audit')
  @Permissions('payroll:reports')
  audit(@Req() req: AuthedRequest, @Query('limit') limit?: string) {
    return this.auditService.list(req.user, limit ? Number(limit) : 100);
  }

  @Get('dashboard')
  @Permissions('payroll:reports')
  dashboard(@Req() req: AuthedRequest) {
    return this.reportsService.dashboard(req.user);
  }

  @Post('runs/:runId/variance')
  @Permissions('payroll:reports')
  variance(
    @Req() req: AuthedRequest,
    @Param('runId', ParseIntPipe) runId: number,
    @Query('comparison_run_id') comparisonRunId?: string,
  ) {
    return this.reportsService.variance(
      req.user,
      runId,
      comparisonRunId ? Number(comparisonRunId) : undefined,
    );
  }

  @Get('catalog')
  @Permissions('payroll:reports')
  catalog() {
    return this.reportsService.catalog();
  }

  @Get('integrations/catalog')
  @Permissions('payroll:reports')
  integrationsCatalog() {
    return this.reportsService.integrationCatalog();
  }

  @Get('notifications/catalog')
  @Permissions('payroll:reports')
  notificationCatalog() {
    return this.reportsService.notificationCatalog();
  }

  @Get('readiness')
  @Permissions('payroll:reports')
  readiness() {
    return this.reportsService.deploymentReadiness();
  }

  @Get(':code')
  @Permissions('payroll:reports')
  report(
    @Req() req: AuthedRequest,
    @Param('code') code: string,
    @Query() query: PayrollReportQueryDto,
  ) {
    return this.reportsService.report(req.user, code, query);
  }

  @Post('reconciliation/run')
  @Permissions('payroll:reports')
  reconcile(@Req() req: AuthedRequest) {
    return this.reconciliationService.reconcile(req.user);
  }

  @Post('final-settlements/:offboardingRequestId/calculate')
  @Permissions('payroll:final-settlements')
  calculateFinalSettlement(
    @Req() req: AuthedRequest,
    @Param('offboardingRequestId', ParseIntPipe) offboardingRequestId: number,
  ) {
    return this.finalSettlementService.calculate(
      req.user,
      offboardingRequestId,
    );
  }

  @Get('final-settlements')
  @Permissions('payroll:final-settlements')
  listFinalSettlements(@Req() req: AuthedRequest) {
    return this.finalSettlementService.list(req.user);
  }

  @Get('final-settlements/:id')
  @Permissions('payroll:final-settlements')
  getFinalSettlement(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.finalSettlementService.get(req.user, id);
  }

  @Post('final-settlements/:id/submit')
  @Permissions('payroll:final-settlements')
  submitFinalSettlement(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.finalSettlementService.submit(req.user, id);
  }

  @Post('final-settlements/:id/decision')
  @Permissions('payroll:final-settlements')
  decideFinalSettlement(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecidePayrollFinalSettlementDto,
  ) {
    return this.finalSettlementService.decide(req.user, id, dto);
  }

  @Post('final-settlements/:id/simulate-payment')
  @Permissions('payroll:final-settlements')
  simulateFinalSettlementPayment(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SimulateFinalSettlementPaymentDto,
  ) {
    return this.finalSettlementService.simulatePayment(req.user, id, dto);
  }

  @Post('final-settlements/:id/reconcile')
  @Permissions('payroll:final-settlements')
  reconcileFinalSettlement(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.finalSettlementService.reconcile(req.user, id);
  }

  @Post('final-settlements/:id/close')
  @Permissions('payroll:final-settlements')
  closeFinalSettlement(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.finalSettlementService.close(req.user, id);
  }

  @Get('final-settlements/:id/statement')
  @Permissions('payroll:final-settlements')
  downloadFinalSettlementStatement(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: ExpressResponse,
  ) {
    return this.finalSettlementService.statement(req.user, id).then((file) =>
      res
        .set({
          'Content-Type': file.mime_type,
          'Content-Disposition': `attachment; filename="${file.file_name}"`,
          'Cache-Control': 'private, no-store',
        })
        .send(file.content),
    );
  }
}
