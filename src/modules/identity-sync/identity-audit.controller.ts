import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { CurrentAuditContext } from '../../common/decorators/audit-request-context.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import type { AuditRequestContext } from '../../common/interfaces/audit-request-context.interface';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { QueryIdentityAuditDto } from './dto/query-identity-audit.dto';
import { RollbackIdentityChangeDto } from './dto/rollback-identity-change.dto';
import { IdentityAuditService } from './identity-audit.service';
import { IdentitySyncService } from './identity-sync.service';

type AuthedRequest = Request & { user: AuthenticatedUser };

@Controller('identity-audit')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class IdentityAuditController {
  constructor(
    private readonly identityAuditService: IdentityAuditService,
    private readonly identitySyncService: IdentitySyncService,
  ) {}

  @Get()
  @Permissions('identity_audit:read')
  findAll(@Req() req: AuthedRequest, @Query() query: QueryIdentityAuditDto) {
    return this.identityAuditService.findAll(req.user.companyId!, query);
  }

  @Get('export')
  @Permissions('identity_audit:read')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="identity-change-audit.csv"',
  )
  exportCsv(@Req() req: AuthedRequest, @Query() query: QueryIdentityAuditDto) {
    return this.identityAuditService.exportCsv(req.user.companyId!, query);
  }

  @Post(':changeSetId/rollback')
  @Permissions('identity_audit:rollback')
  rollback(
    @Req() req: AuthedRequest,
    @Param('changeSetId', new ParseUUIDPipe()) changeSetId: string,
    @Body() dto: RollbackIdentityChangeDto,
    @CurrentAuditContext() context: AuditRequestContext,
  ) {
    return this.identitySyncService.rollback(
      req.user.companyId!,
      changeSetId,
      req.user,
      dto.reason?.trim() || null,
      context,
    );
  }
}
