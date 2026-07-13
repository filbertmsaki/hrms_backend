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
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import type { Request as ExpressRequest } from 'express';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
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
  ApiAuthErrorResponses,
  ApiOperationSummary,
  ApiSuccessResponse,
  ApiValidationErrorResponse,
  ApiTooManyRequestsResponse,
  ApiGoneResponse,
} from '../../docs/swagger-decorators';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ────────────────────────────────
  //  Step 1: Login
  // ────────────────────────────────

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperationSummary(
    'Login with email and password',
    'Authenticates the user and returns JWT access and refresh tokens. ' +
      'If 2FA is enabled, a temporary token is returned instead for the next verification step.',
    'Auth_login',
  )
  @ApiSuccessResponse(200, 'Login successful', {
    schema: {
      example: {
        access_token: 'eyJhbGciOiJIUzI1NiIs...',
        refresh_token: 'dGhpcyBpcyBhIHJlZnJl...',
        user: { id: 1, email: 'amina.moshi@acme.co.tz', requires_2fa: false },
      },
    },
  })
  @ApiValidationErrorResponse()
  @ApiAuthErrorResponses()
  @ApiTooManyRequestsResponse()
  async login(@Body() loginDto: LoginDto, @Req() req: ExpressRequest) {
    return this.authService.login(loginDto, req.ip);
  }

  // ────────────────────────────────
  //  Step 3: 2FA Login
  // ────────────────────────────────

  @Post('2fa/complete-login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperationSummary(
    'Complete two-factor authentication login',
    'Validates a TOTP or backup code using the temporary token obtained from the login step. ' +
      'Returns the final JWT access and refresh tokens upon successful verification.',
    'Auth_complete2FALogin',
  )
  @ApiSuccessResponse(200, '2FA verification successful', {
    schema: {
      example: {
        access_token: 'eyJhbGciOiJIUzI1NiIs...',
        refresh_token: 'dGhpcyBpcyBhIHJlZnJl...',
        user: { id: 1, email: 'amina.moshi@acme.co.tz' },
      },
    },
  })
  @ApiValidationErrorResponse()
  @ApiTooManyRequestsResponse()
  async complete2FALogin(
    @Body() dto: Complete2FALoginDto,
    @Req() req: ExpressRequest,
  ) {
    return this.authService.complete2FALogin(dto.tempToken, dto.code, req.ip);
  }

  // ────────────────────────────────
  //  Step 4: Refresh Token
  // ────────────────────────────────

  @Post('refresh')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperationSummary(
    'Refresh access token',
    'Exchanges a valid refresh token for a new access/refresh token pair. ' +
      'Use this when the current access token has expired.',
    'Auth_refresh',
  )
  @ApiSuccessResponse(200, 'Token refreshed successfully', {
    schema: {
      example: {
        access_token: 'eyJhbGciOiJIUzI1NiIs...',
        refresh_token: 'dGhpcyBpcyBhIHJlZnJl...',
      },
    },
  })
  @ApiValidationErrorResponse()
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto);
  }

  // ────────────────────────────────
  //  Step 5: Switch Company
  // ────────────────────────────────

  @Post('switch-company')
  @UseGuards(AuthGuard('jwt'))
  @SkipThrottle()
  @ApiOperationSummary(
    'Switch active company context',
    'Changes the active tenant for a multi-company user and returns a refreshed JWT with the new company context.',
    'Auth_switchCompany',
  )
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiSuccessResponse(200, 'Company switched successfully', {
    schema: {
      example: {
        access_token: 'eyJhbGciOiJIUzI1NiIs...',
        company_id: 2,
        company_name: 'Acme Corp',
      },
    },
  })
  async switchCompany(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: SwitchCompanyDto,
  ) {
    return this.authService.switchCompany(req.user.id, dto.company_id, req.ip);
  }

  // ────────────────────────────────
  //  Step 6: Verify Email
  // ────────────────────────────────

  @Get('verify-email')
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @ApiOperationSummary(
    'Verify email address',
    'Confirms account ownership using the verification token sent to the user email. ' +
      'The token is typically a UUID received via email.',
    'Auth_verifyEmail',
  )
  @ApiQuery({
    name: 'token',
    required: true,
    description: 'Email verification token received in the user inbox.',
    example: '3f9d6f2c-fb2d-4e7b-8f71-3939fda76f65',
  })
  @ApiSuccessResponse(200, 'Email verified successfully')
  @ApiGoneResponse('Verification token')
  async verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  // ────────────────────────────────
  //  Step 7: Resend Verification
  // ────────────────────────────────

  @Post('resend-verification')
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @ApiOperationSummary(
    'Resend verification email',
    'Resends the email verification link to the specified email address. ' +
      'Rate-limited to 3 requests per hour.',
    'Auth_resendVerification',
  )
  @ApiSuccessResponse(200, 'Verification email sent')
  @ApiValidationErrorResponse()
  @ApiTooManyRequestsResponse()
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerificationEmail(dto.email);
  }

  // ────────────────────────────────
  //  Step 8: Forgot Password
  // ────────────────────────────────

  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @ApiOperationSummary(
    'Request password reset',
    'Sends a password reset token to the registered email address. ' +
      'The token is required for the reset-password endpoint.',
    'Auth_forgotPassword',
  )
  @ApiSuccessResponse(200, 'Password reset instructions sent to your email')
  @ApiValidationErrorResponse()
  @ApiTooManyRequestsResponse()
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  // ────────────────────────────────
  //  Step 9: Reset Password
  // ────────────────────────────────

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 600000 } })
  @ApiOperationSummary(
    'Reset password',
    'Resets the account password using the token received from the forgot-password endpoint.',
    'Auth_resetPassword',
  )
  @ApiSuccessResponse(200, 'Password reset successful')
  @ApiValidationErrorResponse()
  @ApiGoneResponse('Reset token')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // ────────────────────────────────
  //  Step 10: Logout
  // ────────────────────────────────

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @SkipThrottle()
  @ApiOperationSummary(
    'Logout',
    'Blacklists the current refresh token and access token. ' +
      'After calling this endpoint the user must log in again to obtain new tokens.',
    'Auth_logout',
  )
  @ApiAuthRequired()
  @ApiSuccessResponse(200, 'Logged out successfully')
  @ApiValidationErrorResponse()
  async logout(
    @Body() dto: LogoutDto,
    @Headers('authorization') authHeader: string,
  ) {
    const token = authHeader?.replace(/^Bearer\s+/i, '');
    return this.authService.logout(dto, token);
  }
}
