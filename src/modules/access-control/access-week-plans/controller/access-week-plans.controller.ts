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
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import type { Request as ExpressRequest } from 'express';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import {
  ApiActionOperation,
  ApiCreateOperation,
  ApiDeleteOperation,
  ApiListOperation,
  ApiUpdateOperation,
} from '../../../../docs/swagger-decorators';
import { CreateAccessWeekPlanDto } from '../dto/create-access-week-plan.dto';
import { SyncAccessWeekPlanDto } from '../dto/sync-access-week-plan.dto';
import { SyncWeekPlansFromDeviceDto } from '../dto/sync-week-plans-from-device.dto';
import { UpdateAccessWeekPlanDto } from '../dto/update-access-week-plan.dto';
import { AccessDayOfWeekEnum } from '../enum/access-day-of-week.enum';
import { AccessWeekPlansService } from '../service/access-week-plans.service';

class AccessWeekPlanQueryDto {
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
  schedule_template_id?: number;

  @ApiPropertyOptional({ enum: AccessDayOfWeekEnum })
  @IsEnum(AccessDayOfWeekEnum)
  @IsOptional()
  day_of_week?: AccessDayOfWeekEnum;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;
}

@ApiTags('Access Control Week Plans')
@ApiBearerAuth('access-token')
@Controller('access-control/week-plans')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AccessWeekPlansController {
  constructor(private readonly weekPlansService: AccessWeekPlansService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('access_week_plans:create')
  @ApiCreateOperation('Access Week Plan', 'Create access week plan')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateAccessWeekPlanDto,
  ) {
    return this.weekPlansService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('access_week_plans:read')
  @ApiListOperation('Access Week Plan', 'List access week plans')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: AccessWeekPlanQueryDto,
  ) {
    return this.weekPlansService.findAll(req.user.companyId!, query);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('access_week_plans:update')
  @ApiUpdateOperation('Access Week Plan', 'Update access week plan')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAccessWeekPlanDto,
  ) {
    return this.weekPlansService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('access_week_plans:delete')
  @ApiDeleteOperation('Access Week Plan', 'Delete access week plan')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.weekPlansService.remove(req.user.companyId!, id);
  }

  @Post(':id/sync-to-device')
  @UseGuards(PermissionsGuard)
  @Permissions('access_week_plans:update')
  @ApiActionOperation('Sync Week Plan To Device', 'Push one week plan to a Hikvision device')
  syncToDevice(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SyncAccessWeekPlanDto,
  ) {
    return this.weekPlansService.syncWeekPlanToDevice(req.user.companyId!, id, dto.device_id);
  }

  @Post('sync-from-device/:deviceId')
  @UseGuards(PermissionsGuard)
  @Permissions('access_week_plans:update')
  @ApiActionOperation(
    'Sync Week Plans From Device',
    'Pull week plans from a Hikvision device and upsert locally',
  )
  syncFromDevice(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Body() dto: SyncWeekPlansFromDeviceDto,
  ) {
    return this.weekPlansService.syncWeekPlansFromDevice(
      req.user.companyId!,
      deviceId,
      dto.schedule_template_id,
    );
  }
}
