import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CreateCompanyDto } from './dtos/create-company.dto';
import { CompaniesService } from './companies.service';

@ApiTags('Companies')
@ApiBearerAuth()
@Controller('companies')
@UseGuards(AuthGuard('jwt'))
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('OWNER')
  @Permissions('companies:read')
  @ApiOperation({ summary: 'List all companies as the platform owner' })
  async listCompanies() {
    return this.companiesService.findAllCompanies();
  }

  @UseGuards(TenantGuard)
  @Get('my')
  @ApiOperation({ summary: 'List companies the current user can access' })
  async listMyCompanies(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.companiesService.listUserCompanies(req.user.id);
  }

  @Post()
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('OWNER')
  @Permissions('companies:create')
  @ApiOperation({
    summary:
      'Create a company and its first administrator as the platform owner',
  })
  async createCompany(@Body() createCompanyDto: CreateCompanyDto) {
    return this.companiesService.createCompanyWithAdministrator(
      createCompanyDto,
    );
  }
}
