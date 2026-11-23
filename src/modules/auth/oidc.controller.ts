import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentAuditContext } from '../../common/decorators/audit-request-context.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuditRequestContext } from '../../common/interfaces/audit-request-context.interface';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  ConfirmPasswordDto,
  OidcBrowserDto,
  OidcCallbackDto,
  OidcLinkDto,
  OidcLoginDto,
  ProviderDto,
  ProviderEnabledDto,
} from './dtos/oidc.dto';
import { OidcService } from './oidc.service';

type ActorRequest = Request & { user: AuthenticatedUser };

@Controller('auth/sso')
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class OidcController {
  constructor(private readonly sso: OidcService) {}

  @Get('provider')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @Permissions('company_users:manage')
  @Header('Cache-Control', 'no-store')
  settings(@Req() req: ActorRequest) {
    return this.sso.settings(req.user);
  }

  @Put('provider')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @Permissions('company_users:manage')
  save(
    @Req() req: ActorRequest,
    @Body() body: ProviderDto,
    @CurrentAuditContext() context: AuditRequestContext,
  ) {
    return this.sso.save(req.user, body, context);
  }

  @Put('provider/enabled')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @Permissions('company_users:manage')
  enable(
    @Req() req: ActorRequest,
    @Body() body: ProviderEnabledDto,
    @CurrentAuditContext() context: AuditRequestContext,
  ) {
    return this.sso.enable(req.user, body.enabled, context);
  }

  @Get('identity')
  @UseGuards(AuthGuard('jwt'))
  @Header('Cache-Control', 'no-store')
  identity(@Req() req: ActorRequest) {
    return this.sso.linkStatus(req.user);
  }

  @Post('unlink')
  @UseGuards(AuthGuard('jwt'))
  unlink(
    @Req() req: ActorRequest,
    @Body() body: ConfirmPasswordDto,
    @CurrentAuditContext() context: AuditRequestContext,
  ) {
    return this.sso.unlink(req.user, body.password, context);
  }

  @Post('login/start')
  @Public()
  login(
    @Body() body: OidcLoginDto,
    @CurrentAuditContext() context: AuditRequestContext,
  ) {
    return this.sso.start('login', body.browser_key, context, {
      slug: body.company,
    });
  }

  @Post('link/start')
  @UseGuards(AuthGuard('jwt'))
  link(
    @Req() req: ActorRequest,
    @Body() body: OidcLinkDto,
    @CurrentAuditContext() context: AuditRequestContext,
  ) {
    return this.sso.start('link', body.browser_key, context, {
      actor: req.user,
      password: body.password,
    });
  }

  @Post('test/start')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @Permissions('company_users:manage')
  test(
    @Req() req: ActorRequest,
    @Body() body: OidcBrowserDto,
    @CurrentAuditContext() context: AuditRequestContext,
  ) {
    return this.sso.start('test', body.browser_key, context, {
      actor: req.user,
    });
  }

  @Post('login/finish')
  @Public()
  @Header('Cache-Control', 'no-store')
  loginFinish(
    @Body() body: OidcCallbackDto,
    @CurrentAuditContext() context: AuditRequestContext,
  ) {
    return this.sso.finish('login', body, context);
  }

  @Post('link/finish')
  @UseGuards(AuthGuard('jwt'))
  linkFinish(
    @Req() req: ActorRequest,
    @Body() body: OidcCallbackDto,
    @CurrentAuditContext() context: AuditRequestContext,
  ) {
    return this.sso.finish('link', body, context, req.user);
  }

  @Post('test/finish')
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @Permissions('company_users:manage')
  testFinish(
    @Req() req: ActorRequest,
    @Body() body: OidcCallbackDto,
    @CurrentAuditContext() context: AuditRequestContext,
  ) {
    return this.sso.finish('test', body, context, req.user);
  }
}
