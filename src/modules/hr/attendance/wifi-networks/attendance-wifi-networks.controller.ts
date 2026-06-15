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
import { AttendanceWifiNetworksService } from './attendance-wifi-networks.service';
import { CreateAttendanceWifiNetworkDto } from './dtos/create-attendance-wifi-network.dto';
import { UpdateAttendanceWifiNetworkDto } from './dtos/update-attendance-wifi-network.dto';
import { AttendanceWifiNetworkQueryDto } from './dtos/attendance-wifi-network-query.dto';
import { ValidateAttendanceWifiNetworkDto } from './dtos/validate-attendance-wifi-network.dto';

@ApiTags('Attendance WiFi Networks')
@ApiBearerAuth('access-token')
@Controller('attendance/wifi-networks')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AttendanceWifiNetworksController {
  constructor(
    private readonly attendanceWifiNetworksService: AttendanceWifiNetworksService,
  ) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_wifi_networks:create')
  @ApiCreateOperation(
    'Attendance WiFi Network',
    'Create attendance WiFi network',
  )
  create(
    @Body() dto: CreateAttendanceWifiNetworkDto,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.attendanceWifiNetworksService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_wifi_networks:read')
  @ApiListOperation('Attendance WiFi Network', 'List attendance WiFi networks')
  findAll(
    @Query() query: AttendanceWifiNetworkQueryDto,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.attendanceWifiNetworksService.findAll(
      req.user.companyId!,
      query,
    );
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_wifi_networks:read')
  @ApiGetOneOperation(
    'Attendance WiFi Network',
    'Get attendance WiFi network by ID',
  )
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.attendanceWifiNetworksService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_wifi_networks:update')
  @ApiUpdateOperation(
    'Attendance WiFi Network',
    'Update attendance WiFi network',
  )
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttendanceWifiNetworkDto,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.attendanceWifiNetworksService.update(
      req.user.companyId!,
      id,
      dto,
    );
  }

  @Patch(':id/activate')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_wifi_networks:update')
  @ApiActionOperation(
    'Activate attendance WiFi network',
    'Marks an attendance WiFi network as active.',
  )
  activate(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.attendanceWifiNetworksService.activate(req.user.companyId!, id);
  }

  @Patch(':id/deactivate')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_wifi_networks:update')
  @ApiActionOperation(
    'Deactivate attendance WiFi network',
    'Marks an attendance WiFi network as inactive.',
  )
  deactivate(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.attendanceWifiNetworksService.deactivate(
      req.user.companyId!,
      id,
    );
  }

  @Post(':id/validate')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_wifi_networks:read')
  @ApiActionOperation(
    'Validate attendance WiFi network',
    'Checks whether the supplied WiFi details match the configured attendance WiFi network.',
  )
  validateNetwork(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ValidateAttendanceWifiNetworkDto,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.attendanceWifiNetworksService.validateNetwork(
      req.user.companyId!,
      id,
      dto,
      req.ip,
    );
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_wifi_networks:delete')
  @ApiDeleteOperation(
    'Attendance WiFi Network',
    'Delete attendance WiFi network',
  )
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.attendanceWifiNetworksService.remove(req.user.companyId!, id);
  }
}
