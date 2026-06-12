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
import { AttendanceBusinessTripsService } from './attendance-business-trips.service';
import { CreateAttendanceBusinessTripDto } from './dtos/create-attendance-business-trip.dto';
import { UpdateAttendanceBusinessTripDto } from './dtos/update-attendance-business-trip.dto';
import { QueryAttendanceBusinessTripsDto } from './dtos/query-attendance-business-trips.dto';
import { ReviewAttendanceBusinessTripDto } from './dtos/review-attendance-business-trip.dto';
import { CancelAttendanceBusinessTripDto } from './dtos/cancel-attendance-business-trip.dto';

@ApiTags('Attendance Business Trips')
@ApiBearerAuth('access-token')
@Controller('attendance/business-trips')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AttendanceBusinessTripsController {
  constructor(
    private readonly businessTripsService: AttendanceBusinessTripsService,
  ) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_business_trips:create')
  @ApiCreateOperation('Attendance Business Trip', 'Create attendance business trip')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateAttendanceBusinessTripDto,
  ) {
    return this.businessTripsService.create(req.user.companyId!, dto, req.user);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_business_trips:read')
  @ApiListOperation('Attendance Business Trips', 'List attendance business trips')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: QueryAttendanceBusinessTripsDto,
  ) {
    return this.businessTripsService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_business_trips:read')
  @ApiGetOneOperation('Attendance Business Trip', 'Get attendance business trip by ID')
  async findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.businessTripsService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_business_trips:update')
  @ApiUpdateOperation('Attendance Business Trip', 'Update attendance business trip')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttendanceBusinessTripDto,
  ) {
    return this.businessTripsService.update(req.user.companyId!, id, dto, req.user);
  }

  @Post(':id/submit')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_business_trips:update')
  @ApiActionOperation('Submit Attendance Business Trip', 'Submit a draft attendance business trip')
  submit(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.businessTripsService.submit(req.user.companyId!, id, req.user);
  }

  @Post(':id/approve')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_business_trips:approve')
  @ApiActionOperation('Approve Attendance Business Trip', 'Approve attendance business trip')
  approve(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewAttendanceBusinessTripDto,
  ) {
    return this.businessTripsService.approve(req.user.companyId!, id, dto, req.user);
  }

  @Post(':id/reject')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_business_trips:approve')
  @ApiActionOperation('Reject Attendance Business Trip', 'Reject attendance business trip')
  reject(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewAttendanceBusinessTripDto,
  ) {
    return this.businessTripsService.reject(req.user.companyId!, id, dto, req.user);
  }

  @Post(':id/cancel')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_business_trips:cancel')
  @ApiActionOperation('Cancel Attendance Business Trip', 'Cancel attendance business trip')
  cancel(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelAttendanceBusinessTripDto,
  ) {
    return this.businessTripsService.cancel(req.user.companyId!, id, dto, req.user);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_business_trips:delete')
  @ApiDeleteOperation('Attendance Business Trip', 'Delete attendance business trip')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.businessTripsService.remove(req.user.companyId!, id, req.user);
  }
}
