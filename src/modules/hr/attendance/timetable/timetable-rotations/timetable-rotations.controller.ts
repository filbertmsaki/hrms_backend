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
import { TimetableRotationsService } from './timetable-rotations.service';
import { CreateTimetableRotationDto } from './dtos/create-timetable-rotation.dto';
import { UpdateTimetableRotationDto } from './dtos/update-timetable-rotation.dto';
import { TimetableRotationQueryDto } from './dtos/timetable-rotation-query.dto';

@ApiTags('Timetable Rotations')
@ApiBearerAuth('access-token')
@Controller('attendance/schedule-definitions/timetable-rotations')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class TimetableRotationsController {
  constructor(
    private readonly timetableRotationsService: TimetableRotationsService,
  ) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_rotations:create')
  @ApiCreateOperation('Timetable Rotation', 'Create timetable rotation')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateTimetableRotationDto,
  ) {
    return this.timetableRotationsService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_rotations:read')
  @ApiListOperation('Timetable Rotation', 'List timetable rotations')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: TimetableRotationQueryDto,
  ) {
    return this.timetableRotationsService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_rotations:read')
  @ApiGetOneOperation('Timetable Rotation', 'Get timetable rotation by ID')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.timetableRotationsService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_rotations:update')
  @ApiUpdateOperation('Timetable Rotation', 'Update timetable rotation')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTimetableRotationDto,
  ) {
    return this.timetableRotationsService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_rotations:delete')
  @ApiDeleteOperation('Timetable Rotation', 'Delete timetable rotation')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.timetableRotationsService.remove(req.user.companyId!, id);
  }
}
