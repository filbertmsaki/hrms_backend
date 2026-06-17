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
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../../common/interfaces/authenticated-user.interface';
import {
  ApiCreateOperation,
  ApiDeleteOperation,
  ApiGetOneOperation,
  ApiListOperation,
  ApiUpdateOperation,
} from '../../../../../docs/swagger-decorators';
import { ShiftBreaksService } from './shift-breaks.service';
import { CreateShiftBreakDto } from './dtos/create-shift-break.dto';
import { UpdateShiftBreakDto } from './dtos/update-shift-break.dto';
import { ShiftBreakQueryDto } from './dtos/shift-break-query.dto';

@ApiTags('Shift Breaks')
@ApiBearerAuth('access-token')
@Controller('shift/shift-breaks')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class ShiftBreaksController {
  constructor(private readonly shiftBreaksService: ShiftBreaksService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('shift_breaks:create')
  @ApiCreateOperation('Shift Break', 'Create shift break')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateShiftBreakDto,
  ) {
    return this.shiftBreaksService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('shift_breaks:read')
  @ApiListOperation('Shift Break', 'List shift breaks')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: ShiftBreakQueryDto,
  ) {
    return this.shiftBreaksService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_breaks:read')
  @ApiGetOneOperation('Shift Break', 'Get shift break by ID')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.shiftBreaksService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_breaks:update')
  @ApiUpdateOperation('Shift Break', 'Update shift break')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateShiftBreakDto,
  ) {
    return this.shiftBreaksService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_breaks:delete')
  @ApiDeleteOperation('Shift Break', 'Delete shift break')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.shiftBreaksService.remove(req.user.companyId!, id);
  }
}
