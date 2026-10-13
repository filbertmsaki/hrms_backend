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
} from '../../../../docs/swagger-decorators';
import { AttendanceCheckpointsService } from './attendance-checkpoints.service';
import { AttendanceCheckpointQueryDto } from './dtos/attendance-checkpoint-query.dto';
import { CreateAttendanceCheckpointDto } from './dtos/create-attendance-checkpoint.dto';
import { UpdateAttendanceCheckpointDto } from './dtos/update-attendance-checkpoint.dto';
import { IssueAttendanceCheckpointQrTokenDto } from './dtos/issue-attendance-checkpoint-qr-token.dto';
import { AttendanceCheckpointQrService } from './attendance-checkpoint-qr.service';

@ApiTags('Attendance Checkpoints')
@ApiBearerAuth('access-token')
@Controller('attendance/checkpoints')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AttendanceCheckpointsController {
  constructor(
    private readonly attendanceCheckpointsService: AttendanceCheckpointsService,
    private readonly checkpointQrService: AttendanceCheckpointQrService,
  ) {}

  @Post(':id/qr-token')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_checkpoints:update')
  issueQrToken(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IssueAttendanceCheckpointQrTokenDto,
  ) {
    return this.checkpointQrService.issueToken({
      companyId: req.user.companyId!,
      checkpointId: id,
      validForSeconds: dto.valid_for_seconds,
    });
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_checkpoints:create')
  @ApiCreateOperation('Attendance Checkpoint', 'Create attendance checkpoint')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateAttendanceCheckpointDto,
  ) {
    return this.attendanceCheckpointsService.create(req.user.companyId!, dto);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_checkpoints:read')
  @ApiListOperation('Attendance Checkpoint', 'List attendance checkpoints')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: AttendanceCheckpointQueryDto,
  ) {
    return this.attendanceCheckpointsService.findAll(
      req.user.companyId!,
      query,
    );
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_checkpoints:read')
  @ApiGetOneOperation(
    'Attendance Checkpoint',
    'Get attendance checkpoint by ID',
  )
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.attendanceCheckpointsService.findOne(req.user.companyId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_checkpoints:update')
  @ApiUpdateOperation('Attendance Checkpoint', 'Update attendance checkpoint')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttendanceCheckpointDto,
  ) {
    return this.attendanceCheckpointsService.update(
      req.user.companyId!,
      id,
      dto,
    );
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_checkpoints:delete')
  @ApiDeleteOperation('Attendance Checkpoint', 'Delete attendance checkpoint')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.attendanceCheckpointsService.remove(req.user.companyId!, id);
  }
}
