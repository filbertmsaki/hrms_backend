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
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PlatformGuard } from '../../common/guards/platform.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { AddCompanyUserDto } from './dtos/add-company-user.dto';
import { AssignCompanyUserPermissionDto } from './dtos/assign-company-user-permission.dto';
import { AssignCompanyUserRoleDto } from './dtos/assign-company-user-role.dto';
import { CreateCompanyDto } from './dtos/create-company.dto';
import { UpdateCompanyDto } from './dtos/update-company.dto';
import { CompaniesService } from './companies.service';
import {
  ApiActionOperation,
  ApiCreateOperation,
  ApiDeleteOperation,
  ApiGetOneOperation,
  ApiListOperation,
  ApiOperationSummary,
  ApiAuthRequired,
  ApiSuccessResponse,
  ApiUpdateOperation,
} from '../../docs/swagger-decorators';

@ApiTags('Companies')
@ApiBearerAuth('access-token')
@Controller('companies')
@UseGuards(AuthGuard('jwt'))
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('companies:read')
  @ApiListOperation('Company', 'List all companies in platform scope')
  async listCompanies() {
    return this.companiesService.findAllCompanies();
  }

  @UseGuards(TenantGuard)
  @Get('my')
  @ApiOperationSummary(
    'List my accessible companies',
    'Returns all companies the currently authenticated user has access to.',
  )
  @ApiAuthRequired()
  @ApiSuccessResponse(200, 'User companies retrieved')
  async listMyCompanies(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.companiesService.listUserCompanies(req.user.id);
  }

  // ─── Current company endpoints (must be before /:id) ─────────────────────

  @Get('current/onboarding-status')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('companies:read')
  @ApiGetOneOperation(
    'Company Onboarding Status',
    'Check whether company setup is complete',
  )
  async getCurrentCompanyOnboardingStatus(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.companiesService.getCurrentCompanyOnboardingStatus(
      req.user.companyId!,
    );
  }

  @Get('current/users')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('company_users:read')
  @ApiListOperation('Company Users', 'List active users in the current company')
  async listCurrentCompanyUsers(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: PaginationDto,
  ) {
    return this.companiesService.findCompanyUsersPaginated(
      req.user.companyId!,
      query,
    );
  }

  @Post('current/users')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('company_users:create')
  @ApiCreateOperation(
    'Company User',
    'Add an existing user to the current company',
  )
  async addUserToCurrentCompany(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: AddCompanyUserDto,
  ) {
    return this.companiesService.addExistingUserToCurrentCompany(
      req.user.companyId!,
      dto,
    );
  }

  @Delete('current/users/:userId')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('company_users:delete')
  @ApiDeleteOperation('Company User', 'Remove a user from the current company')
  async removeUserFromCurrentCompany(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.companiesService.removeUserFromCompany(
      req.user.companyId!,
      userId,
    );
  }

  @Post('current/users/:userId/roles')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('company_users:update')
  @ApiActionOperation(
    'Assign Role to Company User',
    'Assign a role to an existing company user',
  )
  async assignRoleToCurrentCompanyUser(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: AssignCompanyUserRoleDto,
  ) {
    return this.companiesService.assignRole(
      req.user.companyId!,
      userId,
      dto.role_id,
    );
  }

  @Delete('current/users/:userId/roles/:roleId')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('company_users:update')
  @ApiDeleteOperation('Company User Role', 'Revoke a role from a company user')
  async revokeRoleFromCurrentCompanyUser(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('userId', ParseIntPipe) userId: number,
    @Param('roleId', ParseIntPipe) roleId: number,
  ) {
    return this.companiesService.revokeRole(
      req.user.companyId!,
      userId,
      roleId,
    );
  }

  @Post('current/users/:userId/permissions')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('company_users:update')
  @ApiActionOperation(
    'Assign Permission to Company User',
    'Assign a direct permission to an existing company user',
  )
  async assignPermissionToCurrentCompanyUser(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: AssignCompanyUserPermissionDto,
  ) {
    return this.companiesService.assignPermission(
      req.user.companyId!,
      userId,
      dto.permission_id,
    );
  }

  @Delete('current/users/:userId/permissions/:permissionId')
  @UseGuards(TenantGuard, PermissionsGuard)
  @Permissions('company_users:update')
  @ApiDeleteOperation(
    'Company User Permission',
    'Revoke a direct permission from a company user',
  )
  async revokePermissionFromCurrentCompanyUser(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('userId', ParseIntPipe) userId: number,
    @Param('permissionId', ParseIntPipe) permissionId: number,
  ) {
    return this.companiesService.revokePermission(
      req.user.companyId!,
      userId,
      permissionId,
    );
  }

  // ─── Platform owner routes (/:id must come after /current and /my) ────────

  @Get(':id')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('companies:read')
  @ApiGetOneOperation('Company', 'Get a company by ID in platform scope')
  async findOneCompany(@Param('id', ParseIntPipe) id: number) {
    return this.companiesService.findOneCompany(id);
  }

  @Patch(':id')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('companies:update')
  @ApiUpdateOperation('Company', 'Update a company in platform scope')
  async updateCompany(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.companiesService.updateCompany(id, dto);
  }

  @Post(':id/activate')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('companies:update')
  @ApiActionOperation(
    'Activate Company',
    'Activate a suspended company in platform scope',
  )
  async activateCompany(@Param('id', ParseIntPipe) id: number) {
    return this.companiesService.activateCompany(id);
  }

  @Post(':id/suspend')
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('companies:update')
  @ApiActionOperation(
    'Suspend Company',
    'Suspend an active company in platform scope',
  )
  async suspendCompany(@Param('id', ParseIntPipe) id: number) {
    return this.companiesService.suspendCompany(id);
  }

  @Post()
  @UseGuards(PlatformGuard, PermissionsGuard)
  @Permissions('companies:create')
  @ApiCreateOperation(
    'Company',
    'Create a company and its first administrator in platform scope',
  )
  async createCompany(@Body() createCompanyDto: CreateCompanyDto) {
    return this.companiesService.createCompanyWithAdministrator(
      createCompanyDto,
    );
  }
}
