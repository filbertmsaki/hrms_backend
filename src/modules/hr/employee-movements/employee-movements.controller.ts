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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import {
  Permissions,
  PermissionsAny,
} from '../../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { EmployeeMovementsService } from './employee-movements.service';
import { CreateEmployeeMovementDto } from './dtos/create-employee-movement.dto';
import { UpdateEmployeeMovementDto } from './dtos/update-employee-movement.dto';
import { EmployeeMovementQueryDto } from './dtos/employee-movement-query.dto';
import {
  ApproveEmployeeMovementDto,
  RejectEmployeeMovementDto,
  ReturnEmployeeMovementDto,
} from './dtos/approve-employee-movement.dto';
import { EmployeeMovementLetterTypeEnum } from './enums/employee-movement-letter-type.enum';

type AuthedRequest = ExpressRequest & { user: AuthenticatedUser };

@ApiTags('Employee Movements')
@ApiBearerAuth('access-token')
@Controller('employee-movements')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class EmployeeMovementsController {
  constructor(private readonly service: EmployeeMovementsService) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('employee_movements:create')
  create(@Req() req: AuthedRequest, @Body() dto: CreateEmployeeMovementDto) {
    return this.service.create(req.user, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @PermissionsAny(
    'employee_movements:read',
    'manager_team:read',
    'manager_self_service:read',
    'manager:read',
  )
  findAll(@Req() req: AuthedRequest, @Query() query: EmployeeMovementQueryDto) {
    return this.service.findAll(req.user, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @PermissionsAny(
    'employee_movements:read',
    'manager_team:read',
    'manager_self_service:read',
    'manager:read',
  )
  findOne(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(req.user, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_movements:create')
  update(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeMovementDto,
  ) {
    return this.service.update(req.user, id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_movements:cancel')
  remove(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(req.user, id);
  }

  @Post(':id/submit')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_movements:submit')
  submit(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.submit(req.user, id);
  }

  @Post(':id/cancel')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_movements:cancel')
  cancel(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.cancel(req.user, id);
  }

  @Post(':id/reject')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_movements:approve')
  reject(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectEmployeeMovementDto,
  ) {
    return this.service.reject(req.user, id, dto.comments);
  }

  @Post(':id/return')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_movements:approve')
  returnForCorrection(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReturnEmployeeMovementDto,
  ) {
    return this.service.returnForCorrection(req.user, id, dto.comments);
  }

  @Post(':id/approve')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_movements:approve')
  approve(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveEmployeeMovementDto,
  ) {
    return this.service.approve(req.user, id, dto);
  }

  @Post(':id/apply')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_movements:apply')
  apply(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.apply(req.user, id);
  }

  @Post(':id/generate-letter')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_movements:generate-letter')
  generateLetter(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body('letter_type') letterType: EmployeeMovementLetterTypeEnum,
  ) {
    return this.service.generateLetter(req.user, id, letterType);
  }

  @Get(':id/operations')
  @UseGuards(PermissionsGuard)
  @PermissionsAny(
    'employee_movements:read',
    'manager_team:read',
    'manager_self_service:read',
    'manager:read',
  )
  findOperations(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.findOperations(req.user, id);
  }

  @Post(':id/operations/:operationId/retry')
  @UseGuards(PermissionsGuard)
  @Permissions('employee_movements:retry')
  retryOperation(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('operationId', ParseIntPipe) operationId: number,
  ) {
    return this.service.retryOperation(req.user, id, operationId);
  }
}
