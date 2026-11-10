import {
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
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  Permissions,
  PermissionsAny,
} from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { Base64FileDto } from '../../files/dtos/base64-file.dto';
import { HrAccessService } from '../shared/hr-access.service';
import {
  CancelEmploymentContractDto,
  CreateEmploymentContractDto,
  ListEmploymentContractsQueryDto,
  UpdateEmploymentContractDto,
} from './dto/create-employment-contract.dto';
import {
  AcknowledgePayrollContractWarningsDto,
  CreateSignatoryDto,
  ReasonDto,
  ReassignSignatoryDto,
  RenewContractDto,
  SendContractDto,
  SignContractDto,
  SignedUploadDto,
  UpdateCompanyLegalDto,
  UpdateContractSettingsDto,
  UpdateSignatoryDto,
  UpsertContractTemplateDto,
  VerifyUploadDto,
} from './dto/contract-workflow.dto';
import { ContractPayrollWarningsService } from './contract-payroll-warnings.service';
import { ContractSettingsService } from './contract-settings.service';
import { ContractSignatoriesService } from './contract-signatories.service';
import { ContractSigningService } from './contract-signing.service';
import { ContractTemplatesService } from './contract-templates.service';
import { EmploymentContractsService } from './employment-contracts.service';

type AuthedRequest = Request & { user: AuthenticatedUser };

/** Employee self-service. */
const SELF = 'employment_contracts:self';
const READ = 'employment_contracts:read';
const MANAGE = 'employment_contracts:manage';

function sendFile(
  response: Response,
  document: {
    buffer: Buffer;
    mimeType: string | null;
    fileName: string;
    sha256?: string;
  },
) {
  response.setHeader('Content-Type', document.mimeType ?? 'application/pdf');
  response.setHeader(
    'Content-Disposition',
    `inline; filename="${document.fileName.replace(/["\r\n]/g, '')}"`,
  );
  if (document.sha256) response.setHeader('X-Document-SHA256', document.sha256);
  response.setHeader('Access-Control-Expose-Headers', 'X-Document-SHA256');
  response.setHeader('Cache-Control', 'private, no-store');
  response.send(document.buffer);
}

@Controller('employment-contracts')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class EmploymentContractsController {
  constructor(
    private readonly service: EmploymentContractsService,
    private readonly signing: ContractSigningService,
    private readonly templates: ContractTemplatesService,
    private readonly settings: ContractSettingsService,
    private readonly payrollWarnings: ContractPayrollWarningsService,
    private readonly access: HrAccessService,
  ) {}

  // ── Settings & templates ──

  @Get('settings')
  @PermissionsAny(READ, MANAGE, 'contract_signatories:manage')
  getSettings(@Req() req: AuthedRequest) {
    return this.settings.getForActor(req.user);
  }

  @Put('settings/legal')
  @PermissionsAny(MANAGE, 'companies:update')
  updateLegal(@Req() req: AuthedRequest, @Body() dto: UpdateCompanyLegalDto) {
    return this.settings.updateLegal(req.user, dto);
  }

  @Put('settings/signing')
  @Permissions('contract_signatories:manage')
  updateSigning(
    @Req() req: AuthedRequest,
    @Body() dto: UpdateContractSettingsDto,
  ) {
    return this.settings.updateContractSettings(req.user, dto as never);
  }

  @Get('templates')
  @PermissionsAny(READ, MANAGE)
  listTemplates(@Req() req: AuthedRequest) {
    return this.templates.list(req.user);
  }

  @Put('templates')
  @Permissions(MANAGE)
  upsertTemplate(
    @Req() req: AuthedRequest,
    @Body() dto: UpsertContractTemplateDto,
  ) {
    return this.templates.upsert(req.user, dto);
  }

  // ── Payroll contract warnings ──

  @Get('payroll-runs/:runId/warnings')
  @PermissionsAny('payroll:runs:read', 'payroll:runs:lock', MANAGE)
  payrollWarningsList(
    @Req() req: AuthedRequest,
    @Param('runId', ParseIntPipe) runId: number,
  ) {
    return this.payrollWarnings.warnings(
      this.access.ensureActorCompanyId(req.user),
      runId,
    );
  }

  @Post('payroll-runs/:runId/warnings/acknowledge')
  @PermissionsAny(MANAGE, 'payroll:runs:approve', 'payroll:runs:lock')
  acknowledgePayrollWarnings(
    @Req() req: AuthedRequest,
    @Param('runId', ParseIntPipe) runId: number,
    @Body() dto: AcknowledgePayrollContractWarningsDto,
  ) {
    return this.payrollWarnings.acknowledge(
      req.user,
      this.access.ensureActorCompanyId(req.user),
      runId,
      dto.warnings_hash,
      dto.note,
    );
  }

  // ── HR management ──

  @Get()
  @PermissionsAny(READ, MANAGE)
  listAll(
    @Req() req: AuthedRequest,
    @Query() query: ListEmploymentContractsQueryDto,
  ) {
    return this.service.listAll(req.user, query);
  }

  @Get('summary')
  @PermissionsAny(READ, MANAGE)
  summary(@Req() req: AuthedRequest) {
    return this.service.summary(req.user);
  }

  @Get('prefill/:employeeId')
  @Permissions(MANAGE)
  prefill(
    @Req() req: AuthedRequest,
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.service.prefill(req.user, employeeId);
  }

  @Post()
  @Permissions(MANAGE)
  create(@Req() req: AuthedRequest, @Body() dto: CreateEmploymentContractDto) {
    return this.service.createDraft(req.user, dto);
  }

  @Patch(':id')
  @Permissions(MANAGE)
  update(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmploymentContractDto,
  ) {
    return this.service.updateDraft(req.user, id, dto);
  }

  @Get(':id/fields')
  @Permissions(MANAGE)
  fields(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.signing.fields(req.user, id);
  }

  @Post(':id/preview')
  @Permissions(MANAGE)
  preview(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.signing.preview(req.user, id);
  }

  @Post(':id/send')
  @Permissions(MANAGE)
  send(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendContractDto,
  ) {
    return this.signing.send(req.user, id, dto);
  }

  @Patch(':id/signatory')
  @Permissions(MANAGE)
  reassign(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReassignSignatoryDto,
  ) {
    return this.signing.reassignSignatory(req.user, id, dto);
  }

  @Post(':id/verify')
  @Permissions(MANAGE)
  verify(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VerifyUploadDto,
  ) {
    return this.signing.verify(req.user, id, dto);
  }

  @Post(':id/renew')
  @Permissions(MANAGE)
  renew(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenewContractDto,
  ) {
    return this.service.renewOrAmend(req.user, id, dto);
  }

  @Post(':id/cancel')
  @Permissions(MANAGE)
  cancel(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelEmploymentContractDto,
  ) {
    return this.service.cancel(req.user, id, dto);
  }

  /** Attach an externally prepared PDF as the base document (draft only); replacing a sent one issues a new version. */
  @Post(':id/document')
  @Permissions(MANAGE)
  attach(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() file: Base64FileDto,
  ) {
    return this.service.attachDocument(req.user, id, file);
  }

  // ── Signing (company signatory or employee; the service decides) ──

  @Post(':id/sign/challenge')
  @Throttle({ default: { limit: 3, ttl: 600_000 } })
  challenge(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.signing.challenge(req.user, id);
  }

  @Post(':id/sign')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  sign(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SignContractDto,
  ) {
    return this.signing.sign(req.user, id, dto);
  }

  @Post(':id/signed-upload')
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  signedUpload(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SignedUploadDto,
  ) {
    return this.signing.signedUpload(req.user, id, dto);
  }

  // ── Employee self-service ──

  @Get('me')
  @PermissionsAny(SELF)
  mine(@Req() req: AuthedRequest) {
    return this.service.listMine(req.user);
  }

  // ── Shared reads (HR scope, own contract, or assigned signatory) ──

  @Get('employees/:employeeId')
  @PermissionsAny(READ, SELF)
  list(
    @Req() req: AuthedRequest,
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.service.list(req.user, employeeId);
  }

  @Get(':id/files')
  files(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.signing.files(req.user, id);
  }

  @Get(':id/files/:documentId')
  async file(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Res() response: Response,
  ) {
    sendFile(response, await this.signing.readFile(req.user, id, documentId));
  }

  /** Current file (final when completed). Kept for existing links. */
  @Get(':id/document')
  async document(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Res() response: Response,
  ) {
    sendFile(response, await this.signing.readFile(req.user, id, null));
  }

  @Get(':id/documents')
  documents(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.signing.files(req.user, id);
  }

  @Get(':id/documents/:documentId')
  async documentVersion(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Res() response: Response,
  ) {
    sendFile(response, await this.signing.readFile(req.user, id, documentId));
  }

  @Get(':id')
  detail(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.detail(req.user, id);
  }
}

@Controller('contract-signatories')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class ContractSignatoriesController {
  constructor(private readonly service: ContractSignatoriesService) {}

  /** Any signed-in user: am I a signatory, and how many contracts wait for me. */
  @Get('me')
  mine(@Req() req: AuthedRequest) {
    return this.service.mine(req.user);
  }

  @Get()
  @PermissionsAny('contract_signatories:manage', MANAGE, READ)
  list(@Req() req: AuthedRequest) {
    return this.service.list(req.user);
  }

  @Post()
  @Permissions('contract_signatories:manage')
  create(@Req() req: AuthedRequest, @Body() dto: CreateSignatoryDto) {
    return this.service.create(req.user, dto);
  }

  @Patch(':id')
  @Permissions('contract_signatories:manage')
  update(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSignatoryDto,
  ) {
    return this.service.update(req.user, id, dto);
  }

  @Post(':id/revoke')
  @Permissions('contract_signatories:manage')
  revoke(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReasonDto,
  ) {
    return this.service.revoke(req.user, id, dto.reason);
  }

  @Post(':id/reactivate')
  @Permissions('contract_signatories:manage')
  reactivate(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.reactivate(req.user, id);
  }
}
