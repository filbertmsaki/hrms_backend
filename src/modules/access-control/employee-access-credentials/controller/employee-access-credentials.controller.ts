import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import {
  ApiActionOperation,
  ApiGetOneOperation,
  ApiListOperation,
} from '../../../../docs/swagger-decorators';
import { CredentialStatusActionDto } from '../dto/credential-status-action.dto';
import { QueryEmployeeAccessCredentialDto } from '../dto/query-employee-access-credential.dto';
import { EmployeeAccessCredentialsService } from '../service/employee-access-credentials.service';

@ApiTags('Access Control Employee Access Credentials')
@ApiBearerAuth('access-token')
@Controller('access-control')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class EmployeeAccessCredentialsController {
  constructor(
    private readonly credentialsService: EmployeeAccessCredentialsService,
  ) {}

  @Get('access-credentials')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_access_credentials:read')
  @ApiListOperation(
    'Employee Access Credentials',
    'List backend-managed employee access credentials across employees/devices',
  )
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: QueryEmployeeAccessCredentialDto,
  ) {
    return this.credentialsService.findAll(req.user.companyId!, query);
  }

  @Get('employees/:employeeId/access-credentials')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_access_credentials:read')
  @ApiListOperation(
    'Employee Access Credentials',
    'List one employee credentials across all assigned devices',
  )
  findAllForEmployee(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Query() query: QueryEmployeeAccessCredentialDto,
  ) {
    return this.credentialsService.findAllForEmployee(
      req.user.companyId!,
      employeeId,
      query,
    );
  }

  @Get('access-credentials/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_access_credentials:read')
  @ApiGetOneOperation(
    'Employee Access Credential',
    'Get one backend-managed employee access credential',
  )
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.credentialsService.findById(req.user.companyId!, id);
  }

  @Get('access-credentials/:id/device-action-routes')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_access_credentials:read')
  @ApiGetOneOperation(
    'Credential Device Action Routes',
    'Return existing device-specific API routes for this credential',
  )
  getDeviceActionRoutes(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.credentialsService.getDeviceActionRoutes(
      req.user.companyId!,
      id,
    );
  }

  @Patch('access-credentials/:id/enable')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_access_credentials:update')
  @ApiActionOperation(
    'Enable Credential',
    'Record credential status and queue device reconciliation. Inspect the operation for its verified result.',
  )
  enable(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CredentialStatusActionDto,
  ) {
    return this.credentialsService.enable(req.user.companyId!, id, dto);
  }

  @Patch('access-credentials/:id/disable')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_access_credentials:update')
  @ApiActionOperation(
    'Disable Credential',
    'Record credential status and queue device reconciliation. Inspect the operation for its verified result.',
  )
  disable(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CredentialStatusActionDto,
  ) {
    return this.credentialsService.disable(req.user.companyId!, id, dto);
  }

  @Patch('access-credentials/:id/lost')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_access_credentials:update')
  @ApiActionOperation(
    'Mark Credential Lost',
    'Record credential status and queue device reconciliation. Inspect the operation for its verified result.',
  )
  markLost(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CredentialStatusActionDto,
  ) {
    return this.credentialsService.markLost(req.user.companyId!, id, dto);
  }

  @Patch('access-credentials/:id/block')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_access_credentials:update')
  @ApiActionOperation('Block Credential', 'Block credential in backend only.')
  block(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CredentialStatusActionDto,
  ) {
    return this.credentialsService.block(req.user.companyId!, id, dto);
  }

  @Patch('access-credentials/:id/revoke')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_access_credentials:update')
  @ApiActionOperation(
    'Revoke Credential',
    'Record credential status and queue device reconciliation. Inspect the operation for its verified result.',
  )
  revoke(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CredentialStatusActionDto,
  ) {
    return this.credentialsService.revoke(req.user.companyId!, id, dto);
  }
}
