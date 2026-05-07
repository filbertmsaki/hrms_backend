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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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

@ApiTags('Branches')
@ApiBearerAuth()
@Controller('branches')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('branches:create')
  @ApiOperation({ summary: 'Create a branch in the active company' })
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() createBranchDto: CreateBranchDto,
  ) {
    return this.branchesService.create(req.user.companyId!, createBranchDto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('branches:read')
  @ApiOperation({ summary: 'List branches available in the active company' })
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: BranchQueryDto,
  ) {
    return this.branchesService.findAll(req.user.companyId!, query, req.user);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('branches:read')
  @ApiOperation({ summary: 'Get a branch by ID' })
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.branchesService.findOne(req.user.companyId!, id, req.user);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('branches:update')
  @ApiOperation({ summary: 'Update a branch' })
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

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('branches:delete')
  @ApiOperation({ summary: 'Delete a branch' })
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.branchesService.remove(req.user.companyId!, id, req.user);
  }

  @Get(':id/access')
  @UseGuards(PermissionsGuard)
  @Permissions('branches:manage-access')
  @ApiOperation({ summary: 'List branch access assignments for a branch' })
  listAccessAssignments(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.branchesService.listAccessAssignments(req.user.companyId!, id);
  }

  @Post(':branchId/access/:userId')
  @UseGuards(PermissionsGuard)
  @Permissions('branches:manage-access')
  @ApiOperation({ summary: 'Grant a company user access to a branch' })
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

  @Delete(':branchId/access/:userId')
  @UseGuards(PermissionsGuard)
  @Permissions('branches:manage-access')
  @ApiOperation({ summary: 'Revoke a company user branch access assignment' })
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
