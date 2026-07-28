import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Request as ExpressRequest } from 'express';

import { Roles } from '../../common/decorators/roles.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  ApiAuthRequired,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperationSummary,
  ApiSuccessResponse,
  ApiValidationErrorResponse,
} from '../../docs/swagger-decorators';
import { TwoFaService } from '../auth/2fa/2fa.service';
import { Verify2FaDto } from '../auth/2fa/dto/verify-2fa.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ChangePasswordDto } from './dtos/change-password.dto';
import { CreateUserDto } from './dtos/create-user.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { UsersService } from './users.service';
import { AdminDisableUser2FADto } from './dtos/admin-disable-user-2fa.dto';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly twoFaService: TwoFaService,
  ) {}

  @Get('me')
  @ApiOperationSummary(
    'Get my profile',
    'Returns the profile details of the currently authenticated user including company context.',
    'Users_getMyProfile',
  )
  @ApiAuthRequired()
  @ApiSuccessResponse(200, 'User profile retrieved successfully', {
    schema: {
      example: {
        id: 1,
        email: 'amina.moshi@acme.co.tz',
        first_name: 'Amina',
        last_name: 'Moshi',
        phone: '+255712345678',
        created_at: '2026-01-15T10:30:00Z',
      },
    },
  })
  async getMe(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.usersService.findMyProfileById(
      req.user.id,
      req.user.companyId!,
    );
  }

  @Patch('me')
  @ApiOperationSummary(
    'Update my profile',
    'Updates the profile fields of the currently authenticated user.',
    'Users_updateMyProfile',
  )
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiSuccessResponse(200, 'Profile updated successfully')
  async updateMe(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(req.user.id, updateUserDto);
  }

  @Post('me/change-password')
  @ApiOperationSummary(
    'Change my password',
    'Changes the password for the currently authenticated user. Requires the current password for verification.',
    'Users_changeMyPassword',
  )
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiSuccessResponse(200, 'Password changed successfully')
  async changeMyPassword(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(
      req.user.id,
      dto.old_password,
      dto.new_password,
    );
  }

  @Post()
  @UseGuards(RolesGuard, PermissionsGuard)
  @Permissions('users:create')
  @ApiOperationSummary(
    'Create a new user in the company',
    'Creates a new user account within the active company context. Requires COMPANY_ADMIN role or users:create permission.',
    'Users_create',
  )
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiConflictResponse('User')
  @ApiSuccessResponse(201, 'User created successfully')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() createUserDto: CreateUserDto,
  ) {
    return this.usersService.createForCompany(
      req.user.companyId!,
      createUserDto,
    );
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('users:read')
  @ApiOperationSummary(
    'List all users in the company',
    'Returns a paginated list of users within the active company. Supports search, sorting, and pagination.',
    'Users_list',
  )
  @ApiAuthRequired()
  @ApiSuccessResponse(200, 'Users retrieved successfully')
  async findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: PaginationDto,
  ) {
    return this.usersService.findAllPaginatedInCompany(
      req.user.companyId!,
      query,
    );
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('users:read')
  @ApiOperationSummary(
    'Get a user by ID',
    'Returns the full profile of a specific user within the active company.',
    'Users_getOne',
  )
  @ApiAuthRequired()
  @ApiNotFoundResponse('User')
  @ApiSuccessResponse(200, 'User retrieved successfully')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.usersService.findProfileInCompany(id, req.user.companyId!);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('users:update')
  @ApiOperationSummary(
    'Update a user',
    'Updates the profile fields of a specific user in the active company.',
    'Users_update',
  )
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiNotFoundResponse('User')
  @ApiSuccessResponse(200, 'User updated successfully')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.updateInCompany(
      req.user.companyId!,
      id,
      updateUserDto,
    );
  }

  @Delete(':id')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('COMPANY_ADMIN')
  @Permissions('users:delete')
  @ApiOperationSummary(
    'Delete a user',
    'Permanently removes a user from the active company. Only users with COMPANY_ADMIN role can delete users.',
    'Users_delete',
  )
  @ApiAuthRequired()
  @ApiNotFoundResponse('User')
  @ApiSuccessResponse(200, 'User deleted successfully')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.usersService.removeFromCompany(req.user.companyId!, id);
  }

  @Post(':userId/roles/:roleId')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('COMPANY_ADMIN')
  @Permissions('users:assign-role')
  @ApiOperationSummary(
    'Assign role to user',
    'Assigns a role to a user within the active company. Requires COMPANY_ADMIN role.',
    'Users_assignRole',
  )
  @ApiAuthRequired()
  @ApiNotFoundResponse('User or role')
  @ApiSuccessResponse(200, 'Role assigned successfully')
  assignRole(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('userId', ParseIntPipe) userId: number,
    @Param('roleId', ParseIntPipe) roleId: number,
  ) {
    return this.usersService.assignRoleInCompany(
      req.user.companyId!,
      userId,
      roleId,
    );
  }

  @Delete(':userId/roles/:roleId')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('COMPANY_ADMIN')
  @Permissions('users:revoke-role')
  @ApiOperationSummary(
    'Revoke role from user',
    'Removes a role assignment from a user within the active company. Requires COMPANY_ADMIN role.',
    'Users_revokeRole',
  )
  @ApiAuthRequired()
  @ApiNotFoundResponse('Role assignment')
  @ApiSuccessResponse(200, 'Role revoked successfully')
  revokeRole(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('userId', ParseIntPipe) userId: number,
    @Param('roleId', ParseIntPipe) roleId: number,
  ) {
    return this.usersService.revokeRoleInCompany(
      req.user.companyId!,
      userId,
      roleId,
    );
  }

  @Patch(':userId/two-factor/enable')
  @UseGuards(PermissionsGuard)
  @Permissions('users:enable-2fa')
  @ApiOperationSummary(
    'Enable two-factor authentication for a user',
    'Allows an authorized administrator to enable 2FA for a selected user without exposing a secret. The user must complete setup during the next login.',
    'Users_enableUser2FA',
  )
  @ApiAuthRequired()
  @ApiConflictResponse('Two-factor authentication')
  @ApiNotFoundResponse('User')
  @ApiSuccessResponse(200, 'User 2FA enabled successfully', {
    schema: {
      example: {
        success: true,
        message:
          'Two-factor authentication has been enabled for the user. The user must complete 2FA setup during the next login.',
        data: {
          userId: 12,
          twoFactorEnabled: true,
          twoFactorSetupRequired: true,
        },
      },
    },
  })
  async enableUser2FA(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.twoFaService.adminEnable2FA(
      req.user.companyId!,
      userId,
      req.user,
      {
        ipAddress: req.ip,
        userAgent:
          typeof req.headers['user-agent'] === 'string'
            ? req.headers['user-agent']
            : null,
      },
    );
  }

  @Patch(':userId/two-factor/disable')
  @UseGuards(PermissionsGuard)
  @Permissions('users:disable-2fa')
  @ApiOperationSummary(
    'Disable two-factor authentication for a user',
    'Allows an authorized administrator to disable 2FA for a selected user, revoke recovery data, and invalidate active sessions.',
    'Users_disableUser2FA',
  )
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiNotFoundResponse('User')
  @ApiSuccessResponse(200, 'User 2FA disabled successfully', {
    schema: {
      example: {
        success: true,
        message: 'Two-factor authentication has been disabled for the user.',
        data: {
          userId: 12,
          twoFactorEnabled: false,
          twoFactorSetupRequired: false,
        },
      },
    },
  })
  async disableUser2FA(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: AdminDisableUser2FADto,
  ) {
    return this.twoFaService.adminDisable2FA(
      req.user.companyId!,
      userId,
      req.user,
      dto.reason,
      {
        ipAddress: req.ip,
        userAgent:
          typeof req.headers['user-agent'] === 'string'
            ? req.headers['user-agent']
            : null,
      },
    );
  }

  @Post('2fa/setup')
  @ApiOperationSummary(
    'Setup two-factor authentication',
    'Generates a 2FA setup including the secret key and QR code URL for the authenticator app.',
    'Users_setup2FA',
  )
  @ApiAuthRequired()
  @ApiSuccessResponse(200, '2FA setup generated successfully', {
    schema: {
      example: {
        secret: 'JBSWY3DPEHPK3PXP',
        qr_code_url: 'otpauth://totp/HRMS:amina@acme.co.tz?secret=...',
      },
    },
  })
  async setup2FA(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.twoFaService.generate2FASetup(req.user.id);
  }

  @Post('2fa/verify')
  @ApiOperationSummary(
    'Verify and activate 2FA',
    'Verifies the TOTP token against the generated secret and activates 2FA for the user account.',
    'Users_verify2FA',
  )
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiSuccessResponse(200, '2FA enabled successfully')
  async verify2FA(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: Verify2FaDto,
  ) {
    return this.twoFaService.verifyAndActivate2FA(req.user.id, dto.token);
  }

  @Post('2fa/disable')
  @ApiOperationSummary(
    'Disable two-factor authentication',
    'Disables 2FA for the user account after verifying the current TOTP token.',
    'Users_disable2FA',
  )
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiSuccessResponse(200, '2FA disabled successfully')
  async disable2FA(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: Verify2FaDto,
  ) {
    return this.twoFaService.disable2FA(req.user.id, dto.token);
  }

  @Post('2fa/backup-codes/regenerate')
  @ApiOperationSummary(
    'Regenerate 2FA backup codes',
    'Generates a new set of backup codes for 2FA recovery. Requires verification of the current TOTP token.',
    'Users_regenerateBackupCodes',
  )
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiSuccessResponse(200, 'Backup codes regenerated successfully', {
    schema: {
      example: {
        backup_codes: ['ABC1-DEF2-GHI3', 'JKL4-MNO5-PQR6', 'STU7-VWX8-YZA9'],
      },
    },
  })
  async regenerateBackupCodes(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: Verify2FaDto,
  ) {
    return this.twoFaService.regenerateBackupCodes(req.user.id, dto.token);
  }
}
