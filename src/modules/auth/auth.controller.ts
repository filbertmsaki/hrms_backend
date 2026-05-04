import {
  Body,
  Controller,
  Post,
  UseGuards,
  Req,
  Headers,
  Get,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import type { Request as ExpressRequest } from 'express';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { RegisterDto } from './dtos/register.dto';
import { LoginDto } from './dtos/login.dto';
import { RefreshTokenDto } from './dtos/refresh-token.dto';
import { LogoutDto } from './dtos/logout.dto';
import { ForgotPasswordDto } from './dtos/forgot-password.dto';
import { ResetPasswordDto } from './dtos/reset-password.dto';
import { Complete2FALoginDto } from './dtos/complete-2fa-login.dto';
import { ResendVerificationDto } from './dtos/resend-verification.dto';
import { SwitchCompanyDto } from './dtos/switch-company.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 600000 } }) // 5 per 10 min
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async login(@Body() loginDto: LoginDto, @Req() req: ExpressRequest) {
    return this.authService.login(loginDto, req.ip);
  }

  @Post('2fa/complete-login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async complete2FALogin(
    @Body() dto: Complete2FALoginDto,
    @Req() req: ExpressRequest,
  ) {
    return this.authService.complete2FALogin(dto.tempToken, dto.code, req.ip);
  }

  @Post('refresh')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto);
  }

  @Post('switch-company')
  @UseGuards(AuthGuard('jwt'))
  @SkipThrottle()
  async switchCompany(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: SwitchCompanyDto,
  ) {
    return this.authService.switchCompany(req.user.id, dto.company_id, req.ip);
  }

  @Get('verify-email')
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  async verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('resend-verification')
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerificationEmail(dto.email);
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @SkipThrottle()
  async logout(
    @Body() dto: LogoutDto,
    @Headers('authorization') authHeader: string,
  ) {
    const token = authHeader?.replace(/^Bearer\s+/i, '');
    return this.authService.logout(dto, token);
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 600000 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
