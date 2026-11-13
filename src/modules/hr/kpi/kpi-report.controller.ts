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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { KpiReportQueryDto } from './dto/kpi-report.dto';
import { reportPdf, reportXlsx } from './kpi-report-export';
import { KpiReportService, type KpiReportKind } from './kpi-report.service';
import { KpiRoles, KpiRolesGuard } from './kpi-roles.guard';

type SessionRequest = Request & { user: AuthenticatedUser };

@ApiTags('KPI Phase 6 Reports')
@ApiBearerAuth('access-token')
@Controller('hr/kpi/reports')
@UseGuards(AuthGuard('jwt'), TenantGuard, KpiRolesGuard)
export class KpiReportController {
  constructor(private readonly reports: KpiReportService) {}

  @Get(':kind')
  @KpiRoles(
    'COMPANY_ADMIN',
    'HR_MANAGER',
    'DEPARTMENT_MANAGER',
    'BRANCH_MANAGER',
    'MANAGEMENT',
    'EMPLOYEE',
  )
  async get(
    @Req() request: SessionRequest,
    @Param('kind') kind: string,
    @Query() query: KpiReportQueryDto,
    @Res() response: Response,
  ) {
    if (
      !['individual', 'department', 'branch', 'hr', 'executive'].includes(kind)
    )
      throw new BadRequestException('Unknown report type');
    const format = query.format;
    const { format: ignoredFormat, ...reportQuery } = query;
    void ignoredFormat;
    const document = await this.reports.create(
      request.user,
      kind as KpiReportKind,
      reportQuery,
    );
    if (!format || format === 'json') return response.json(document);
    const bytes =
      format === 'pdf' ? await reportPdf(document) : await reportXlsx(document);
    response.setHeader(
      'Content-Type',
      format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="kpi-${kind}-report.${format}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    return response.send(bytes);
  }
}
