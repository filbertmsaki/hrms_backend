import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { QuerySecurityEventsDto } from './dto/query-security-events.dto';
import { SecurityEventsService } from './security-events.service';

@Controller('security-events')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class SecurityEventsController {
  constructor(private readonly securityEventsService: SecurityEventsService) {}

  @Get()
  @Permissions('security_events:read')
  findAll(
    @Req()
    request: Request & {
      user: AuthenticatedUser;
    },
    @Query() query: QuerySecurityEventsDto,
  ) {
    return this.securityEventsService.findAll(request.user, query);
  }
}
