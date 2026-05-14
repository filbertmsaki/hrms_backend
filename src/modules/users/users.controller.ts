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
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';

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
import { PaginationDto } from 'src/common/dto/pagination.dto';
import {
  ApiAuthRequired,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperationSummary,
  ApiSuccessResponse,
  ApiValidationErrorResponse,
} from '../../docs/swagger-decorators';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly twoFaService: TwoFaService,
  ) {}

  @Get('me')
  @ApiOperationSummary('Get my profile')
  @ApiAuthRequired()
  @ApiSuccessResponse(200, 'User profile retrieved')
  async getMe(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.usersService.findMyProfileById(req.user.id, req.user.companyId!);
  }

  @Patch('me')
  @ApiOperationSummary('Update my profile')
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
  @ApiOperationSummary('Change my password')
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
  @ApiOperationSummary('Create user')
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
  @ApiOperationSummary('Get all users')
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
  @ApiOperationSummary('Get one user by ID')
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
  @ApiOperationSummary('Update user')
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
  @Roles('ADMINISTRATOR')
  @Permissions('users:delete')
  @ApiOperationSummary('Delete user')
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
  @Roles('ADMINISTRATOR')
  @Permissions('users:assign-role')
  @ApiOperationSummary('Assign role to user')
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
  @Roles('ADMINISTRATOR')
  @Permissions('users:revoke-role')
  @ApiOperationSummary('Revoke role from user')
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

  @Post('2fa/setup')
  @ApiOperationSummary('Setup 2FA')
  @ApiAuthRequired()
  @ApiSuccessResponse(200, '2FA setup generated')
  async setup2FA(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.twoFaService.generate2FASetup(req.user.id);
  }

  // Verify & activate 2FA
  @Post('2fa/verify')
  @ApiOperationSummary('Verify and activate 2FA')
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
  @ApiOperationSummary('Disable 2FA')
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
  @ApiOperationSummary('Regenerate 2FA backup codes')
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiSuccessResponse(200, 'Backup codes regenerated')
  async regenerateBackupCodes(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: Verify2FaDto,
  ) {
    return this.twoFaService.regenerateBackupCodes(req.user.id, dto.token);
  }
}
