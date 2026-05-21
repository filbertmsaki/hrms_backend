import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { ApiCreateOperation, ApiDeleteOperation, ApiGetOneOperation, ApiListOperation, ApiUpdateOperation } from '../../../../docs/swagger-decorators';
import { ShiftTemplatesService } from './shift-templates.service';
import { CreateShiftTemplateDto } from './dtos/create-shift-template.dto';
import { UpdateShiftTemplateDto } from './dtos/update-shift-template.dto';
import { ShiftTemplateQueryDto } from './dtos/shift-template-query.dto';

@ApiTags('Shift Templates')
@ApiBearerAuth('access-token')
@Controller('shift/shift-templates')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class ShiftTemplatesController {
  constructor(private readonly shiftTemplatesService: ShiftTemplatesService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('shift_templates:create')
  @ApiCreateOperation('Shift Template', 'Create shift template')
  create(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Body() dto: CreateShiftTemplateDto) {
    return this.shiftTemplatesService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('shift_templates:read')
  @ApiListOperation('Shift Template', 'List shift templates')
  findAll(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Query() query: ShiftTemplateQueryDto) {
    return this.shiftTemplatesService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_templates:read')
  @ApiGetOneOperation('Shift Template', 'Get shift template by ID')
  findOne(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number) {
    return this.shiftTemplatesService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_templates:update')
  @ApiUpdateOperation('Shift Template', 'Update shift template')
  update(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateShiftTemplateDto) {
    return this.shiftTemplatesService.update(req.user.companyId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('shift_templates:delete')
  @ApiDeleteOperation('Shift Template', 'Delete shift template')
  remove(@Req() req: ExpressRequest & { user: AuthenticatedUser }, @Param('id', ParseIntPipe) id: number) {
    return this.shiftTemplatesService.remove(req.user.companyId!, id);
  }
}
