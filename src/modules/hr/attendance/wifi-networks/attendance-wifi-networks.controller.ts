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
import { AttendanceWifiNetworksService } from './attendance-wifi-networks.service';
import { CreateAttendanceWifiNetworkDto } from './dtos/create-attendance-wifi-network.dto';
import { UpdateAttendanceWifiNetworkDto } from './dtos/update-attendance-wifi-network.dto';
import { AttendanceWifiNetworkQueryDto } from './dtos/attendance-wifi-network-query.dto';
import { ValidateAttendanceWifiNetworkDto } from './dtos/validate-attendance-wifi-network.dto';

@Controller('attendance/wifi-networks')
@UseGuards(AuthGuard('jwt'))
export class AttendanceWifiNetworksController {
  constructor(
    private readonly attendanceWifiNetworksService: AttendanceWifiNetworksService,
  ) {}

  @Post()
  create(@Body() dto: CreateAttendanceWifiNetworkDto, @Req() req: any) {
    return this.attendanceWifiNetworksService.create(
      req.user.companyId,
      dto,
    );
  }

  @Get()
  findAll(@Query() query: AttendanceWifiNetworkQueryDto, @Req() req: any) {
    return this.attendanceWifiNetworksService.findAll(
      req.user.companyId,
      query,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.attendanceWifiNetworksService.findOne(
      req.user.companyId,
      id,
    );
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttendanceWifiNetworkDto,
    @Req() req: any,
  ) {
    return this.attendanceWifiNetworksService.update(
      req.user.companyId,
      id,
      dto,
    );
  }

  @Patch(':id/activate')
  activate(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.attendanceWifiNetworksService.activate(
      req.user.companyId,
      id,
    );
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.attendanceWifiNetworksService.deactivate(
      req.user.companyId,
      id,
    );
  }

  @Post(':id/validate')
  validateNetwork(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ValidateAttendanceWifiNetworkDto,
    @Req() req: any,
  ) {
    return this.attendanceWifiNetworksService.validateNetwork(
      req.user.companyId,
      id,
      dto,
      req.ip,
    );
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.attendanceWifiNetworksService.remove(
      req.user.companyId,
      id,
    );
  }
}