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
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { BranchQueryDto } from './dtos/branch-query.dto';
import { CreateBranchDto } from './dtos/create-branch.dto';
import { UpdateBranchDto } from './dtos/update-branch.dto';
import { BranchesService } from './branches.service';
import {
  ApiCreateOperation,
  ApiGetOneOperation,
  ApiListOperation,
  ApiUpdateOperation,
  ApiDeleteOperation,
  ApiOperationSummary,
  ApiAuthRequired,
  ApiSuccessResponse,
} from '../../../docs/swagger-decorators';

@ApiTags('Branches')
@ApiBearerAuth()
@Controller('branches')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  // ────────────────────────────────
  //  Create
  // ────────────────────────────────

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('branches:create')
  @ApiCreateOperation('Branch', 'Create a new branch in the active company')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() createBranchDto: CreateBranchDto,
  ) {
    return this.branchesService.create(req.user.companyId!, createBranchDto);
  }

  // ────────────────────────────────
  //  List All
  // ────────────────────────────────

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('branches:read')
  @ApiListOperation('Branch', 'List branches in the active company')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: BranchQueryDto,
  ) {
    return this.branchesService.findAll(req.user.companyId!, query, req.user);
  }

  // ────────────────────────────────
  //  Get One
  // ────────────────────────────────

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('branches:read')
  @ApiGetOneOperation('Branch', 'Get a branch by ID')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.branchesService.findOne(req.user.companyId!, id, req.user);
  }

  // ────────────────────────────────
  //  Update
  // ────────────────────────────────

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('branches:update')
  @ApiUpdateOperation('Branch', 'Update a branch')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() updateBranchDto: UpdateBranchDto,
  ) {
    return this.branchesService.update(
      req.user.companyId!,
      id,
      updateBranchDto,
      req.user,
    );
  }

  // ────────────────────────────────
  //  Delete
  // ────────────────────────────────

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('branches:delete')
  @ApiDeleteOperation('Branch', 'Delete a branch')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.branchesService.remove(req.user.companyId!, id, req.user);
  }

  // ────────────────────────────────
  //  Extra: List Branch Access
  // ────────────────────────────────

  @Get(':id/access')
  @UseGuards(PermissionsGuard)
  @Permissions('branches:manage-access')
  @ApiOperationSummary(
    'List branch access assignments',
    'Returns all company users who have been granted access to this branch.',
  )
  @ApiAuthRequired()
  @ApiSuccessResponse(200, 'Branch access list retrieved')
  listAccessAssignments(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.branchesService.listAccessAssignments(req.user.companyId!, id);
  }

  // ────────────────────────────────
  //  Extra: Grant Access
  // ────────────────────────────────

  @Post(':branchId/access/:userId')
  @UseGuards(PermissionsGuard)
  @Permissions('branches:manage-access')
  @ApiOperationSummary(
    'Grant a company user access to a branch',
    'Assigns branch access to a specific company user.',
  )
  @ApiAuthRequired()
  @ApiSuccessResponse(200, 'Branch access granted')
  grantAccess(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('branchId', ParseIntPipe) branchId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.branchesService.grantAccess(
      req.user.companyId!,
      branchId,
      userId,
    );
  }

  // ────────────────────────────────
  //  Extra: Revoke Access
  // ────────────────────────────────

  @Delete(':branchId/access/:userId')
  @UseGuards(PermissionsGuard)
  @Permissions('branches:manage-access')
  @ApiOperationSummary(
    'Revoke a company user branch access assignment',
    'Removes branch access previously granted to a company user.',
  )
  @ApiAuthRequired()
  @ApiSuccessResponse(200, 'Branch access revoked')
  revokeAccess(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('branchId', ParseIntPipe) branchId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.branchesService.revokeAccess(
      req.user.companyId!,
      branchId,
      userId,
    );
  }
}