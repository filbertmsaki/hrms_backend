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
import { ShiftAssignmentsService } from './shift-assignments.service';
import { CreateShiftAssignmentDto } from './dtos/create-shift-assignment.dto';
import { UpdateShiftAssignmentDto } from './dtos/update-shift-assignment.dto';
import { ShiftAssignmentQueryDto } from './dtos/shift-assignment-query.dto';

@ApiTags('Shift Assignments')
@ApiBearerAuth('access-token')
@Controller('shift/shift-assignments')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class ShiftAssignmentsController {
  constructor(
    private readonly shiftAssignmentsService: ShiftAssignmentsService,
  ) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('shift_assignments:create')
  @ApiCreateOperation('Shift Assignment', 'Create shift assignment')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateShiftAssignmentDto,
  ) {
    return this.shiftAssignmentsService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('shift_assignments:read')
  @ApiListOperation('Shift Assignment', 'List shift assignments')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: ShiftAssignmentQueryDto,
  ) {
    return this.shiftAssignmentsService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_assignments:read')
  @ApiGetOneOperation('Shift Assignment', 'Get shift assignment by ID')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.shiftAssignmentsService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_assignments:update')
  @ApiUpdateOperation('Shift Assignment', 'Update shift assignment')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateShiftAssignmentDto,
  ) {
    return this.shiftAssignmentsService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_assignments:delete')
  @ApiDeleteOperation('Shift Assignment', 'Delete shift assignment')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.shiftAssignmentsService.remove(req.user.companyId!, id);
  }
}
