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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { PermissionsAny } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { EmployeeProfileRecordsService } from './employee-profile-records.service';

type Req = ExpressRequest & { user: AuthenticatedUser };
type ChangeBody = { data?: Record<string, unknown>; reason?: string };

/**
 * Employee self-service create / edit / delete of own profile records.
 * Sensitive records (IDs, bank accounts, next of kin) wait for HR approval;
 * every change is kept in the audit log and can be rolled back (via HR).
 */
@ApiTags('Employee Self-Service Profile Records')
@ApiBearerAuth('access-token')
@Controller('me/profile-records')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class MyProfileRecordsController {
  constructor(private readonly service: EmployeeProfileRecordsService) {}

  @Get('changes')
  @ApiOperation({ summary: 'My profile record change history' })
  listChanges(@Req() req: Req) {
    return this.service.listMine(req.user);
  }

  @Post('changes/:id/rollback')
  @ApiOperation({ summary: 'Request HR to roll back one of my changes' })
  rollback(
    @Req() req: Req,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason?: string },
  ) {
    return this.service.requestRollback(req.user, id, body?.reason);
  }

  @Post('changes/:id/cancel')
  @ApiOperation({ summary: 'Cancel my pending request' })
  cancel(@Req() req: Req, @Param('id', ParseIntPipe) id: number) {
    return this.service.cancel(req.user, id);
  }

  @Post(':type')
  @ApiOperation({ summary: 'Add a record to my profile' })
  create(
    @Req() req: Req,
    @Param('type') type: string,
    @Body() body: ChangeBody,
  ) {
    return this.service.create(req.user, type, body?.data ?? {}, body?.reason);
  }

  @Patch(':type/:id')
  @ApiOperation({ summary: 'Edit a record on my profile' })
  update(
    @Req() req: Req,
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ChangeBody,
  ) {
    return this.service.update(
      req.user,
      type,
      id,
      body?.data ?? {},
      body?.reason,
    );
  }

  @Delete(':type/:id')
  @ApiOperation({ summary: 'Delete a record from my profile' })
  remove(
    @Req() req: Req,
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Query('reason') reason?: string,
  ) {
    return this.service.remove(req.user, type, id, reason);
  }
}

@ApiTags('HR Profile Record Approvals')
@ApiBearerAuth('access-token')
@Controller('hr/profile-record-changes')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class HrProfileRecordChangesController {
  constructor(private readonly service: EmployeeProfileRecordsService) {}

  @Get()
  @PermissionsAny(EmployeeProfileRecordsService.HR_PERMISSION)
  @ApiOperation({ summary: 'List employee profile record changes' })
  list(
    @Req() req: Req,
    @Query('status') status?: string,
    @Query('employee_id') employeeId?: string,
  ) {
    return this.service.listForHr(req.user, {
      status,
      employee_id: employeeId ? Number(employeeId) : undefined,
    });
  }

  @Post(':id/approve')
  @PermissionsAny(EmployeeProfileRecordsService.HR_PERMISSION)
  @ApiOperation({ summary: 'Approve and apply a profile record change' })
  approve(
    @Req() req: Req,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { comment?: string },
  ) {
    return this.service.approve(req.user, id, body?.comment);
  }

  @Post(':id/reject')
  @PermissionsAny(EmployeeProfileRecordsService.HR_PERMISSION)
  @ApiOperation({ summary: 'Reject a profile record change' })
  reject(
    @Req() req: Req,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { comment?: string },
  ) {
    return this.service.reject(req.user, id, body?.comment);
  }
}
