import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Header,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { PlatformGuard } from '../../common/guards/platform.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentAuditContext } from '../../common/decorators/audit-request-context.decorator';
import type { AuditRequestContext } from '../../common/interfaces/audit-request-context.interface';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuthSessionsService } from './auth-sessions.service';
import { SessionPolicyDto } from './dtos/session-policy.dto';

type ActorRequest = Request & { user: AuthenticatedUser };

@Controller('auth/administration')
@UseGuards(AuthGuard('jwt'))
export class AuthAdministrationController {
  constructor(private readonly sessions: AuthSessionsService) {}

  @Get('policy')
  @Header('Cache-Control', 'no-store')
  @UseGuards(PlatformGuard)
  policy() {
    return this.sessions.getPolicy();
  }

  @Put('policy')
  @UseGuards(PlatformGuard)
  update(
    @Req() req: ActorRequest,
    @Body() policy: SessionPolicyDto,
    @CurrentAuditContext() context: AuditRequestContext,
  ) {
    return this.sessions.setPolicy(req.user, policy, context);
  }

  @Get('sessions')
  @Header('Cache-Control', 'no-store')
  @UseGuards(PermissionsGuard)
  @Permissions('company_users:manage')
  list(
    @Req() req: ActorRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ) {
    if (page < 1 || page > 100000)
      throw new BadRequestException('Invalid page.');
    return this.sessions.listManagedSessions(req.user, page);
  }

  @Delete('sessions/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('company_users:manage')
  revoke(
    @Req() req: ActorRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuditContext() context: AuditRequestContext,
  ) {
    return this.sessions.revokeManagedSession(req.user, id, context);
  }
}
