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
import { CreateDesignationDto } from './dtos/create-designation.dto';
import { DesignationQueryDto } from './dtos/designation-query.dto';
import { UpdateDesignationDto } from './dtos/update-designation.dto';
import { DesignationsService } from './designations.service';
import {
  ApiCreateOperation,
  ApiGetOneOperation,
  ApiListOperation,
  ApiUpdateOperation,
  ApiDeleteOperation,
} from '../../../docs/swagger-decorators';

@ApiTags('Designations')
@ApiBearerAuth('access-token')
@Controller('designations')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class DesignationsController {
  constructor(private readonly designationsService: DesignationsService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('designations:create')
  @ApiCreateOperation(
    'Designation',
    'Create a designation in the active company',
  )
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() createDesignationDto: CreateDesignationDto,
  ) {
    return this.designationsService.create(
      req.user.companyId!,
      createDesignationDto,
      req.user,
    );
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('designations:read')
  @ApiListOperation('Designation', 'List designations in the active company')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: DesignationQueryDto,
  ) {
    return this.designationsService.findAll(
      req.user.companyId!,
      query,
      req.user,
    );
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('designations:read')
  @ApiGetOneOperation('Designation', 'Get a designation by ID')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.designationsService.findOne(req.user.companyId!, id, req.user);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('designations:update')
  @ApiUpdateOperation('Designation', 'Update a designation')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDesignationDto: UpdateDesignationDto,
  ) {
    return this.designationsService.update(
      req.user.companyId!,
      id,
      updateDesignationDto,
      req.user,
    );
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('designations:delete')
  @ApiDeleteOperation('Designation', 'Delete a designation')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.designationsService.remove(req.user.companyId!, id, req.user);
  }
}
