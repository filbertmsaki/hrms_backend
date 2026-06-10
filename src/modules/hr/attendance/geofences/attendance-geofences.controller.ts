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
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AttendanceGeofencesService } from './attendance-geofences.service';
import { CreateAttendanceGeofenceDto } from './dtos/create-attendance-geofence.dto';
import { UpdateAttendanceGeofenceDto } from './dtos/update-attendance-geofence.dto';
import { AttendanceGeofenceQueryDto } from './dtos/attendance-geofence-query.dto';
import { ValidateGeofenceLocationDto } from './dtos/validate-geofence-location.dto';

@Controller('attendance/geofences')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AttendanceGeofencesController {
  constructor(
    private readonly attendanceGeofencesService: AttendanceGeofencesService,
  ) {}

  @Post()
  create(@Body() dto: CreateAttendanceGeofenceDto, @Req() req: any) {
    return this.attendanceGeofencesService.create(req.user.companyId, dto);
  }

  @Get()
  findAll(@Query() query: AttendanceGeofenceQueryDto, @Req() req: any) {
    return this.attendanceGeofencesService.findAll(req.user.companyId, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.attendanceGeofencesService.findOne(req.user.companyId, id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttendanceGeofenceDto,
    @Req() req: any,
  ) {
    return this.attendanceGeofencesService.update(
      req.user.companyId,
      id,
      dto,
    );
  }

  @Patch(':id/activate')
  activate(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.attendanceGeofencesService.activate(req.user.companyId, id);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.attendanceGeofencesService.deactivate(req.user.companyId, id);
  }

  @Post(':id/validate-location')
  validateLocation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ValidateGeofenceLocationDto,
    @Req() req: any,
  ) {
    return this.attendanceGeofencesService.validateLocation(
      req.user.companyId,
      id,
      dto,
    );
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.attendanceGeofencesService.remove(req.user.companyId, id);
  }
}