import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators/public.decorator';
import { LeaveVerificationLookupDto } from './dtos/leave-verification-lookup.dto';
import { LeaveVerificationService } from './services/leave-verification.service';

/**
 * Public, unauthenticated check of a leave PDF's QR code. The token goes in
 * the body (not the path) to keep it out of API access logs, matching the
 * employee-invitation lookup.
 */
@ApiTags('Leave verification (public)')
@Controller('leave/verification')
export class LeaveVerificationController {
  constructor(private readonly verificationService: LeaveVerificationService) {}

  @Post('lookup')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Verify a leave request from the QR code on its PDF',
  })
  lookup(@Body() dto: LeaveVerificationLookupDto) {
    return this.verificationService.lookup(dto.token);
  }
}
