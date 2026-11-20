import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { AccessReconciliationOperation } from '../entity/access-reconciliation-operation.entity';
import { AccessControlSyncService } from '../../service/access-control-sync.service';
import { HikvisionUserManagementService } from '../../../hikvision/hikvision-user-management.service';

@ApiTags('Access Reconciliation')
@ApiBearerAuth('access-token')
@Controller('access-control/reconciliation-operations')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class AccessReconciliationOperationsController {
  constructor(
    @InjectRepository(AccessReconciliationOperation)
    private readonly operations: Repository<AccessReconciliationOperation>,
    private readonly accessSync: AccessControlSyncService,
    private readonly hikvisionUsers: HikvisionUserManagementService,
  ) {}

  @Get()
  @Permissions('access_groups:read', 'data_scope:company')
  async list(@Req() req: Request & { user: AuthenticatedUser }) {
    const rows = await this.operations.find({
      where: { companyId: req.user.companyId! },
      order: { id: 'DESC' },
      take: 100,
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        employee_id: row.employeeId,
        unresolved_employee_no: row.unresolvedEmployeeNo,
        effective_date: row.effectiveDate,
        device_id: row.deviceId,
        group_id: row.sourceGroupId,
        requested_by_company_user_id: row.requestedByCompanyUserId,
        reason: row.reason,
        status: row.status,
        created_at: row.createdAt,
        last_error: row.lastError,
      })),
      warning:
        'Records require review; automatic device reconciliation is not yet implemented.',
    };
  }

  @Get(':id/inspect-device')
  @Permissions(
    'access_groups:read',
    'access_control_sync:execute',
    'data_scope:company',
  )
  async inspectDevice(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const companyId = req.user.companyId!;
    const operation = await this.operations.findOne({
      where: { id, companyId },
    });
    if (!operation)
      throw new NotFoundException('Access reconciliation operation not found');
    if (operation.employeeId === null)
      throw new BadRequestException(
        'This device user is not linked to an HR employee; link the employee before inspecting access.',
      );
    const desired = await this.accessSync.previewEffectiveAccess(
      companyId,
      operation.employeeId,
      operation.deviceId,
    );
    if (!desired.employee_no)
      return {
        operation_id: id,
        desired,
        observed: null,
        warning:
          'The device employee number is missing; device access was not inspected.',
      };
    const result = await this.hikvisionUsers.getUserByEmployeeNumber(
      companyId,
      operation.deviceId,
      desired.employee_no,
    );
    return {
      operation_id: id,
      desired,
      observed: {
        exists: result.exists,
        employee_no: result.employee_no,
        door_right: result.user?.door_right ?? null,
        right_plan: result.user?.right_plan ?? [],
      },
      warning:
        'Device inspection is read-only. It does not establish ownership of device rights or change this operation.',
    };
  }
}
