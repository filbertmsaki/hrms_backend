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
import { Throttle } from '@nestjs/throttler';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  CreateReportScheduleDto,
  CreateReportSmtpConfigurationDto,
  CreateReportTemplateDto,
  QueryReportExecutionsDto,
  QueryReportSchedulesDto,
  QueryReportSmtpConfigurationsDto,
  QueryReportTemplatesDto,
  TestDraftReportSmtpConfigurationDto,
  TestReportSmtpConfigurationDto,
  UpdateReportScheduleDto,
  UpdateReportSmtpConfigurationDto,
  UpdateReportTemplateDto,
} from './dto/scheduled-reporting.dto';
import { ScheduledReportingService } from './scheduled-reporting.service';

@ApiTags('Scheduled Reporting')
@ApiBearerAuth('access-token')
@Controller('scheduled-reporting')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class ScheduledReportingController {
  constructor(
    private readonly scheduledReportingService: ScheduledReportingService,
  ) {}

  @Get('report-definitions')
  @UseGuards(PermissionsGuard)
  @Permissions('scheduled_reports:read')
  listReportDefinitions() {
    return this.scheduledReportingService.listReportDefinitions();
  }

  @Get('smtp-configurations')
  @UseGuards(PermissionsGuard)
  @Permissions('scheduled_reports:manage_smtp')
  listSmtpConfigurations(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: QueryReportSmtpConfigurationsDto,
  ) {
    const { companyId } = this.scheduledReportingService.assertCompanyActor(
      req.user,
    );
    return this.scheduledReportingService.findSmtpConfigurations(
      companyId,
      query,
    );
  }

  @Post('smtp-configurations')
  @UseGuards(PermissionsGuard)
  @Permissions('scheduled_reports:manage_smtp')
  createSmtpConfiguration(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateReportSmtpConfigurationDto,
  ) {
    const { companyId } = this.scheduledReportingService.assertCompanyActor(
      req.user,
    );
    return this.scheduledReportingService.createSmtpConfiguration(
      companyId,
      req.user,
      dto,
    );
  }

  @Get('smtp-configurations/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('scheduled_reports:manage_smtp')
  getSmtpConfiguration(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const { companyId } = this.scheduledReportingService.assertCompanyActor(
      req.user,
    );
    return this.scheduledReportingService.findOneSmtpConfiguration(
      companyId,
      id,
    );
  }

  @Patch('smtp-configurations/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('scheduled_reports:manage_smtp')
  updateSmtpConfiguration(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReportSmtpConfigurationDto,
  ) {
    const { companyId } = this.scheduledReportingService.assertCompanyActor(
      req.user,
    );
    return this.scheduledReportingService.updateSmtpConfiguration(
      companyId,
      req.user,
      id,
      dto,
    );
  }

  @Delete('smtp-configurations/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('scheduled_reports:manage_smtp')
  deleteSmtpConfiguration(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const { companyId } = this.scheduledReportingService.assertCompanyActor(
      req.user,
    );
    return this.scheduledReportingService.removeSmtpConfiguration(
      companyId,
      id,
    );
  }

  @Post('smtp-configurations/test-draft')
  @UseGuards(PermissionsGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Permissions('scheduled_reports:test_smtp')
  testDraftSmtpConfiguration(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: TestDraftReportSmtpConfigurationDto,
  ) {
    const { companyId } = this.scheduledReportingService.assertCompanyActor(
      req.user,
    );
    return this.scheduledReportingService.testDraftSmtpConfiguration(
      companyId,
      req.user,
      dto,
    );
  }

  @Post('smtp-configurations/:id/test')
  @UseGuards(PermissionsGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Permissions('scheduled_reports:test_smtp')
  testSmtpConfiguration(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TestReportSmtpConfigurationDto,
  ) {
    const { companyId } = this.scheduledReportingService.assertCompanyActor(
      req.user,
    );
    return this.scheduledReportingService.testSmtpConfiguration(
      companyId,
      req.user,
      id,
      dto,
    );
  }

  @Get('templates')
  @UseGuards(PermissionsGuard)
  @Permissions('scheduled_reports:read')
  listTemplates(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: QueryReportTemplatesDto,
  ) {
    const { companyId } = this.scheduledReportingService.assertCompanyActor(
      req.user,
    );
    return this.scheduledReportingService.findTemplates(companyId, query);
  }

  @Post('templates')
  @UseGuards(PermissionsGuard)
  @Permissions('scheduled_reports:create')
  createTemplate(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateReportTemplateDto,
  ) {
    const { companyId } = this.scheduledReportingService.assertCompanyActor(
      req.user,
    );
    return this.scheduledReportingService.createTemplate(
      companyId,
      req.user,
      dto,
    );
  }

  @Get('templates/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('scheduled_reports:read')
  getTemplate(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const { companyId } = this.scheduledReportingService.assertCompanyActor(
      req.user,
    );
    return this.scheduledReportingService.findOneTemplate(companyId, id);
  }

  @Patch('templates/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('scheduled_reports:update')
  updateTemplate(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReportTemplateDto,
  ) {
    const { companyId } = this.scheduledReportingService.assertCompanyActor(
      req.user,
    );
    return this.scheduledReportingService.updateTemplate(
      companyId,
      req.user,
      id,
      dto,
    );
  }

  @Delete('templates/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('scheduled_reports:delete')
  deleteTemplate(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const { companyId } = this.scheduledReportingService.assertCompanyActor(
      req.user,
    );
    return this.scheduledReportingService.removeTemplate(companyId, id);
  }

  @Get('schedules')
  @UseGuards(PermissionsGuard)
  @Permissions('scheduled_reports:read')
  listSchedules(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: QueryReportSchedulesDto,
  ) {
    const { companyId } = this.scheduledReportingService.assertCompanyActor(
      req.user,
    );
    return this.scheduledReportingService.findSchedules(companyId, query);
  }

  @Post('schedules')
  @UseGuards(PermissionsGuard)
  @Permissions('scheduled_reports:create')
  createSchedule(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateReportScheduleDto,
  ) {
    const { companyId } = this.scheduledReportingService.assertCompanyActor(
      req.user,
    );
    return this.scheduledReportingService.createSchedule(
      companyId,
      req.user,
      dto,
    );
  }

  @Get('schedules/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('scheduled_reports:read')
  getSchedule(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const { companyId } = this.scheduledReportingService.assertCompanyActor(
      req.user,
    );
    return this.scheduledReportingService.findOneSchedule(companyId, id);
  }

  @Patch('schedules/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('scheduled_reports:update')
  updateSchedule(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReportScheduleDto,
  ) {
    const { companyId } = this.scheduledReportingService.assertCompanyActor(
      req.user,
    );
    return this.scheduledReportingService.updateSchedule(
      companyId,
      req.user,
      id,
      dto,
    );
  }

  @Delete('schedules/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('scheduled_reports:delete')
  deleteSchedule(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const { companyId } = this.scheduledReportingService.assertCompanyActor(
      req.user,
    );
    return this.scheduledReportingService.removeSchedule(companyId, id);
  }

  @Get('executions')
  @UseGuards(PermissionsGuard)
  @Permissions('scheduled_reports:view_history')
  listExecutions(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: QueryReportExecutionsDto,
  ) {
    const { companyId } = this.scheduledReportingService.assertCompanyActor(
      req.user,
    );
    return this.scheduledReportingService.findExecutions(companyId, query);
  }

  @Get('executions/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('scheduled_reports:view_history')
  getExecution(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const { companyId } = this.scheduledReportingService.assertCompanyActor(
      req.user,
    );
    return this.scheduledReportingService.findOneExecution(companyId, id);
  }
}
