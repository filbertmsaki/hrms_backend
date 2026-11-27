import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  Permissions,
  PermissionsAny,
} from '../../../common/decorators/permissions.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import {
  CreateEmployeeLetterDto,
  CreateLetterTemplateDto,
  LetterApproveDto,
  LetterIssueDto,
  LetterPreviewDto,
  LetterQueryDto,
  LetterReasonDto,
  LetterTemplateQueryDto,
  LetterVerificationLookupDto,
  RecipientSearchDto,
  UpdateEmployeeLetterDto,
  UpdateLetterTemplateDto,
} from './dto/letters.dto';
import { EmployeeLettersService, PdfFile } from './employee-letters.service';
import { LetterTemplatesService } from './letter-templates.service';
import { LetterVerificationService } from './letter-verification.service';

type AuthedRequest = Request & { user: AuthenticatedUser };

function inlinePdf(file: PdfFile): StreamableFile {
  return new StreamableFile(file.buffer, {
    type: 'application/pdf',
    disposition: `inline; filename="${file.fileName.replace(/["\r\n]/g, '_')}"`,
    length: file.buffer.length,
  });
}

function attachmentPdf(file: PdfFile): StreamableFile {
  return new StreamableFile(file.buffer, {
    type: 'application/pdf',
    disposition: `attachment; filename="${file.fileName.replace(/["\r\n]/g, '_')}"`,
    length: file.buffer.length,
  });
}

/**
 * Public check of a letter's QR code. Token in the body keeps it out of
 * access logs (same as leave verification).
 */
@ApiTags('Letter verification (public)')
@Controller('letters/verification')
export class LetterVerificationController {
  constructor(private readonly verification: LetterVerificationService) {}

  @Post('lookup')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify an employee letter from its QR code' })
  lookup(@Body() dto: LetterVerificationLookupDto) {
    return this.verification.lookup(dto.token);
  }
}

@ApiTags('Employee Letters – templates')
@ApiBearerAuth('access-token')
@Controller('letters/templates')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class LetterTemplatesController {
  constructor(
    private readonly templates: LetterTemplatesService,
    private readonly letters: EmployeeLettersService,
  ) {}

  @Get()
  @PermissionsAny('employee_letters:read', 'letter_templates:manage')
  list(@Req() req: AuthedRequest, @Query() query: LetterTemplateQueryDto) {
    return this.templates.list(req.user, query);
  }

  @Post()
  @Permissions('letter_templates:manage')
  create(@Req() req: AuthedRequest, @Body() dto: CreateLetterTemplateDto) {
    return this.templates.create(req.user, dto);
  }

  @Get(':id')
  @PermissionsAny('employee_letters:read', 'letter_templates:manage')
  get(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.templates.get(req.user, id);
  }

  @Patch(':id')
  @Permissions('letter_templates:manage')
  update(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLetterTemplateDto,
  ) {
    return this.templates.update(req.user, id, dto);
  }

  @Post(':id/duplicate')
  @Permissions('letter_templates:manage')
  duplicate(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.templates.duplicate(req.user, id);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @Permissions('letter_templates:manage')
  activate(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.templates.setActive(req.user, id, true);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Permissions('letter_templates:manage')
  deactivate(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.templates.setActive(req.user, id, false);
  }

  @Post(':id/default')
  @HttpCode(HttpStatus.OK)
  @Permissions('letter_templates:manage')
  setDefault(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.templates.setDefault(req.user, id);
  }

  @Get(':id/versions')
  @PermissionsAny('employee_letters:read', 'letter_templates:manage')
  versions(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.templates.versions(req.user, id);
  }

  @Post(':id/preview')
  @HttpCode(HttpStatus.OK)
  @PermissionsAny('employee_letters:read', 'letter_templates:manage')
  async preview(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LetterPreviewDto,
  ): Promise<StreamableFile> {
    return inlinePdf(await this.letters.previewTemplate(req.user, id, dto));
  }
}

@ApiTags('Employee Letters')
@ApiBearerAuth('access-token')
@Controller('letters')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class EmployeeLettersController {
  constructor(private readonly letters: EmployeeLettersService) {}

  @Get('catalogue')
  @Permissions('employee_letters:read')
  catalogue() {
    return this.letters.catalogue();
  }

  @Get('recipients/search')
  @Permissions('employee_letters:create')
  searchRecipients(
    @Req() req: AuthedRequest,
    @Query() query: RecipientSearchDto,
  ) {
    return this.letters.searchRecipients(req.user, query);
  }

  @Get('recipients/:kind/:id/values')
  @Permissions('employee_letters:create')
  recipientValues(
    @Req() req: AuthedRequest,
    @Param('kind') kind: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.letters.recipientValues(req.user, kind, id);
  }

  @Get()
  @Permissions('employee_letters:read')
  list(@Req() req: AuthedRequest, @Query() query: LetterQueryDto) {
    return this.letters.list(req.user, query);
  }

  @Post()
  @Permissions('employee_letters:create')
  create(@Req() req: AuthedRequest, @Body() dto: CreateEmployeeLetterDto) {
    return this.letters.create(req.user, dto);
  }

  @Get(':id')
  @Permissions('employee_letters:read')
  get(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.letters.get(req.user, id);
  }

  @Patch(':id')
  @Permissions('employee_letters:create')
  update(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeLetterDto,
  ) {
    return this.letters.update(req.user, id, dto);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @Permissions('employee_letters:create')
  submit(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.letters.submit(req.user, id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Permissions('employee_letters:approve')
  approve(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LetterApproveDto,
  ) {
    return this.letters.approve(req.user, id, dto.note);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @Permissions('employee_letters:approve')
  reject(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LetterReasonDto,
  ) {
    return this.letters.reject(req.user, id, dto.reason);
  }

  @Post(':id/issue')
  @HttpCode(HttpStatus.OK)
  @Permissions('employee_letters:issue')
  issue(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LetterIssueDto,
  ) {
    return this.letters.issue(req.user, id, dto.send_email !== false);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Permissions('employee_letters:cancel')
  cancel(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LetterReasonDto,
  ) {
    return this.letters.cancel(req.user, id, dto.reason);
  }

  @Post(':id/revise')
  @Permissions('employee_letters:create')
  revise(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.letters.revise(req.user, id);
  }

  @Get(':id/preview')
  @Permissions('employee_letters:read')
  async preview(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<StreamableFile> {
    return inlinePdf(await this.letters.preview(req.user, id));
  }

  @Get(':id/download')
  @Permissions('employee_letters:read')
  async download(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<StreamableFile> {
    return attachmentPdf(await this.letters.download(req.user, id));
  }
}
