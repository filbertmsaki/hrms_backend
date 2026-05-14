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
import { CreatePositionDto } from './dtos/create-position.dto';
import { PositionQueryDto } from './dtos/position-query.dto';
import { UpdatePositionDto } from './dtos/update-position.dto';
import { PositionsService } from './positions.service';
import {
  ApiCreateOperation,
  ApiGetOneOperation,
  ApiListOperation,
  ApiUpdateOperation,
  ApiDeleteOperation,
} from '../../../docs/swagger-decorators';

@ApiTags('Positions')
@ApiBearerAuth()
@Controller('positions')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('positions:create')
  @ApiCreateOperation('Position', 'Create a position in the active company')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() createPositionDto: CreatePositionDto,
  ) {
    return this.positionsService.create(
      req.user.companyId!,
      createPositionDto,
      req.user,
    );
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('positions:read')
  @ApiListOperation('Position', 'List positions in the active company')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: PositionQueryDto,
  ) {
    return this.positionsService.findAll(req.user.companyId!, query, req.user);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('positions:read')
  @ApiGetOneOperation('Position', 'Get a position by ID')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.positionsService.findOne(req.user.companyId!, id, req.user);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('positions:update')
  @ApiUpdateOperation('Position', 'Update a position')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePositionDto: UpdatePositionDto,
  ) {
    return this.positionsService.update(
      req.user.companyId!,
      id,
      updatePositionDto,
      req.user,
    );
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('positions:delete')
  @ApiDeleteOperation('Position', 'Delete a position')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.positionsService.remove(req.user.companyId!, id, req.user);
  }
}