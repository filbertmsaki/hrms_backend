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
  ApprovePayrollRunDto,
  CreatePayrollAccountingMappingDto,
  CreatePayrollCalendarDto,
  CreatePayrollComponentDto,
  CreatePayrollInputDto,
  CreatePayrollRunDto,
  CreateSalaryStructureDto,
  CreateStatutoryRuleDto,
  CreateStatutorySchemeDto,
  GeneratePayrollPeriodDto,
  PayrollQueryDto,
  UpsertEmployeePayrollProfileDto,
} from '../dto/payroll.dto';
import {
  EmployeePayrollProfileService,
  PayrollAccountingService,
  PayrollBankService,
  PayrollConfigurationService,
  PayrollFinalSettlementService,
  PayrollInputService,
  PayrollReportsService,
  PayrollReconciliationService,
  PayrollRunService,
  PayslipService,
} from '../services/payroll-core.services';

type AuthedRequest = ExpressRequest & { user: AuthenticatedUser };

@ApiTags('Payroll Configuration')
@ApiBearerAuth('access-token')
@Controller('payroll/configuration')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class PayrollConfigurationController {
  constructor(private readonly service: PayrollConfigurationService) {}

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
  @Permissions('payroll:config:read')
  listStructures(@Req() req: AuthedRequest) {
    return this.service.listStructures(req.user);
  }

  @Get('salary-structures/:id')
  @Permissions('payroll:config:read')
  getStructure(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.getStructure(req.user, id);
  }

  @Post('calendars')
  @Permissions('payroll:config')
  createCalendar(
    @Req() req: AuthedRequest,
    @Body() dto: CreatePayrollCalendarDto,
  ) {
    return this.service.createCalendar(req.user, dto);
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

  @Post('statutory-rules')
  @Permissions('payroll:config')
  createRule(@Req() req: AuthedRequest, @Body() dto: CreateStatutoryRuleDto) {
    return this.service.createRule(req.user, dto);
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
}

@ApiTags('Employee Payroll')
@ApiBearerAuth('access-token')
@Controller('payroll/employees')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class EmployeePayrollController {
  constructor(private readonly service: EmployeePayrollProfileService) {}

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
  process(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.process(req.user, id);
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
  ) {
    return this.service.downloadMine(req.user, id);
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

  @Get('batches/:batchId/download')
  @Permissions('payroll:banking')
  download(
    @Req() req: AuthedRequest,
    @Param('batchId', ParseIntPipe) batchId: number,
  ) {
    return this.service.download(req.user, batchId);
  }
}

@ApiTags('Payroll Accounting')
@ApiBearerAuth('access-token')
@Controller('payroll/accounting')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class PayrollAccountingController {
  constructor(private readonly service: PayrollAccountingService) {}

  @Post('runs/:runId/journals')
  @Permissions('payroll:accounting')
  generate(
    @Req() req: AuthedRequest,
    @Param('runId', ParseIntPipe) runId: number,
  ) {
    return this.service.generate(req.user, runId);
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
  ) {}

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
}
