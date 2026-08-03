import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { CreateCostCenterDto } from './dtos/create-cost-center.dto';
import { UpdateCostCenterDto } from './dtos/update-cost-center.dto';
import { CostCentersService } from './cost-centers.service';

@Controller('cost-centers')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class CostCentersController {
  constructor(private readonly costCentersService: CostCentersService) {}

  @Get()
  @Permissions('cost_centers:read')
  findAll(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.costCentersService.findAll(req.user.companyId!);
  }

  @Post()
  @Permissions('cost_centers:create')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateCostCenterDto,
  ) {
    return this.costCentersService.create(req.user.companyId!, dto);
  }

  @Get(':id')
  @Permissions('cost_centers:read')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.costCentersService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @Permissions('cost_centers:update')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCostCenterDto,
  ) {
    return this.costCentersService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @Permissions('cost_centers:delete')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.costCentersService.remove(req.user.companyId!, id);
  }
}
