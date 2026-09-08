import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { CreateEmployeeInvitationDto } from './dtos/create-employee-invitation.dto';
import { AcceptEmployeeInvitationDto } from './dtos/accept-employee-invitation.dto';
import { EmployeeInvitationsService } from './employee-invitations.service';

@ApiTags('Employee Invitations')
@ApiBearerAuth('access-token')
@Controller('employee-invitations')
export class EmployeeInvitationsController {
  constructor(
    private readonly employeeInvitationsService: EmployeeInvitationsService,
  ) {}

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
    );
  }

  @Get('accept/:token')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  findPublic(@Param('token') token: string) {
    return this.employeeInvitationsService.findPublic(token);
  }

  @Post('accept/:token')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  accept(
    @Param('token') token: string,
    @Body() dto: AcceptEmployeeInvitationDto,
  ) {
    return this.employeeInvitationsService.accept(token, dto);
  }
}
