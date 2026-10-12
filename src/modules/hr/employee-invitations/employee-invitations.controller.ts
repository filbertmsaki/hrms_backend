import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import {
  Permissions,
  PermissionsAny,
} from '../../../common/decorators/permissions.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { CreateEmployeeInvitationDto } from './dtos/create-employee-invitation.dto';
import { AcceptEmployeeInvitationDto } from './dtos/accept-employee-invitation.dto';
import { ListEmployeeInvitationsQueryDto } from './dtos/list-employee-invitations-query.dto';
import {
  AcceptEmployeeInvitationWithTokenDto,
  InvitationTokenDto,
} from './dtos/invitation-token.dto';
import { EmployeeInvitationsService } from './employee-invitations.service';

@ApiTags('Employee Invitations')
@ApiBearerAuth('access-token')
@Controller('employee-invitations')
export class EmployeeInvitationsController {
  constructor(
    private readonly employeeInvitationsService: EmployeeInvitationsService,
  ) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
  @PermissionsAny(
    'employees:create',
    'onboarding_requests:read',
    'onboarding_workflows:read',
  )
  findPending(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.employeeInvitationsService.findPending(req.user.companyId!);
  }

  // Declared before ':id' so "history" is not parsed as an id.
  @Get('history')
  @UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
  @PermissionsAny(
    'employees:create',
    'onboarding_requests:read',
    'onboarding_workflows:read',
  )
  findHistory(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: ListEmployeeInvitationsQueryDto,
  ) {
    return this.employeeInvitationsService.findHistory(
      req.user.companyId!,
      query,
    );
  }

  // Lets the invite form warn before HR overfills a position.
  @Get('position-capacity/:positionId')
  @UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
  @Permissions('employees:create')
  positionCapacity(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('positionId', ParseIntPipe) positionId: number,
  ) {
    return this.employeeInvitationsService.positionCapacity(
      req.user.companyId!,
      positionId,
    );
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
  @PermissionsAny(
    'employees:create',
    'onboarding_requests:read',
    'onboarding_workflows:read',
  )
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) invitationId: number,
  ) {
    return this.employeeInvitationsService.findOne(
      req.user.companyId!,
      invitationId,
    );
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
  @Permissions('employees:create')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateEmployeeInvitationDto,
  ) {
    return this.employeeInvitationsService.create(
      req.user.companyId!,
      dto,
      req.user,
    );
  }

  @Post(':id/resend')
  @UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
  @Permissions('employees:create')
  resend(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) invitationId: number,
  ) {
    return this.employeeInvitationsService.resend(
      req.user.companyId!,
      invitationId,
      req.user,
    );
  }

  @Post(':id/cancel')
  @UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
  @Permissions('employees:create')
  cancel(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) invitationId: number,
  ) {
    return this.employeeInvitationsService.cancel(
      req.user.companyId!,
      invitationId,
    );
  }

  // Token in the body, never the URL: request paths end up in proxy and
  // access logs. POST because GET bodies are not reliably supported.
  @Post('lookup')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  lookup(@Body() dto: InvitationTokenDto) {
    return this.employeeInvitationsService.findPublic(dto.token);
  }

  @Post('accept')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  acceptWithBodyToken(@Body() dto: AcceptEmployeeInvitationWithTokenDto) {
    return this.employeeInvitationsService.accept(dto.token, {
      password: dto.password,
    });
  }

  /**
   * @deprecated Puts the token in the URL. Kept only so a frontend deployed
   * before this backend keeps working; remove once all clients use
   * POST /employee-invitations/lookup.
   */
  @Get('accept/:token')
  @Public()
  @ApiOperation({ deprecated: true, summary: 'Use POST /lookup instead' })
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  findPublic(@Param('token') token: string) {
    return this.employeeInvitationsService.findPublic(token);
  }

  /**
   * @deprecated Puts the token in the URL. Kept only for frontends deployed
   * before this backend; remove once all clients use POST /accept.
   */
  @Post('accept/:token')
  @Public()
  @ApiOperation({ deprecated: true, summary: 'Use POST /accept instead' })
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  accept(
    @Param('token') token: string,
    @Body() dto: AcceptEmployeeInvitationDto,
  ) {
    return this.employeeInvitationsService.accept(token, dto);
  }
}
