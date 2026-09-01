import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { EscalateSupportDto } from './dto/escalate-support.dto';
import { SupportService } from './support.service';

@Controller('support')
@UseGuards(AuthGuard('jwt'))
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('escalate')
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  escalate(
    @Req() request: Request & { user: AuthenticatedUser },
    @Body() body: EscalateSupportDto,
  ) {
    return this.supportService.escalate(request.user, body);
  }
}
