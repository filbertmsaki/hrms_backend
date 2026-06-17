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
import { TimetablesService } from './timetables.service';
import { CreateTimetableDto } from './dtos/create-timetable.dto';
import { UpdateTimetableDto } from './dtos/update-timetable.dto';
import { TimetableQueryDto } from './dtos/timetable-query.dto';

@ApiTags('Timetables')
@ApiBearerAuth('access-token')
@Controller('timetable/timetables')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class TimetablesController {
  constructor(private readonly timetablesService: TimetablesService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('timetables:create')
  @ApiCreateOperation('Timetable', 'Create timetable')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateTimetableDto,
  ) {
    return this.timetablesService.create(
      req.user.companyId!,
      req.user.companyMembershipId ?? null,
      dto,
    );
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('timetables:read')
  @ApiListOperation('Timetable', 'List timetables')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: TimetableQueryDto,
  ) {
    return this.timetablesService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetables:read')
  @ApiGetOneOperation('Timetable', 'Get timetable by ID')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.timetablesService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetables:update')
  @ApiUpdateOperation('Timetable', 'Update timetable')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTimetableDto,
  ) {
    return this.timetablesService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('timetables:delete')
  @ApiDeleteOperation('Timetable', 'Delete timetable')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.timetablesService.remove(req.user.companyId!, id);
  }
}
