import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request as ExpressRequest } from 'express';

import { CurrentAuditContext } from '../../common/decorators/audit-request-context.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import type { AuditRequestContext } from '../../common/interfaces/audit-request-context.interface';
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
import { AdminResetUserPasswordDto } from './dtos/admin-reset-user-password.dto';
import { CreateUserDto } from './dtos/create-user.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { UsersService } from './users.service';
import { AdminDisableUser2FADto } from './dtos/admin-disable-user-2fa.dto';
import { SetForceTwoFactorDto } from './dtos/set-force-two-factor.dto';
import { UpdateDashboardCardStyleDto } from './dtos/update-dashboard-card-style.dto';
import { SelectUserAvatarDto } from './dtos/select-user-avatar.dto';
import { TwoFactorPolicyService } from '../security/two-factor-policy.service';
import { CompaniesService } from '../companies/companies.service';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly twoFaService: TwoFaService,
    private readonly twoFactorPolicyService: TwoFactorPolicyService,
    private readonly companiesService: CompaniesService,
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

  @Get('me/dashboard-card-style')
  @ApiOperationSummary(
    'Get my dashboard card style',
    'Returns the signed-in user’s shared dashboard card doodle and color preference.',
    'Users_getMyDashboardCardStyle',
  )
  @ApiAuthRequired()
  @ApiSuccessResponse(200, 'Dashboard card style retrieved successfully')
  getMyDashboardCardStyle(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.usersService.getMyDashboardCardStyle(req.user.id);
  }

  @Patch('me/dashboard-card-style')
  @ApiOperationSummary(
    'Update my dashboard card style',
    'Updates the signed-in user’s shared dashboard card doodle and color preference.',
    'Users_updateMyDashboardCardStyle',
  )
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiSuccessResponse(200, 'Dashboard card style updated successfully')
  updateMyDashboardCardStyle(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: UpdateDashboardCardStyleDto,
  ) {
    return this.usersService.updateMyDashboardCardStyle(req.user.id, dto);
  }

  @Post('me/profile-photo')
  @ApiOperationSummary(
    'Upload my account profile picture',
    'Uploads a profile picture for a company account that is not linked to an employee record.',
    'Users_uploadMyAccountProfilePhoto',
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  @ApiAuthRequired()
  @ApiSuccessResponse(201, 'Profile picture uploaded successfully')
  uploadMyAccountProfilePhoto(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @UploadedFile()
    file?: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {
    if (!file) {
      throw new BadRequestException('Profile picture file is required.');
    }
    return this.usersService.uploadMyAccountProfilePhoto(
      req.user.companyId!,
      req.user.id,
      file,
    );
  }

  @Get('me/available-avatars')
  @ApiOperationSummary(
    'List my available avatars',
    'Returns active default avatars available to the current user based on company and employee gender rules.',
    'Users_listMyAvailableAvatars',
  )
  @ApiAuthRequired()
  @ApiSuccessResponse(200, 'Available avatars retrieved successfully')
  async listMyAvailableAvatars(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.usersService.listMyAvailableAvatars(
      req.user.companyId!,
      req.user.id,
    );
  }

  @Get('me/avatars')
  @ApiOperationSummary(
    'List my available avatars (legacy path)',
    'Backward-compatible alias for listing active default avatars available to the current user.',
    'Users_listMyAvailableAvatarsLegacy',
  )
  @ApiAuthRequired()
  @ApiSuccessResponse(200, 'Available avatars retrieved successfully')
  async listMyAvailableAvatarsLegacy(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.usersService.listMyAvailableAvatars(
      req.user.companyId!,
      req.user.id,
    );
  }

  @Patch('me/avatar')
  @ApiOperationSummary(
    'Select my avatar',
    'Assigns an existing active default avatar to the current user profile without re-uploading the image.',
    'Users_selectMyAvatar',
  )
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiSuccessResponse(200, 'Avatar selected successfully')
  updateMyAvatar(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: SelectUserAvatarDto,
  ) {
    return this.usersService.updateMySelectedAvatar(
      req.user.companyId!,
      req.user.id,
      dto.avatar_id,
    );
  }

  @Delete('me/avatar')
  @ApiOperationSummary(
    'Clear my selected avatar',
    'Removes the selected default avatar and returns the profile picture to automatic fallback resolution.',
    'Users_clearMyAvatar',
  )
  @ApiAuthRequired()
  @ApiSuccessResponse(200, 'Avatar selection cleared successfully')
  clearMyAvatar(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    if (req.user.employeeId) {
      throw new BadRequestException(
        'Employees must use /me/profile/avatar to manage their default avatar selection.',
      );
    }

    return this.usersService.clearMySelectedAvatar(
      req.user.companyId!,
      req.user.id,
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
    const employeeControlledFields = [
      'first_name',
      'last_name',
      'phone',
      'email',
    ];
    const attemptedControlledFields = employeeControlledFields.filter(
      (field) => field in (updateUserDto as Record<string, unknown>),
    );

    if (req.user.employeeId && attemptedControlledFields.length > 0) {
      throw new BadRequestException(
        `Employee profile fields (${attemptedControlledFields.join(', ')}) require HR approval. Use /me/profile-change-requests instead.`,
      );
    }

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

  @Post(':id/reset-password')
  @UseGuards(PermissionsGuard)
  @Permissions('users:update')
  @ApiOperationSummary(
    'Reset a user password',
    'Sets a temporary password for a user in the active company, revokes active sessions, and requires a password change after the next login.',
    'Users_adminResetPassword',
  )
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiNotFoundResponse('User')
  @ApiSuccessResponse(200, 'User password reset successfully')
  async resetPassword(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminResetUserPasswordDto,
  ) {
    return this.usersService.resetPasswordInCompany(
      req.user.companyId!,
      id,
      dto.new_password,
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

  @Patch(':id/avatar')
  @UseGuards(PermissionsGuard)
  @Permissions('users:update')
  @ApiOperationSummary(
    'Assign avatar to a user',
    'Assigns an existing active default avatar to a specific user profile within the active company.',
    'Users_assignAvatar',
  )
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiNotFoundResponse('User or employee')
  @ApiSuccessResponse(200, 'Avatar assigned successfully')
  updateAvatar(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SelectUserAvatarDto,
  ) {
    return this.usersService.updateUserSelectedAvatar(
      req.user.companyId!,
      id,
      dto.avatar_id,
    );
  }

  @Delete(':id/avatar')
  @UseGuards(PermissionsGuard)
  @Permissions('users:update')
  @ApiOperationSummary(
    'Clear a user avatar',
    'Removes the selected default avatar from a specific user profile within the active company.',
    'Users_clearAvatar',
  )
  @ApiAuthRequired()
  @ApiNotFoundResponse('User or employee')
  @ApiSuccessResponse(200, 'Avatar cleared successfully')
  clearAvatar(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.usersService.clearUserSelectedAvatar(req.user.companyId!, id);
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
    @CurrentAuditContext() context: AuditRequestContext,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.twoFaService.adminEnable2FA(
      req.user.companyId!,
      userId,
      req.user,
      context,
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
    @CurrentAuditContext() context: AuditRequestContext,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: AdminDisableUser2FADto,
  ) {
    return this.twoFaService.adminDisable2FA(
      req.user.companyId!,
      userId,
      req.user,
      dto.reason,
      context,
    );
  }

  @Patch(':userId/two-factor/force')
  @UseGuards(PermissionsGuard)
  @Permissions('users:manage-2fa')
  @ApiOperationSummary(
    'Set mandatory two-factor authentication for a user',
    'Allows an authorized administrator to mark two-factor authentication as mandatory (or optional) for a specific user, independent of their role. When mandatory and not yet configured, the user is blocked from using the system until 2FA setup is completed.',
    'Users_setForceTwoFactor',
  )
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiNotFoundResponse('User')
  @ApiSuccessResponse(200, 'User force-2FA setting updated successfully', {
    schema: {
      example: {
        success: true,
        message: 'Two-factor authentication is now mandatory for this user.',
        data: {
          userId: 12,
          forceTwoFactor: true,
        },
      },
    },
  })
  async setForceTwoFactor(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: SetForceTwoFactorDto,
  ) {
    await this.companiesService.findCompanyUserContext(
      req.user.companyId!,
      userId,
    );
    await this.usersService.setForceTwoFactor(userId, dto.force);

    return {
      success: true,
      message: dto.force
        ? 'Two-factor authentication is now mandatory for this user.'
        : 'Two-factor authentication is no longer mandatory for this user.',
      data: {
        userId,
        forceTwoFactor: dto.force,
      },
    };
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
    @CurrentAuditContext() context: AuditRequestContext,
    @Body() dto: Verify2FaDto,
  ) {
    return this.twoFaService.verifyAndActivate2FA(
      req.user.id,
      dto.token,
      context,
    );
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
    @CurrentAuditContext() context: AuditRequestContext,
    @Body() dto: Verify2FaDto,
  ) {
    this.twoFactorPolicyService.assertCanDisable(
      (req.user.forceTwoFactor ?? false) ||
        this.twoFactorPolicyService.isRequired(
          req.user.roles ?? [],
          req.user.permissions ?? [],
        ),
    );
    return this.twoFaService.disable2FA(req.user.id, dto.token, context);
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
