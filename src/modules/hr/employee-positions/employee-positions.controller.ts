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
import { CreateEmployeePositionDto } from './dtos/create-employee-position.dto';
import { EmployeePositionQueryDto } from './dtos/employee-position-query.dto';
import { UpdateEmployeePositionDto } from './dtos/update-employee-position.dto';
import { EmployeePositionsService } from './employee-positions.service';

@ApiTags('Employee Positions')
@ApiBearerAuth()
@Controller('employee-positions')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class EmployeePositionsController {
  constructor(private readonly employeePositionsService: EmployeePositionsService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperation({ summary: 'Create an employee position assignment' })
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateEmployeePositionDto,
  ) {
    return this.employeePositionsService.create(req.user.companyId!, dto, req.user);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('employees:read')
  @ApiOperation({ summary: 'List employee position assignments' })
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: EmployeePositionQueryDto,
  ) {
    return this.employeePositionsService.findAll(req.user.companyId!, query, req.user);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:read')
  @ApiOperation({ summary: 'Get one employee position assignment' })
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeePositionsService.findOne(req.user.companyId!, id, req.user);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperation({ summary: 'Update an employee position assignment' })
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeePositionDto,
  ) {
    return this.employeePositionsService.update(req.user.companyId!, id, dto, req.user);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperation({ summary: 'Delete an employee position assignment' })
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeePositionsService.remove(req.user.companyId!, id, req.user);
  }
}
