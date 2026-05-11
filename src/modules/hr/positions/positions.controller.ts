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
import { CreatePositionDto } from './dtos/create-position.dto';
import { PositionQueryDto } from './dtos/position-query.dto';
import { UpdatePositionDto } from './dtos/update-position.dto';
import { PositionsService } from './positions.service';

@ApiTags('Positions')
@ApiBearerAuth()
@Controller('positions')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('positions:create')
  @ApiOperation({ summary: 'Create a position in the active company' })
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() createPositionDto: CreatePositionDto,
  ) {
    return this.positionsService.create(req.user.companyId!, createPositionDto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('positions:read')
  @ApiOperation({ summary: 'List positions in the active company' })
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: PositionQueryDto,
  ) {
    return this.positionsService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('positions:read')
  @ApiOperation({ summary: 'Get a position by ID' })
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.positionsService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('positions:update')
  @ApiOperation({ summary: 'Update a position' })
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePositionDto: UpdatePositionDto,
  ) {
    return this.positionsService.update(
      req.user.companyId!,
      id,
      updatePositionDto,
    );
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('positions:delete')
  @ApiOperation({ summary: 'Delete a position' })
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.positionsService.remove(req.user.companyId!, id);
  }
}
