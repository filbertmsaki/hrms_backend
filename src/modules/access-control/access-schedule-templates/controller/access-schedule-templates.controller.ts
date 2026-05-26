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
  ApiGetOneOperation,
  ApiListOperation,
  ApiUpdateOperation,
} from '../../../../docs/swagger-decorators';
import { CreateAccessScheduleTemplateDto } from '../dto/create-access-schedule-template.dto';
import { SyncAccessScheduleTemplateDto } from '../dto/sync-access-schedule-template.dto';
import { UpdateAccessScheduleTemplateDto } from '../dto/update-access-schedule-template.dto';
import { AccessScheduleTemplateStatusEnum } from '../enum/access-schedule-template-status.enum';
import { AccessScheduleTemplateTypeEnum } from '../enum/access-schedule-template-type.enum';
import { AccessScheduleTemplatesService } from '../service/access-schedule-templates.service';

class AccessScheduleTemplateQueryDto {
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

  @ApiPropertyOptional({ enum: AccessScheduleTemplateStatusEnum })
  @IsEnum(AccessScheduleTemplateStatusEnum)
  @IsOptional()
  status?: AccessScheduleTemplateStatusEnum;

  @ApiPropertyOptional({ enum: AccessScheduleTemplateTypeEnum })
  @IsEnum(AccessScheduleTemplateTypeEnum)
  @IsOptional()
  schedule_type?: AccessScheduleTemplateTypeEnum;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;
}

@ApiTags('Access Control Schedule Templates')
@ApiBearerAuth('access-token')
@Controller('access-control/schedule-templates')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AccessScheduleTemplatesController {
  constructor(private readonly templatesService: AccessScheduleTemplatesService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('access_schedule_templates:create')
  @ApiCreateOperation('Access Schedule Template', 'Create access schedule template')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateAccessScheduleTemplateDto,
  ) {
    return this.templatesService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('access_schedule_templates:read')
  @ApiListOperation('Access Schedule Template', 'List access schedule templates')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: AccessScheduleTemplateQueryDto,
  ) {
    return this.templatesService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('access_schedule_templates:read')
  @ApiGetOneOperation('Access Schedule Template', 'Get access schedule template by ID')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.templatesService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('access_schedule_templates:update')
  @ApiUpdateOperation('Access Schedule Template', 'Update access schedule template')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAccessScheduleTemplateDto,
  ) {
    return this.templatesService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('access_schedule_templates:delete')
  @ApiDeleteOperation('Access Schedule Template', 'Delete access schedule template')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.templatesService.remove(req.user.companyId!, id);
  }

  @Post(':id/sync-to-device')
  @UseGuards(PermissionsGuard)
  @Permissions('access_schedule_templates:update')
  @ApiActionOperation(
    'Sync Schedule Template To Device',
    'Push one schedule template to a Hikvision device',
  )
  syncToDevice(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SyncAccessScheduleTemplateDto,
  ) {
    return this.templatesService.syncTemplateToDevice(req.user.companyId!, id, dto.device_id);
  }

  @Post('sync-from-device/:deviceId')
  @UseGuards(PermissionsGuard)
  @Permissions('access_schedule_templates:update')
  @ApiActionOperation(
    'Sync Schedule Templates From Device',
    'Pull schedule templates from a Hikvision device and upsert locally',
  )
  syncFromDevice(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    return this.templatesService.syncTemplatesFromDevice(req.user.companyId!, deviceId);
  }
}
