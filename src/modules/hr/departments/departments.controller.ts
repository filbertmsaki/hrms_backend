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
import { CurrentAuditContext } from '../../../common/decorators/audit-request-context.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import type { AuditRequestContext } from '../../../common/interfaces/audit-request-context.interface';
import { AssignDepartmentPositionDto } from './dtos/assign-department-position.dto';
import { CreateDepartmentDto } from './dtos/create-department.dto';
import { DepartmentQueryDto } from './dtos/department-query.dto';
import { UpdateDepartmentDto } from './dtos/update-department.dto';
import { DepartmentsService } from './departments.service';
import {
  ApiCreateOperation,
  ApiGetOneOperation,
  ApiListOperation,
  ApiUpdateOperation,
  ApiDeleteOperation,
} from '../../../docs/swagger-decorators';

@ApiTags('Departments')
@ApiBearerAuth('access-token')
@Controller('departments')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('departments:create')
  @ApiCreateOperation('Department', 'Create a department in the active company')
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
  @ApiListOperation('Department', 'List departments in the active company')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: DepartmentQueryDto,
  ) {
    return this.departmentsService.findAll(
      req.user.companyId!,
      query,
      req.user,
    );
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('departments:read')
  @ApiGetOneOperation('Department', 'Get a department by ID')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.departmentsService.findOne(req.user.companyId!, id, req.user);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('departments:update')
  @ApiUpdateOperation('Department', 'Update a department')
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
  @ApiDeleteOperation('Department', 'Delete a department')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.departmentsService.remove(req.user.companyId!, id, req.user);
  }

  @Get(':id/positions')
  @UseGuards(PermissionsGuard)
  @Permissions('positions:read')
  @ApiListOperation('Position', 'List positions assigned to a department')
  listPositions(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.departmentsService.listPositions(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Post(':id/positions')
  @UseGuards(PermissionsGuard)
  @Permissions('positions:assign-department')
  @ApiCreateOperation('Position', 'Assign an existing position to a department')
  assignPosition(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() assignDepartmentPositionDto: AssignDepartmentPositionDto,
  ) {
    return this.departmentsService.assignPosition(
      req.user.companyId!,
      id,
      assignDepartmentPositionDto.position_id,
      req.user,
    );
  }

  @Delete(':id/positions/:positionId')
  @UseGuards(PermissionsGuard)
  @Permissions('positions:assign-department')
  @ApiDeleteOperation('Position', 'Remove a position from a department')
  removePosition(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Param('positionId', ParseIntPipe) positionId: number,
  ) {
    return this.departmentsService.removePosition(
      req.user.companyId!,
      id,
      positionId,
      req.user,
    );
  }

  @Get(':id/access')
  @UseGuards(PermissionsGuard)
  @Permissions('departments:manage-access')
  listAccessAssignments(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.departmentsService.listAccessAssignments(req.user.companyId!, id);
  }

  @Post(':departmentId/access/:userId')
  @UseGuards(PermissionsGuard)
  @Permissions('departments:manage-access')
  grantAccess(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Param('departmentId', ParseIntPipe) departmentId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.departmentsService.grantAccess(
      req.user.companyId!,
      departmentId,
      userId,
      req.user,
      context,
    );
  }

  @Delete(':departmentId/access/:userId')
  @UseGuards(PermissionsGuard)
  @Permissions('departments:manage-access')
  revokeAccess(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @CurrentAuditContext() context: AuditRequestContext,
    @Param('departmentId', ParseIntPipe) departmentId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.departmentsService.revokeAccess(
      req.user.companyId!,
      departmentId,
      userId,
      req.user,
      context,
    );
  }
}
