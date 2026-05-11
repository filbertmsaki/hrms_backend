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
  ApiOperation,
  ApiResponse,
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
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  async getMe(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.usersService.findMyProfileById(req.user.id, req.user.companyId!);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current authenticated user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  async updateMe(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(req.user.id, updateUserDto);
  }

  @Post('me/change-password')
  @ApiOperation({ summary: 'Change current user password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 401, description: 'Current password incorrect' })
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
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
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
  @ApiOperation({ summary: 'Get all users' })
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
  @ApiOperation({ summary: 'Get user by ID' })
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.usersService.findProfileInCompany(id, req.user.companyId!);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('users:update')
  @ApiOperation({ summary: 'Update user information' })
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
  @ApiOperation({ summary: 'Delete a user (company administrator only)' })
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
  @ApiOperation({
    summary: 'Assign a role to a user (company administrator only)',
  })
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
  @ApiOperation({
    summary: 'Revoke a role from a user (company administrator only)',
  })
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
  async setup2FA(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.twoFaService.generate2FASetup(req.user.id);
  }

  // Verify & activate 2FA
  @Post('2fa/verify')
  async verify2FA(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: Verify2FaDto,
  ) {
    return this.twoFaService.verifyAndActivate2FA(req.user.id, dto.token);
  }

  @Post('2fa/disable')
  async disable2FA(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: Verify2FaDto,
  ) {
    return this.twoFaService.disable2FA(req.user.id, dto.token);
  }

  @Post('2fa/backup-codes/regenerate')
  async regenerateBackupCodes(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: Verify2FaDto,
  ) {
    return this.twoFaService.regenerateBackupCodes(req.user.id, dto.token);
  }
}
