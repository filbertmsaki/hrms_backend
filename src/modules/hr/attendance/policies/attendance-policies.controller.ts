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
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import {
  ApiCreateOperation,
  ApiDeleteOperation,
  ApiGetOneOperation,
  ApiListOperation,
  ApiUpdateOperation,
  ApiActionOperation,
} from '../../../../docs/swagger-decorators';
import { AttendancePolicyQueryDto } from './dtos/attendance-policy-query.dto';
import { CreateAttendancePolicyDto } from './dtos/create-attendance-policy.dto';
import { UpdateAttendancePolicyDto } from './dtos/update-attendance-policy.dto';
import { AttendancePoliciesService } from './attendance-policies.service';

@ApiTags('Attendance Policies')
@ApiBearerAuth('access-token')
@Controller('attendance/policies')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AttendancePoliciesController {
  constructor(
    private readonly attendancePoliciesService: AttendancePoliciesService,
  ) {}

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_policies:create')
  @ApiCreateOperation('Attendance Policy', 'Create attendance policy')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() createAttendancePolicyDto: CreateAttendancePolicyDto,
  ) {
    return this.attendancePoliciesService.create(
      req.user.companyId!,
      createAttendancePolicyDto,
    );
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_policies:read')
  @ApiListOperation('Attendance Policy', 'List attendance policies')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: AttendancePolicyQueryDto,
  ) {
    return this.attendancePoliciesService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_policies:read')
  @ApiGetOneOperation('Attendance Policy', 'Get attendance policy by ID')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.attendancePoliciesService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_policies:update')
  @ApiUpdateOperation('Attendance Policy', 'Update attendance policy')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() updateAttendancePolicyDto: UpdateAttendancePolicyDto,
  ) {
    return this.attendancePoliciesService.update(
      req.user.companyId!,
      id,
      updateAttendancePolicyDto,
    );
  }

  @Patch(':id/activate')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_policies:update')
  @ApiActionOperation(
    'Activate attendance policy',
    'Marks this policy as active and deactivates all other policies in the same company.',
  )
  activate(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.attendancePoliciesService.activate(req.user.companyId!, id);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_policies:delete')
  @ApiDeleteOperation('Attendance Policy', 'Delete attendance policy')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.attendancePoliciesService.remove(req.user.companyId!, id);
  }
}




