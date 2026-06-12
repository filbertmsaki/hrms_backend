import {
  Body,
  Controller,
  ForbiddenException,
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
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from 'src/common/guards/tenant.guard';
import { AuthenticatedUser } from 'src/common/interfaces/authenticated-user.interface';
import { AttendanceMobilePunchesService } from './attendance-mobile-punches.service';
import { CreateAttendanceMobilePunchDto } from './dtos/create-attendance-mobile-punch.dto';
import { AttendanceMobilePunchQueryDto } from './dtos/attendance-mobile-punch-query.dto';
import { ApproveMobilePunchOverrideDto } from './dtos/approve-mobile-punch-override.dto';

@Controller('attendance/mobile-punches')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AttendanceMobilePunchesController {
  constructor(
    private readonly mobilePunchesService: AttendanceMobilePunchesService,
  ) {}

  @Post('check-in')
  checkIn(
    @Body() dto: CreateAttendanceMobilePunchDto,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.mobilePunchesService.checkIn({
      companyId: req.user.companyId!,
      authenticatedEmployeeId: req.user.employeeId ?? null,
      employeeId: dto.employeeId ?? req.user.employeeId ?? null,
      dto,
      requestIp: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }

  @Post('check-out')
  checkOut(
    @Body() dto: CreateAttendanceMobilePunchDto,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.mobilePunchesService.checkOut({
      companyId: req.user.companyId!,
      authenticatedEmployeeId: req.user.employeeId ?? null,
      employeeId: dto.employeeId ?? req.user.employeeId ?? null,
      dto,
      requestIp: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }

  @Get()
  findAll(
    @Query() query: AttendanceMobilePunchQueryDto,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    if (req.user.employeeId) {
      query.employeeId = req.user.employeeId;
    } else if (
      !req.user.permissions.includes('attendance_mobile_punches:read')
    ) {
      throw new ForbiddenException(
        'You do not have permission to view attendance punches.',
      );
    }

    return this.mobilePunchesService.findAll(req.user.companyId!, query);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    const punch = await this.mobilePunchesService.findOne(req.user.companyId!, id);

    if (req.user.employeeId && punch.employeeId !== req.user.employeeId) {
      throw new ForbiddenException(
        'You can only access your own attendance punches.',
      );
    } else if (
      !req.user.employeeId &&
      !req.user.permissions.includes('attendance_mobile_punches:read')
    ) {
      throw new ForbiddenException(
        'You do not have permission to view attendance punches.',
      );
    }

    return punch;
  }

  @Patch(':id/approve-override')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_mobile_punches:update')
  approveOverride(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveMobilePunchOverrideDto,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.mobilePunchesService.approveOverride({
      companyId: req.user.companyId!,
      id,
      reviewedBy: req.user.companyMembershipId ?? req.user.id,
      dto,
    });
  }

  @Patch(':id/reject-override')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_mobile_punches:update')
  rejectOverride(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveMobilePunchOverrideDto,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.mobilePunchesService.rejectOverride({
      companyId: req.user.companyId!,
      id,
      reviewedBy: req.user.companyMembershipId ?? req.user.id,
      dto,
    });
  }
}
