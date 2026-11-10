import {
  Body,
  Controller,
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
import type { Request, Response } from 'express';
import {
  Permissions,
  PermissionsAny,
} from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { Base64FileDto } from '../../files/dtos/base64-file.dto';
import {
  CancelEmploymentContractDto,
  CreateEmploymentContractDto,
  ListEmploymentContractsQueryDto,
  UpdateEmploymentContractDto,
} from './dto/create-employment-contract.dto';
import { EmploymentContractsService } from './employment-contracts.service';
import { IsNotEmpty, IsString } from 'class-validator';

class SignContractDto {
  @IsString()
  @IsNotEmpty()
  signed_name: string;
}

type AuthedRequest = Request & { user: AuthenticatedUser };

/** Self-service access: new permission, plus the legacy onboarding proxy until all roles are migrated. */
const SELF = ['employment_contracts:self', 'onboarding_requests:read'] as const;

@Controller('employment-contracts')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class EmploymentContractsController {
  constructor(private readonly service: EmploymentContractsService) {}

  // ── HR management ──

  @Get()
  @PermissionsAny('employment_contracts:read', 'employment_contracts:manage')
  listAll(
    @Req() req: AuthedRequest,
    @Query() query: ListEmploymentContractsQueryDto,
  ) {
    return this.service.listAll(req.user, query);
  }

  @Get('summary')
  @PermissionsAny('employment_contracts:read', 'employment_contracts:manage')
  summary(@Req() req: AuthedRequest) {
    return this.service.summary(req.user);
  }

  @Get('prefill/:employeeId')
  @Permissions('employment_contracts:manage')
  prefill(
    @Req() req: AuthedRequest,
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.service.prefill(req.user, employeeId);
  }

  /** Creates a DRAFT (no longer issues or supersedes anything). */
  @Post()
  @Permissions('employment_contracts:manage')
  create(@Req() req: AuthedRequest, @Body() dto: CreateEmploymentContractDto) {
    return this.service.createDraft(req.user, dto);
  }

  @Patch(':id')
  @Permissions('employment_contracts:manage')
  update(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmploymentContractDto,
  ) {
    return this.service.updateDraft(req.user, id, dto);
  }

  @Post(':id/cancel')
  @Permissions('employment_contracts:manage')
  cancel(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelEmploymentContractDto,
  ) {
    return this.service.cancel(req.user, id, dto);
  }

  /** Legacy: attach an externally prepared PDF (treated as company-signed). */
  @Post(':id/document')
  @Permissions('employment_contracts:manage')
  attach(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() file: Base64FileDto,
  ) {
    return this.service.attachDocument(req.user, id, file);
  }

  // ── Employee self-service ──

  @Get('me')
  @PermissionsAny(...SELF)
  mine(@Req() req: AuthedRequest) {
    return this.service.listMine(req.user);
  }

  @Post(':id/sign')
  @PermissionsAny(...SELF)
  sign(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SignContractDto,
  ) {
    return this.service.sign(req.user, id, dto.signed_name);
  }

  // ── Shared reads (HR scope or own contract) ──

  @Get('employees/:employeeId')
  @PermissionsAny('employment_contracts:read', ...SELF)
  list(
    @Req() req: AuthedRequest,
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.service.list(req.user, employeeId);
  }

  @Get(':id/documents')
  @PermissionsAny('employment_contracts:read', ...SELF)
  documents(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.listDocuments(req.user, id);
  }

  @Get(':id/documents/:documentId')
  @PermissionsAny('employment_contracts:read', ...SELF)
  async documentVersion(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Res() response: Response,
  ) {
    const document = await this.service.readDocumentVersion(
      req.user,
      id,
      documentId,
    );
    this.sendFile(response, document);
  }

  @Get(':id/document')
  @PermissionsAny('employment_contracts:read', ...SELF)
  async document(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Res() response: Response,
  ) {
    this.sendFile(response, await this.service.readDocument(req.user, id));
  }

  @Get(':id')
  @PermissionsAny('employment_contracts:read', ...SELF)
  detail(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.detail(req.user, id);
  }

  private sendFile(
    response: Response,
    document: { buffer: Buffer; mimeType: string | null; fileName: string },
  ) {
    response.setHeader(
      'Content-Type',
      document.mimeType ?? 'application/octet-stream',
    );
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${document.fileName.replace(/["\r\n]/g, '')}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(document.buffer);
  }
}
