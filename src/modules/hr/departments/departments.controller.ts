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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { CreateDepartmentDto } from './dtos/create-department.dto';
import { DepartmentQueryDto } from './dtos/department-query.dto';
import { UpdateDepartmentDto } from './dtos/update-department.dto';
import { DepartmentsService } from './departments.service';

@ApiTags('Departments')
@ApiBearerAuth()
@Controller('departments')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('departments:create')
  @ApiOperation({ summary: 'Create a department in the active company' })
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() createDepartmentDto: CreateDepartmentDto,
  ) {
    return this.departmentsService.create(
      req.user.companyId!,
      createDepartmentDto,
      req.user,
    );
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('departments:read')
  @ApiOperation({ summary: 'List departments in the active company' })
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: DepartmentQueryDto,
  ) {
    return this.departmentsService.findAll(req.user.companyId!, query, req.user);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('departments:read')
  @ApiOperation({ summary: 'Get a department by ID' })
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.departmentsService.findOne(req.user.companyId!, id, req.user);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('departments:update')
  @ApiOperation({ summary: 'Update a department' })
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDepartmentDto: UpdateDepartmentDto,
  ) {
    return this.departmentsService.update(
      req.user.companyId!,
      id,
      updateDepartmentDto,
      req.user,
    );
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('departments:delete')
  @ApiOperation({ summary: 'Delete a department' })
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.departmentsService.remove(req.user.companyId!, id, req.user);
  }
}
