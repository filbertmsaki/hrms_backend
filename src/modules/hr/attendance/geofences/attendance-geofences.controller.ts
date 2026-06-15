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
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import {
  ApiActionOperation,
  ApiCreateOperation,
  ApiDeleteOperation,
  ApiGetOneOperation,
  ApiListOperation,
  ApiUpdateOperation,
} from '../../../../docs/swagger-decorators';
import { AttendanceGeofencesService } from './attendance-geofences.service';
import { CreateAttendanceGeofenceDto } from './dtos/create-attendance-geofence.dto';
import { UpdateAttendanceGeofenceDto } from './dtos/update-attendance-geofence.dto';
import { AttendanceGeofenceQueryDto } from './dtos/attendance-geofence-query.dto';
import { ValidateGeofenceLocationDto } from './dtos/validate-geofence-location.dto';

@ApiTags('Attendance Geofences')
@ApiBearerAuth('access-token')
@Controller('attendance/geofences')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AttendanceGeofencesController {
  constructor(
    private readonly attendanceGeofencesService: AttendanceGeofencesService,
  ) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_geofences:create')
  @ApiCreateOperation('Attendance Geofence', 'Create attendance geofence')
  create(
    @Body() dto: CreateAttendanceGeofenceDto,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.attendanceGeofencesService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_geofences:read')
  @ApiListOperation('Attendance Geofence', 'List attendance geofences')
  findAll(
    @Query() query: AttendanceGeofenceQueryDto,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.attendanceGeofencesService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_geofences:read')
  @ApiGetOneOperation('Attendance Geofence', 'Get attendance geofence by ID')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.attendanceGeofencesService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_geofences:update')
  @ApiUpdateOperation('Attendance Geofence', 'Update attendance geofence')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttendanceGeofenceDto,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.attendanceGeofencesService.update(req.user.companyId!, id, dto);
  }

  @Patch(':id/activate')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_geofences:update')
  @ApiActionOperation(
    'Activate attendance geofence',
    'Marks an attendance geofence as active.',
  )
  activate(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.attendanceGeofencesService.activate(req.user.companyId!, id);
  }

  @Patch(':id/deactivate')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_geofences:update')
  @ApiActionOperation(
    'Deactivate attendance geofence',
    'Marks an attendance geofence as inactive.',
  )
  deactivate(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.attendanceGeofencesService.deactivate(req.user.companyId!, id);
  }

  @Post(':id/validate-location')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_geofences:read')
  @ApiActionOperation(
    'Validate attendance geofence location',
    'Checks whether a location falls within the selected attendance geofence.',
  )
  validateLocation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ValidateGeofenceLocationDto,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.attendanceGeofencesService.validateLocation(
      req.user.companyId!,
      id,
      dto,
    );
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_geofences:delete')
  @ApiDeleteOperation('Attendance Geofence', 'Delete attendance geofence')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.attendanceGeofencesService.remove(req.user.companyId!, id);
  }
}
