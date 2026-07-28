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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { CreateDefaultAvatarDto } from './dtos/create-default-avatar.dto';
import { DefaultAvatarQueryDto } from './dtos/default-avatar-query.dto';
import { UpdateDefaultAvatarDto } from './dtos/update-default-avatar.dto';
import { DefaultAvatarsService } from './default-avatars.service';

@ApiTags('Default Avatars')
@ApiBearerAuth('access-token')
@Controller('default-avatars')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class DefaultAvatarsController {
  constructor(
    private readonly defaultAvatarsService: DefaultAvatarsService,
  ) {}

  @Get()
  @Permissions('default_avatars:read')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: DefaultAvatarQueryDto,
  ) {
    return this.defaultAvatarsService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @Permissions('default_avatars:read')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.defaultAvatarsService.findOne(req.user.companyId!, id);
  }

  @Post()
  @Permissions('default_avatars:create')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateDefaultAvatarDto,
  ) {
    return this.defaultAvatarsService.create(req.user.companyId!, dto);
  }

  @Patch(':id')
  @Permissions('default_avatars:update')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDefaultAvatarDto,
  ) {
    return this.defaultAvatarsService.update(req.user.companyId!, id, dto);
  }

  @Post(':id/set-default')
  @Permissions('default_avatars:update')
  setDefault(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.defaultAvatarsService.setDefault(req.user.companyId!, id);
  }

  @Delete(':id')
  @Permissions('default_avatars:delete')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.defaultAvatarsService.delete(req.user.companyId!, id);
  }
}
