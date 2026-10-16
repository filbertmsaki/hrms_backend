import { UseFilters } from '@nestjs/common';
import { WorkflowDatabaseExceptionFilter } from '../../../../common/filters/workflow-database-exception.filter';
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
import { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import {
  AddDailyActivityEvidenceDto,
  CreateDailyActivityEntryDto,
  CreateDailyActivityCommentDto,
  CreateDailyActivityReportDto,
  CreateSelfActivityTaskDto,
  SubmitDailyActivityReportDto,
  UpdateDailyActivityEntryDto,
} from '../dto/activity.dto';
import { WorkActivityQueryDto } from '../dto/queries.dto';
import { DailyActivityService } from '../services/daily-activity.service';

type AuthedRequest = ExpressRequest & { user: AuthenticatedUser };

@ApiTags('My Daily Activities')
@ApiBearerAuth('access-token')
@UseFilters(WorkflowDatabaseExceptionFilter)
@Controller('me/activities')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class MyDailyActivitiesController {
  constructor(private readonly service: DailyActivityService) {}

  @Get()
  @Permissions('work_activities:self-service:read')
  list(@Req() req: AuthedRequest, @Query() query: WorkActivityQueryDto) {
    return this.service.listMine(req.user, query);
  }

  @Get('today')
  @Permissions('work_activities:self-service:read')
  getToday(@Req() req: AuthedRequest) {
    return this.service.getOrCreateMyDailyReport(
      req.user,
      new Date().toISOString().slice(0, 10),
    );
  }

  @Get('tasks')
  @Permissions('work_activities:self-service:read')
  listTasks(@Req() req: AuthedRequest, @Query() query: WorkActivityQueryDto) {
    return this.service.listMineTasks(req.user, query);
  }

  @Post('tasks')
  @Permissions('work_activities:self-service:update')
  createTask(
    @Req() req: AuthedRequest,
    @Body() dto: CreateSelfActivityTaskDto,
  ) {
    return this.service.createMyTask(req.user, dto);
  }

  @Post('reports')
  @Permissions('work_activities:self-service:update')
  createReport(
    @Req() req: AuthedRequest,
    @Body() dto: CreateDailyActivityReportDto,
  ) {
    return this.service.getOrCreateMyDailyReport(
      req.user,
      dto.activity_date,
      dto.client_request_id,
      dto.source,
    );
  }

  @Get('reports/:id')
  @Permissions('work_activities:self-service:read')
  getReport(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.getMine(req.user, id);
  }

  @Post('reports/:id/entries')
  @Permissions('work_activities:self-service:update')
  addEntry(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) reportId: number,
    @Body() dto: CreateDailyActivityEntryDto,
  ) {
    return this.service.addMyEntry(req.user, reportId, dto);
  }

  @Patch('reports/:id/entries/:entryId')
  @Permissions('work_activities:self-service:update')
  updateEntry(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) reportId: number,
    @Param('entryId', ParseIntPipe) entryId: number,
    @Body() dto: UpdateDailyActivityEntryDto,
  ) {
    return this.service.updateMyEntry(req.user, reportId, entryId, dto);
  }

  @Delete('reports/:id/entries/:entryId')
  @Permissions('work_activities:self-service:update')
  removeEntry(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) reportId: number,
    @Param('entryId', ParseIntPipe) entryId: number,
  ) {
    return this.service.removeMyEntry(req.user, reportId, entryId);
  }

  @Post('entries/:entryId/evidence')
  @Permissions('work_activities:self-service:update')
  addEvidence(
    @Req() req: AuthedRequest,
    @Param('entryId', ParseIntPipe) entryId: number,
    @Body() dto: AddDailyActivityEvidenceDto,
  ) {
    return this.service.addMyEvidence(req.user, entryId, dto);
  }

  @Post('entries/:entryId/comments')
  @Permissions('work_activities:self-service:update')
  addComment(
    @Req() req: AuthedRequest,
    @Param('entryId', ParseIntPipe) entryId: number,
    @Body() dto: CreateDailyActivityCommentDto,
  ) {
    return this.service.addMyComment(req.user, entryId, dto);
  }

  @Post('reports/:id/submit')
  @Permissions('work_activities:self-service:update')
  submit(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) reportId: number,
    @Body() dto: SubmitDailyActivityReportDto,
  ) {
    return this.service.submitMyDailyReport(req.user, reportId, dto);
  }
}
