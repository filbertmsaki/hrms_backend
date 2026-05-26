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
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import type { Request as ExpressRequest } from 'express';
import { SortDirection } from '../../../../../../common/dto/pagination.dto';
import { Permissions } from '../../../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../../../common/interfaces/authenticated-user.interface';
import {
  ApiActionOperation,
  ApiCreateOperation,
  ApiDeleteOperation,
  ApiGetOneOperation,
  ApiListOperation,
  ApiUpdateOperation,
} from '../../../../../../docs/swagger-decorators';
import { AccessDoorSyncStatusEnum } from '../enum/access-door-sync-status.enum';
import { AccessDoorsService } from '../service/access-doors.service';
import { CreateAccessDoorDto } from '../dto/create-access-door.dto';
import { UpdateAccessDoorDto } from '../dto/update-access-door.dto';

class AccessDoorQueryDto {
  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  sortBy?: string;

  @ApiPropertyOptional({ enum: SortDirection })
  @IsEnum(SortDirection)
  @IsOptional()
  sortOrder?: SortDirection;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  device_id?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branch_id?: number;

  @ApiPropertyOptional({ enum: AccessDoorSyncStatusEnum })
  @IsEnum(AccessDoorSyncStatusEnum)
  @IsOptional()
  sync_status?: AccessDoorSyncStatusEnum;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;
}

@ApiTags('Access Control Doors')
@ApiBearerAuth('access-token')
@Controller('access-control/doors')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AccessDoorsController {
  constructor(private readonly accessDoorsService: AccessDoorsService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('access_doors:create')
  @ApiCreateOperation('Access Door', 'Create access door')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateAccessDoorDto,
  ) {
    return this.accessDoorsService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('access_doors:read')
  @ApiListOperation('Access Door', 'List access doors')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: AccessDoorQueryDto,
  ) {
    return this.accessDoorsService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('access_doors:read')
  @ApiGetOneOperation('Access Door', 'Get access door by ID')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.accessDoorsService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('access_doors:update')
  @ApiUpdateOperation('Access Door', 'Update access door')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAccessDoorDto,
  ) {
    return this.accessDoorsService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('access_doors:delete')
  @ApiDeleteOperation('Access Door', 'Delete access door')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.accessDoorsService.remove(req.user.companyId!, id);
  }

  @Post('sync-from-device/:deviceId')
  @UseGuards(PermissionsGuard)
  @Permissions('access_doors:update')
  @ApiActionOperation(
    'Sync Doors From Device',
    'Pull door parameters from Hikvision device and upsert local doors',
  )
  syncFromDevice(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    return this.accessDoorsService.syncFromDevice(req.user.companyId!, deviceId);
  }

  @Post(':id/sync-to-device')
  @UseGuards(PermissionsGuard)
  @Permissions('access_doors:update')
  @ApiActionOperation(
    'Sync Door To Device',
    'Push local door configuration to Hikvision device',
  )
  syncToDevice(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.accessDoorsService.syncToDevice(req.user.companyId!, id);
  }

  @Get(':id/device-config')
  @UseGuards(PermissionsGuard)
  @Permissions('access_doors:read')
  @ApiActionOperation(
    'Get Door Configuration',
    'Read current door configuration directly from Hikvision device',
  )
  getDoorConfiguration(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.accessDoorsService.getDoorConfiguration(req.user.companyId!, id);
  }

  @Post(':id/open')
  @UseGuards(PermissionsGuard)
  @Permissions('access_doors:update')
  @ApiActionOperation('Open Door', 'Send remote open command to device door')
  openDoor(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.accessDoorsService.openDoor(req.user.companyId!, id);
  }

  @Post(':id/close')
  @UseGuards(PermissionsGuard)
  @Permissions('access_doors:update')
  @ApiActionOperation('Close Door', 'Send remote close command to device door')
  closeDoor(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.accessDoorsService.closeDoor(req.user.companyId!, id);
  }

  @Post(':id/always-open')
  @UseGuards(PermissionsGuard)
  @Permissions('access_doors:update')
  @ApiActionOperation('Always Open Door', 'Set door remote command mode to alwaysOpen')
  alwaysOpenDoor(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.accessDoorsService.alwaysOpenDoor(req.user.companyId!, id);
  }

  @Post(':id/always-close')
  @UseGuards(PermissionsGuard)
  @Permissions('access_doors:update')
  @ApiActionOperation('Always Close Door', 'Set door remote command mode to alwaysClose')
  alwaysCloseDoor(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.accessDoorsService.alwaysCloseDoor(req.user.companyId!, id);
  }
}
