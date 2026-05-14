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
import {
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
import {
  ApiAuthRequired,
  ApiConflictResponse,
  ApiOperationSummary,
  ApiSuccessResponse,
  ApiValidationErrorResponse,
} from '../../docs/swagger-decorators';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 600000 } }) // 5 per 10 min
  @ApiOperationSummary(
    'Register a new account',
    'Creates the first company and administrator profile for a new tenant.',
  )
  @ApiSuccessResponse(201, 'Registration successful')
  @ApiValidationErrorResponse()
  @ApiConflictResponse('Email')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperationSummary(
    'Login with email and password',
    'Returns access and refresh tokens when credentials are valid.',
  )
  @ApiSuccessResponse(200, 'Login successful')
  @ApiValidationErrorResponse()
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials.',
    schema: {
      example: {
        statusCode: 401,
        message: 'Invalid email or password',
        error: 'Unauthorized',
      },
    },
  })
  async login(@Body() loginDto: LoginDto, @Req() req: ExpressRequest) {
    return this.authService.login(loginDto, req.ip);
  }

  @Post('2fa/complete-login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperationSummary(
    'Complete two-factor authentication login',
    'Validates TOTP or backup code using the temporary token from the login step.',
  )
  @ApiSuccessResponse(200, '2FA verification successful')
  @ApiValidationErrorResponse()
  async complete2FALogin(
    @Body() dto: Complete2FALoginDto,
    @Req() req: ExpressRequest,
  ) {
    return this.authService.complete2FALogin(dto.tempToken, dto.code, req.ip);
  }

  @Post('refresh')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperationSummary('Refresh access token')
  @ApiSuccessResponse(200, 'Token refreshed successfully')
  @ApiValidationErrorResponse()
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto);
  }

  @Post('switch-company')
  @UseGuards(AuthGuard('jwt'))
  @SkipThrottle()
  @ApiOperationSummary(
    'Switch active company context',
    'Changes the active tenant context and returns a refreshed access token payload.',
  )
  @ApiAuthRequired()
  @ApiSuccessResponse(200, 'Company switched successfully')
  @ApiValidationErrorResponse()
  async switchCompany(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: SwitchCompanyDto,
  ) {
    return this.authService.switchCompany(req.user.id, dto.company_id, req.ip);
  }

  @Get('verify-email')
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @ApiOperationSummary(
    'Verify email address',
    'Confirms account ownership using the token sent to the user email.',
  )
  @ApiQuery({
    name: 'token',
    required: true,
    description: 'Email verification token received in the user inbox.',
    example: '3f9d6f2c-fb2d-4e7b-8f71-3939fda76f65',
  })
  @ApiSuccessResponse(200, 'Email verified successfully')
  async verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('resend-verification')
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @ApiOperationSummary('Resend verification email')
  @ApiSuccessResponse(200, 'Verification email sent')
  @ApiValidationErrorResponse()
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerificationEmail(dto.email);
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @ApiOperationSummary(
    'Request password reset',
    'Sends a password reset link or token to the registered email.',
  )
  @ApiSuccessResponse(200, 'Password reset instructions sent')
  @ApiValidationErrorResponse()
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 600000 } })
  @ApiOperationSummary('Reset password')
  @ApiSuccessResponse(200, 'Password reset successful')
  @ApiValidationErrorResponse()
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @SkipThrottle()
  @ApiOperationSummary('Logout')
  @ApiAuthRequired()
  @ApiSuccessResponse(200, 'Logout successful')
  @ApiValidationErrorResponse()
  async logout(
    @Body() dto: LogoutDto,
    @Headers('authorization') authHeader: string,
  ) {
    const token = authHeader?.replace(/^Bearer\s+/i, '');
    return this.authService.logout(dto, token);
  }
}
