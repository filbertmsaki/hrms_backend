import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from 'src/common/guards/tenant.guard';
import { AuthenticatedUser } from 'src/common/interfaces/authenticated-user.interface';
import {
  ApiActionOperation,
  ApiGetOneOperation,
  ApiListOperation,
  ApiCreateOperation,
} from '../../../../docs/swagger-decorators';
import { AttendanceMobilePunchesService } from './attendance-mobile-punches.service';
import { CreateAttendanceMobilePunchDto } from './dtos/create-attendance-mobile-punch.dto';
import { AttendanceMobilePunchQueryDto } from './dtos/attendance-mobile-punch-query.dto';
import { ApproveMobilePunchOverrideDto } from './dtos/approve-mobile-punch-override.dto';
import { ReleaseAttendanceMobileDeviceDto } from './dtos/release-attendance-mobile-device.dto';

@ApiTags('Attendance Mobile Punches')
@ApiBearerAuth('access-token')
@Controller('attendance/mobile-punches')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AttendanceMobilePunchesController {
  constructor(
    private readonly mobilePunchesService: AttendanceMobilePunchesService,
  ) {}

  @Post('check-in')
  @ApiCreateOperation('Attendance Mobile Punch', 'Create mobile punch check-in')
  async checkIn(
    @Body() dto: CreateAttendanceMobilePunchDto,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    if (
      !req.user.employeeId &&
      !req.user.permissions.includes('attendance_mobile_punches:create')
    ) {
      throw new ForbiddenException(
        'You do not have permission to create attendance punches.',
      );
    }

    const result = await this.mobilePunchesService.checkIn({
      companyId: req.user.companyId!,
      authenticatedEmployeeId: req.user.employeeId ?? null,
      employeeId: dto.employeeId ?? req.user.employeeId ?? null,
      dto,
      channel: 'MOBILE',
      requestIp: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return this.mobilePunchesService.applyLocationPrivacyToPunchResponse(
      req.user.companyId!,
      result,
      this.locationAccessContext(req),
    );
  }

  @Post('check-out')
  @ApiCreateOperation(
    'Attendance Mobile Punch',
    'Create mobile punch check-out',
  )
  async checkOut(
    @Body() dto: CreateAttendanceMobilePunchDto,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    if (
      !req.user.employeeId &&
      !req.user.permissions.includes('attendance_mobile_punches:create')
    ) {
      throw new ForbiddenException(
        'You do not have permission to create attendance punches.',
      );
    }

    const result = await this.mobilePunchesService.checkOut({
      companyId: req.user.companyId!,
      authenticatedEmployeeId: req.user.employeeId ?? null,
      employeeId: dto.employeeId ?? req.user.employeeId ?? null,
      dto,
      channel: 'MOBILE',
      requestIp: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return this.mobilePunchesService.applyLocationPrivacyToPunchResponse(
      req.user.companyId!,
      result,
      this.locationAccessContext(req),
    );
  }

  @Get()
  @ApiListOperation('Attendance Mobile Punch', 'List attendance mobile punches')
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

    return this.mobilePunchesService.findAll(req.user.companyId!, query, {
      actorId: req.user.companyMembershipId ?? req.user.id,
      employeeId: req.user.employeeId ?? null,
      canViewLocation: Boolean(
        req.user.employeeId ||
        req.user.permissions.includes('field_locations:read'),
      ),
      requestId:
        String(
          req.headers['x-request-id'] ?? req.headers['x-correlation-id'] ?? '',
        ) || null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }

  @Get('my-policy')
  @ApiGetOneOperation(
    'My mobile attendance policy',
    'Return the active employee-facing mobile punch requirements.',
  )
  myPolicy(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    if (!req.user.employeeId) {
      throw new ForbiddenException(
        'A linked employee account is required to read mobile attendance requirements.',
      );
    }
    return this.mobilePunchesService.getMyPunchPolicy(req.user.companyId!);
  }

  @Get('devices')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_mobile_punches:read')
  @ApiListOperation(
    'Registered attendance mobile devices',
    'List company-scoped attendance app installation registrations.',
  )
  listDevices(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.mobilePunchesService.listMobileDeviceRegistrations(
      req.user.companyId!,
    );
  }

  @Get('devices/:id/audit')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_mobile_punches:read')
  @ApiListOperation(
    'Attendance mobile device registration history',
    'Read the company-scoped enrollment, release, and reassignment audit history.',
  )
  listDeviceAudit(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.mobilePunchesService.listMobileDeviceRegistrationAudit(
      req.user.companyId!,
      id,
    );
  }

  @Patch('devices/:id/release')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_mobile_punches:update')
  @ApiActionOperation(
    'Release attendance mobile device',
    'Unbind an installation with a required reason so it can be enrolled by its legitimate next user.',
  )
  releaseDevice(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReleaseAttendanceMobileDeviceDto,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.mobilePunchesService.releaseMobileDeviceRegistration({
      companyId: req.user.companyId!,
      id,
      releasedByCompanyUserId: req.user.companyMembershipId ?? req.user.id,
      dto,
    });
  }

  @Get('location-access-logs')
  @UseGuards(PermissionsGuard)
  @Permissions('field_locations:read')
  @ApiListOperation(
    'Attendance location access audit',
    'List company-scoped access to attendance location details.',
  )
  listLocationAccessLogs(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.mobilePunchesService.listLocationAccessLogs(
      req.user.companyId!,
    );
  }

  private locationAccessContext(
    req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return {
      actorId: req.user.companyMembershipId ?? req.user.id,
      employeeId: req.user.employeeId ?? null,
      canViewLocation: Boolean(
        req.user.employeeId ||
        req.user.permissions.includes('field_locations:read'),
      ),
      requestId:
        String(
          req.headers['x-request-id'] ?? req.headers['x-correlation-id'] ?? '',
        ) || null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    };
  }

  @Get(':id')
  @ApiGetOneOperation(
    'Attendance Mobile Punch',
    'Get attendance mobile punch by ID',
  )
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    if (req.user.employeeId) {
      const ownPunch = await this.mobilePunchesService.findOne(
        req.user.companyId!,
        id,
      );
      if (ownPunch.employeeId !== req.user.employeeId)
        throw new ForbiddenException(
          'You can only access your own attendance punches.',
        );
    } else if (
      !req.user.permissions.includes('attendance_mobile_punches:read')
    ) {
      throw new ForbiddenException(
        'You do not have permission to view attendance punches.',
      );
    }
    return this.mobilePunchesService.findOneWithLocationPrivacy(
      req.user.companyId!,
      id,
      {
        actorId: req.user.companyMembershipId ?? req.user.id,
        employeeId: req.user.employeeId ?? null,
        canViewLocation: Boolean(
          req.user.employeeId ||
          req.user.permissions.includes('field_locations:read'),
        ),
        requestId:
          String(
            req.headers['x-request-id'] ??
              req.headers['x-correlation-id'] ??
              '',
          ) || null,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      },
    );
  }

  @Get(':id/selfie')
  @Header('Content-Type', 'image/jpeg')
  @Header('Cache-Control', 'private, no-store')
  async getSelfie(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    const punch = await this.mobilePunchesService.findOne(
      req.user.companyId!,
      id,
    );

    if (req.user.employeeId && punch.employeeId !== req.user.employeeId) {
      throw new ForbiddenException(
        'You can only access your own attendance selfies.',
      );
    }
    if (
      !req.user.employeeId &&
      !req.user.permissions.includes('attendance_mobile_punches:read')
    ) {
      throw new ForbiddenException(
        'You do not have permission to view attendance selfies.',
      );
    }

    return new StreamableFile(
      await this.mobilePunchesService.getSelfie(req.user.companyId!, id),
    );
  }

  @Patch(':id/approve-override')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_mobile_punches:update')
  @ApiActionOperation(
    'Approve attendance mobile punch override',
    'Approves a pending attendance mobile punch override request.',
  )
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
  @ApiActionOperation(
    'Reject attendance mobile punch override',
    'Rejects a pending attendance mobile punch override request.',
  )
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
