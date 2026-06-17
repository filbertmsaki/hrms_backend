import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
  ApiGetOneOperation,
  ApiListOperation,
} from '../../../../docs/swagger-decorators';
import { QueryEmployeeDeviceAccessAuditLogDto } from '../dto/query-employee-device-access-audit-log.dto';
import { EmployeeDeviceAccessAuditLogService } from '../service/employee-device-access-audit-log.service';

@ApiTags('Access Control Audit Logs')
@ApiBearerAuth('access-token')
@Controller('access-control')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class EmployeeDeviceAccessAuditLogsController {
  constructor(
    private readonly auditLogService: EmployeeDeviceAccessAuditLogService,
  ) {}

  @Get('audit-logs')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiListOperation(
    'Access Audit Logs',
    'List employee device access audit logs',
  )
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: QueryEmployeeDeviceAccessAuditLogDto,
  ) {
    return this.auditLogService.findAll(req.user.companyId!, query);
  }

  @Get('audit-logs/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiGetOneOperation(
    'Access Audit Log',
    'Get one employee device access audit log',
  )
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.auditLogService.findOne(req.user.companyId!, id);
  }

  @Get('employees/:employeeId/audit-logs')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiListOperation(
    'Employee Access Audit Logs',
    'List audit logs for one employee',
  )
  findByEmployee(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Query() query: QueryEmployeeDeviceAccessAuditLogDto,
  ) {
    return this.auditLogService.findAll(req.user.companyId!, {
      ...query,
      employeeId,
    });
  }

  @Get('devices/:deviceId/audit-logs')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiListOperation(
    'Device Access Audit Logs',
    'List audit logs for one device',
  )
  findByDevice(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('deviceId', ParseIntPipe) deviceId: number,
    @Query() query: QueryEmployeeDeviceAccessAuditLogDto,
  ) {
    return this.auditLogService.findAll(req.user.companyId!, {
      ...query,
      deviceId,
    });
  }
}
