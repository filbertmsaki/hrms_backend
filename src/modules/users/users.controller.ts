import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  UseGuards,
  Req,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

import { UsersService } from './users.service';
import { CreateUserDto } from './dtos/create-user.dto';
import { UpdateUserDto } from './dtos/update-user.dto';

import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import type { Request as ExpressRequest } from 'express';

import { Roles } from '../../common/decorators/roles.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { TwoFaService } from '../auth/2fa/2fa.service';
import { Verify2FaDto } from '../auth/2fa/dto/verify-2fa.dto';
import { ChangePasswordDto } from './dtos/change-password.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  ApiAuthRequired,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperationSummary,
  ApiSuccessResponse,
  ApiValidationErrorResponse,
} from '../../docs/swagger-decorators';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly twoFaService: TwoFaService,
  ) {}

  private isPrivilegedCompanyUser(
    req: ExpressRequest & { user: AuthenticatedUser },
  ): boolean {
    return (
      req.user.roles.includes('ADMINISTRATOR') ||
      req.user.roles.includes('OWNER')
    );
  }

  // ────────────────────────────────
  //  Self-service: Get My Profile
  // ────────────────────────────────

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

  // ────────────────────────────────
  //  Self-service: Update My Profile
  // ────────────────────────────────

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

  // ────────────────────────────────
  //  Self-service: Change Password
  // ────────────────────────────────

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

  // ────────────────────────────────
  //  Admin: Create User
  // ────────────────────────────────

  @Post()
  @UseGuards(RolesGuard, PermissionsGuard)
  @Permissions('users:create')
  @ApiOperationSummary(
    'Create a new user in the company',
    'Creates a new user account within the active company context. Requires ADMINISTRATOR role or users:create permission.',
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

  // ────────────────────────────────
  //  Admin: List Users
  // ────────────────────────────────

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
    if (!this.isPrivilegedCompanyUser(req)) {
      throw new ForbiddenException('You can only read your own user profile');
    }

    return this.usersService.findAllPaginatedInCompany(
      req.user.companyId!,
      query,
    );
  }

  // ────────────────────────────────
  //  Admin: Get User by ID
  // ────────────────────────────────

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
    if (!this.isPrivilegedCompanyUser(req) && req.user.id !== id) {
      throw new ForbiddenException('You can only read your own user profile');
    }

    return this.usersService.findProfileInCompany(id, req.user.companyId!);
  }

  // ────────────────────────────────
  //  Admin: Update User
  // ────────────────────────────────

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
    if (!this.isPrivilegedCompanyUser(req) && req.user.id !== id) {
      throw new ForbiddenException('You can only update your own user profile');
    }

    return this.usersService.updateInCompany(
      req.user.companyId!,
      id,
      updateUserDto,
    );
  }

  // ────────────────────────────────
  //  Admin: Delete User
  // ────────────────────────────────

  @Delete(':id')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('ADMINISTRATOR')
  @Permissions('users:delete')
  @ApiOperationSummary(
    'Delete a user',
    'Permanently removes a user from the active company. Only users with ADMINISTRATOR role can delete users.',
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

  // ────────────────────────────────
  //  Admin: Assign Role
  // ────────────────────────────────

  @Post(':userId/roles/:roleId')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('ADMINISTRATOR')
  @Permissions('users:assign-role')
  @ApiOperationSummary(
    'Assign role to user',
    'Assigns a role to a user within the active company. Requires ADMINISTRATOR role.',
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

  // ────────────────────────────────
  //  Admin: Revoke Role
  // ────────────────────────────────

  @Delete(':userId/roles/:roleId')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('ADMINISTRATOR')
  @Permissions('users:revoke-role')
  @ApiOperationSummary(
    'Revoke role from user',
    'Removes a role assignment from a user within the active company. Requires ADMINISTRATOR role.',
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

  // ────────────────────────────────
  //  2FA: Setup
  // ────────────────────────────────

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

  // ────────────────────────────────
  //  2FA: Verify & Activate
  // ────────────────────────────────

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

  // ────────────────────────────────
  //  2FA: Disable
  // ────────────────────────────────

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

  // ────────────────────────────────
  //  2FA: Regenerate Backup Codes
  // ────────────────────────────────

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
