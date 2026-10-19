import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
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
  ApiActionOperation,
  ApiListOperation,
} from '../../../../docs/swagger-decorators';
import { CreateAttendanceWorkFromHomeRequestDto } from './dtos/create-attendance-work-from-home-request.dto';
import { ReviewAttendanceWorkFromHomeRequestDto } from './dtos/review-attendance-work-from-home-request.dto';
import { AttendanceWorkFromHomeService } from './attendance-work-from-home.service';

@ApiTags('Attendance Work From Home')
@ApiBearerAuth('access-token')
@Controller('attendance/work-from-home/requests')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class AttendanceWorkFromHomeController {
  constructor(
    private readonly workFromHomeService: AttendanceWorkFromHomeService,
  ) {}

  @Post()
  @ApiActionOperation(
    'Request work from home',
    'Create a date-bounded work-from-home request for the signed-in employee.',
  )
  createRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateAttendanceWorkFromHomeRequestDto,
  ) {
    if (!req.user.employeeId) {
      throw new ForbiddenException(
        'A linked employee account is required to request work from home.',
      );
    }
    return this.workFromHomeService.createRequest(
      req.user.companyId!,
      req.user.employeeId,
      dto,
    );
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_processing:read')
  @ApiListOperation(
    'List work-from-home requests',
    'List company requests for attendance operators.',
  )
  listCompanyRequests(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.workFromHomeService.listRequests(req.user.companyId!);
  }

  @Get('mine')
  @ApiListOperation(
    'List my work-from-home requests',
    'List work-from-home requests for the signed-in employee.',
  )
  listMine(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    if (!req.user.employeeId) {
      throw new ForbiddenException(
        'A linked employee account is required to view personal requests.',
      );
    }
    return this.workFromHomeService.listRequests(
      req.user.companyId!,
      req.user.employeeId,
    );
  }

  @Patch(':id/review')
  @UseGuards(PermissionsGuard)
  @Permissions('attendance_processing:execute')
  @ApiActionOperation(
    'Review work-from-home request',
    'Approve or reject a pending work-from-home request.',
  )
  review(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewAttendanceWorkFromHomeRequestDto,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    if (!req.user.companyMembershipId) {
      throw new ForbiddenException(
        'A company membership is required to review this request.',
      );
    }
    return this.workFromHomeService.reviewRequest(
      req.user.companyId!,
      id,
      req.user.companyMembershipId,
      dto,
    );
  }

  @Patch(':id/cancel')
  @ApiActionOperation(
    'Cancel work-from-home request',
    'Cancel a pending request owned by the signed-in employee.',
  )
  cancelOwn(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    if (!req.user.employeeId) {
      throw new ForbiddenException(
        'A linked employee account is required to cancel this request.',
      );
    }
    return this.workFromHomeService.cancelOwnRequest(
      req.user.companyId!,
      req.user.employeeId,
      id,
    );
  }
}
