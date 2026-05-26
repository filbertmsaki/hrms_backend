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
import { CreateAccessOrganizationDto } from '../dto/create-access-organization.dto';
import { SyncAccessOrganizationDto } from '../dto/sync-access-organization.dto';
import { UpdateAccessOrganizationDto } from '../dto/update-access-organization.dto';
import { AccessOrganizationSyncStatusEnum } from '../enum/access-organization-sync-status.enum';
import { AccessOrganizationsService } from '../service/access-organizations.service';

class AccessOrganizationQueryDto {
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
  branch_id?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  department_id?: number;

  @ApiPropertyOptional({ enum: AccessOrganizationSyncStatusEnum })
  @IsEnum(AccessOrganizationSyncStatusEnum)
  @IsOptional()
  sync_status?: AccessOrganizationSyncStatusEnum;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;
}

@ApiTags('Access Control Organizations')
@ApiBearerAuth('access-token')
@Controller('access-control/organizations')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AccessOrganizationsController {
  constructor(private readonly accessOrganizationsService: AccessOrganizationsService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('access_organizations:create')
  @ApiCreateOperation('Access Organization', 'Create access organization')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateAccessOrganizationDto,
  ) {
    return this.accessOrganizationsService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('access_organizations:read')
  @ApiListOperation('Access Organization', 'List access organizations')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: AccessOrganizationQueryDto,
  ) {
    return this.accessOrganizationsService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('access_organizations:read')
  @ApiGetOneOperation('Access Organization', 'Get access organization by ID')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.accessOrganizationsService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('access_organizations:update')
  @ApiUpdateOperation('Access Organization', 'Update access organization')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAccessOrganizationDto,
  ) {
    return this.accessOrganizationsService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('access_organizations:delete')
  @ApiDeleteOperation('Access Organization', 'Delete access organization')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.accessOrganizationsService.remove(req.user.companyId!, id);
  }

  @Post(':id/sync-to-device')
  @UseGuards(PermissionsGuard)
  @Permissions('access_organizations:update')
  @ApiActionOperation('Sync Organization To Device', 'Push one organization to one or many Hikvision devices')
  syncToDevice(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SyncAccessOrganizationDto,
  ) {
    return this.accessOrganizationsService.syncToDevice(req.user.companyId!, id, dto);
  }

  @Post('sync-from-device/:deviceId')
  @UseGuards(PermissionsGuard)
  @Permissions('access_organizations:update')
  @ApiActionOperation('Sync Organizations From Device', 'Pull organizations from Hikvision GroupCfg and upsert locally')
  syncFromDevice(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
  ) {
    return this.accessOrganizationsService.syncFromDevice(req.user.companyId!, deviceId);
  }
}
