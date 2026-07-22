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
  listReportDefinitions() {
    return this.scheduledReportingService.listReportDefinitions();
  }

  @Get('smtp-configurations')
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
  createSmtpConfiguration(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateReportSmtpConfigurationDto,
  ) {
    const { companyId } = this.scheduledReportingService.assertCompanyActor(
      req.user,
    );
    return this.scheduledReportingService.createSmtpConfiguration(
      companyId,
      dto,
    );
  }

  @Get('smtp-configurations/:id')
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
      id,
      dto,
    );
  }

  @Delete('smtp-configurations/:id')
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

  @Post('smtp-configurations/:id/test')
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
      id,
      dto,
    );
  }

  @Get('templates')
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
  createTemplate(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateReportTemplateDto,
  ) {
    const { companyId } = this.scheduledReportingService.assertCompanyActor(
      req.user,
    );
    return this.scheduledReportingService.createTemplate(companyId, dto);
  }

  @Get('templates/:id')
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
  updateTemplate(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReportTemplateDto,
  ) {
    const { companyId } = this.scheduledReportingService.assertCompanyActor(
      req.user,
    );
    return this.scheduledReportingService.updateTemplate(companyId, id, dto);
  }

  @Delete('templates/:id')
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
  createSchedule(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateReportScheduleDto,
  ) {
    const { companyId } = this.scheduledReportingService.assertCompanyActor(
      req.user,
    );
    return this.scheduledReportingService.createSchedule(companyId, dto);
  }

  @Get('schedules/:id')
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
  updateSchedule(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReportScheduleDto,
  ) {
    const { companyId } = this.scheduledReportingService.assertCompanyActor(
      req.user,
    );
    return this.scheduledReportingService.updateSchedule(companyId, id, dto);
  }

  @Delete('schedules/:id')
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
