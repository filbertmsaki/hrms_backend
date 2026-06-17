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
import { TimetableDaysService } from './timetable-days.service';
import { CreateTimetableDayDto } from './dtos/create-timetable-day.dto';
import { UpdateTimetableDayDto } from './dtos/update-timetable-day.dto';
import { TimetableDayQueryDto } from './dtos/timetable-day-query.dto';

@ApiTags('Timetable Days')
@ApiBearerAuth('access-token')
@Controller('timetable/timetable-days')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class TimetableDaysController {
  constructor(private readonly timetableDaysService: TimetableDaysService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_days:create')
  @ApiCreateOperation('Timetable Day', 'Create timetable day')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateTimetableDayDto,
  ) {
    return this.timetableDaysService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_days:read')
  @ApiListOperation('Timetable Day', 'List timetable days')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: TimetableDayQueryDto,
  ) {
    return this.timetableDaysService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_days:read')
  @ApiGetOneOperation('Timetable Day', 'Get timetable day by ID')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.timetableDaysService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_days:update')
  @ApiUpdateOperation('Timetable Day', 'Update timetable day')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTimetableDayDto,
  ) {
    return this.timetableDaysService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetable_days:delete')
  @ApiDeleteOperation('Timetable Day', 'Delete timetable day')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.timetableDaysService.remove(req.user.companyId!, id);
  }
}
