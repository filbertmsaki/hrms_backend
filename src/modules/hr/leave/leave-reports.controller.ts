import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest, Response } from 'express';
import { PermissionsAny } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import {
  LeaveReportFormat,
  LeaveReportService,
  LeaveReportType,
} from './services/leave-report.service';

const TYPES: LeaveReportType[] = [
  'balances',
  'taken',
  'pending',
  'by-department',
];

@ApiTags('Leave')
@ApiBearerAuth('access-token')
@Controller('leave/reports')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
@PermissionsAny(
  'leave_reports.view',
  'leave-balances.view',
  'leave-balances.export',
  'leave_requests:approve',
)
export class LeaveReportsController {
  constructor(private readonly reports: LeaveReportService) {}

  @Get(':type')
  @ApiOperation({
    summary:
      'Download a leave report (balances, taken, pending, by-department) as xlsx or csv; ?format=json previews it',
  })
  async download(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Res() res: Response,
    @Param('type') type: string,
    @Query('format') format = 'xlsx',
    @Query('fiscal_year') fiscalYear?: string,
    @Query('from_date') fromDate?: string,
    @Query('to_date') toDate?: string,
    @Query('department_id') departmentId?: string,
    @Query('leave_type_id') leaveTypeId?: string,
  ) {
    if (!TYPES.includes(type as LeaveReportType)) {
      throw new BadRequestException(`Unknown report: ${type}`);
    }
    const toId = (value?: string) =>
      value && /^\d+$/.test(value) ? Number(value) : undefined;
    const report = await this.reports.build(
      req.user.companyId!,
      type as LeaveReportType,
      {
        fiscal_year: fiscalYear,
        from_date: fromDate,
        to_date: toDate,
        department_id: toId(departmentId),
        leave_type_id: toId(leaveTypeId),
      },
      req.user,
    );
    if (format === 'json') {
      res.status(200).json(report);
      return;
    }
    if (format !== 'xlsx' && format !== 'csv') {
      throw new BadRequestException('format must be xlsx, csv or json');
    }
    const stamp = new Date().toISOString().slice(0, 10);
    await this.reports.send(
      res,
      report,
      format as LeaveReportFormat,
      `leave-${type}-${stamp}`,
    );
  }
}
