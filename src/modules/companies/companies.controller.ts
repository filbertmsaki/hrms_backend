import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
import {
  ApiCreateOperation,
  ApiListOperation,
  ApiOperationSummary,
  ApiAuthRequired,
  ApiSuccessResponse,
} from '../../docs/swagger-decorators';

@ApiTags('Companies')
@ApiBearerAuth('access-token')
@Controller('companies')
@UseGuards(AuthGuard('jwt'))
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('OWNER')
  @Permissions('companies:read')
  @ApiListOperation('Company', 'List all companies as the platform owner')
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

  @Post()
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('OWNER')
  @Permissions('companies:create')
  @ApiCreateOperation('Company', 'Create a company and its first administrator (OWNER only)')
  async createCompany(@Body() createCompanyDto: CreateCompanyDto) {
    return this.companiesService.createCompanyWithAdministrator(
      createCompanyDto,
    );
  }
}
