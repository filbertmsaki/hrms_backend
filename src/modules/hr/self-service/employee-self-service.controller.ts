import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request as ExpressRequest, Response } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { AttendanceMobilePunchQueryDto } from '../attendance/mobile-punches/dtos/attendance-mobile-punch-query.dto';
import { QueryAttendanceDailySummariesDto } from '../attendance/processing/dtos/query-attendance-daily-summaries.dto';
import { CancelLeaveRequestDto } from '../leave/dtos/cancel-leave-request.dto';
import { LeaveBalanceQueryDto } from '../leave/dtos/leave-balance-query.dto';
import { LeaveRequestQueryDto } from '../leave/dtos/leave-request-query.dto';
import { CreateAttendanceCorrectionRequestDto } from './dtos/create-attendance-correction-request.dto';
import { CreateMyAttendancePunchDto } from './dtos/create-my-attendance-punch.dto';
import { CreateMyLeaveRequestDto } from './dtos/create-my-leave-request.dto';
import { CreateProfileUpdateRequestDto } from './dtos/create-profile-update-request.dto';
import { MyAttendanceAssignmentQueryDto } from './dtos/my-attendance-assignment-query.dto';
import { MyAttendanceOverviewQueryDto } from './dtos/my-attendance-overview-query.dto';
import { MyScheduleQueryDto } from './dtos/my-schedule-query.dto';
import { QuerySelfServiceRequestDto } from './dtos/query-self-service-request.dto';
import { TeamAttendanceQueryDto } from './dtos/team-attendance-query.dto';
import { EmployeeSelfServiceService } from './employee-self-service.service';
import { SelectDefaultAvatarDto } from '../default-avatars/dtos/select-default-avatar.dto';
import { ProfileChangeRequestsService } from './profile-change-requests.service';
import { MyRequestTimelineQueryDto } from './dtos/my-request-timeline-query.dto';
import { CreateMyResignationDto } from './dtos/create-my-resignation.dto';
import { ActionItemQueryDto } from '../action-inbox/dtos/action-item-query.dto';
import { UploadDocumentDto } from '../documents/dtos/upload-document.dto';
import { SetMyNotificationPreferenceDto } from './dtos/set-my-notification-preference.dto';
import { NotificationPreferencesService } from '../../notifications/notification-preferences.service';
import { ProbationService } from '../probation/probation.service';
import { SubmitProbationSelfAssessmentDto } from '../probation/dtos/submit-probation-self-assessment.dto';
import { EmployeeMovementsService } from '../employee-movements/employee-movements.service';

@ApiTags('Employee Self Service')
@ApiBearerAuth('access-token')
@Controller('me')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class EmployeeSelfServiceController {
  constructor(
    private readonly employeeSelfServiceService: EmployeeSelfServiceService,
    private readonly profileChangeRequestsService: ProfileChangeRequestsService,
    private readonly notificationPreferencesService: NotificationPreferencesService,
    private readonly probationService: ProbationService,
    private readonly employeeMovementsService: EmployeeMovementsService,
  ) {}

  @Get('movements')
  @ApiOperation({ summary: 'Get my employee movement requests' })
  getMyMovements(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.employeeMovementsService.findMyMovements(req.user);
  }

  @Get('movements/:id')
  @ApiOperation({ summary: 'Get one of my employee movement requests' })
  getMyMovement(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeeMovementsService.findMyMovement(req.user, id);
  }

  @Post('movements/:id/acknowledge')
  @ApiOperation({ summary: 'Acknowledge one of my employee movements' })
  acknowledgeMyMovement(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeeMovementsService.acknowledgeMyMovement(req.user, id);
  }

  @Get('probation')
  @ApiOperation({ summary: 'Get my probation and confirmation status' })
  getMyProbation(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.probationService.getMyProbation(req.user);
  }

  @Post('probation/:caseId/self-assessment')
  @ApiOperation({ summary: 'Submit my probation self-assessment' })
  submitMyProbationAssessment(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('caseId', ParseIntPipe) caseId: number,
    @Body() dto: SubmitProbationSelfAssessmentDto,
  ) {
    return this.probationService.submitSelfAssessment(
      req.user.companyId!,
      caseId,
      req.user,
      dto,
    );
  }

  private readonly allowedProfilePhotoMimeTypes = new Set([
    'image/svg+xml',
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);

  @Get('dashboard')
  @ApiOperation({ summary: 'Get my dashboard overview' })
  async getDashboard(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    const dashboard = await this.employeeSelfServiceService.getDashboard(
      req.user,
    );

    return this.withAbsoluteProfilePhotoUrls(req, dashboard);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get my combined user and employee profile' })
  async getProfile(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    const profile = await this.employeeSelfServiceService.getProfile(req.user);
    const normalizedProfile = this.withAbsoluteProfilePhotoUrls(req, profile);
    const employee = profile.employee as
      | {
          profile_photo_url?: string | null;
          uploaded_profile_photo_url?: string | null;
        }
      | null
      | undefined;

    return {
      ...normalizedProfile,
      employee: employee
        ? {
            ...(normalizedProfile.employee as Record<string, unknown>),
            profile_photo_path: this.buildAbsoluteUrl(
              req,
              employee.uploaded_profile_photo_url ?? null,
            ),
            has_profile_photo: Boolean(employee.profile_photo_url),
            profile_photo_url: this.buildAbsoluteUrl(
              req,
              employee.profile_photo_url ?? null,
            ),
          }
        : (employee ?? null),
    };
  }

  @Get('profile/photo')
  @ApiOperation({ summary: 'Get my profile picture URL' })
  async getProfilePhoto(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    const profilePhoto = await this.employeeSelfServiceService.getProfilePhoto(
      req.user,
    );
    const profilePhotoPath =
      typeof profilePhoto.profile_photo_path === 'string'
        ? profilePhoto.profile_photo_path
        : null;
    const profilePhotoUrl =
      typeof profilePhoto.profile_photo_url === 'string'
        ? profilePhoto.profile_photo_url
        : profilePhotoPath;

    return {
      ...profilePhoto,
      has_profile_photo: Boolean(profilePhotoUrl),
      profile_photo_path: this.buildAbsoluteUrl(req, profilePhotoPath),
      profile_photo_url: this.buildAbsoluteUrl(req, profilePhotoUrl),
    };
  }

  @Post('profile/photo')
  @ApiOperation({ summary: 'Submit my profile picture for approval' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  uploadProfilePhoto(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @UploadedFile()
    file?: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {
    if (!file) {
      throw new BadRequestException('Profile picture file is required.');
    }

    if (!this.allowedProfilePhotoMimeTypes.has(file.mimetype)) {
      throw new BadRequestException(
        'Only SVG, JPEG, PNG, and WEBP profile pictures are allowed.',
      );
    }

    if (!file.buffer?.length) {
      throw new BadRequestException('Uploaded profile picture is empty.');
    }

    return this.profileChangeRequestsService.createProfilePhotoRequest(
      req.user,
      file,
      this.buildRequestContext(req),
    );
  }

  @Get('profile/avatar-options')
  @ApiOperation({
    summary: 'List default profile avatars available for the current employee',
  })
  listProfileAvatarOptions(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    return this.employeeSelfServiceService.listAvailableProfileAvatars(
      req.user,
    );
  }

  @Patch('profile/avatar')
  @ApiOperation({
    summary: 'Select a default profile avatar for the current employee',
  })
  selectProfileAvatar(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: SelectDefaultAvatarDto,
  ) {
    return this.employeeSelfServiceService.selectProfileAvatar(req.user, dto);
  }

  @Get('status')
  @ApiOperation({ summary: 'Get my current employment and attendance status' })
  async getStatus(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    const status = await this.employeeSelfServiceService.getStatus(req.user);
    return this.withAbsoluteProfilePhotoUrls(req, status);
  }

  @Get('attendance/today')
  @ApiOperation({ summary: 'Get my attendance state for today' })
  getTodayAttendance(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.employeeSelfServiceService.getTodayAttendance(req.user);
  }

  @Get('attendance/history')
  @ApiOperation({ summary: 'Get my attendance history' })
  getAttendanceHistory(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: QueryAttendanceDailySummariesDto,
  ) {
    return this.employeeSelfServiceService.getAttendanceHistory(
      req.user,
      query,
    );
  }

  @Get('attendance/punches')
  @ApiOperation({ summary: 'Get my attendance punch history' })
  getAttendancePunches(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: AttendanceMobilePunchQueryDto,
  ) {
    return this.employeeSelfServiceService.getAttendancePunches(
      req.user,
      query,
    );
  }

  @Get('attendance/schedule')
  @ApiOperation({ summary: 'Get my schedule preview' })
  getAttendanceSchedule(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: MyScheduleQueryDto,
  ) {
    return this.employeeSelfServiceService.getAttendanceSchedule(
      req.user,
      query,
    );
  }

  @Get('leave/balances')
  @UseGuards(PermissionsGuard)
  @Permissions('leave-balances.view-own')
  @ApiOperation({ summary: 'Get my leave balances' })
  getLeaveBalances(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: LeaveBalanceQueryDto,
  ) {
    return this.employeeSelfServiceService.getLeaveBalances(req.user, query);
  }

  @Get('leave/requests')
  @ApiOperation({ summary: 'Get my leave requests' })
  getLeaveRequests(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: LeaveRequestQueryDto,
  ) {
    return this.employeeSelfServiceService.getLeaveRequests(req.user, query);
  }

  @Get('leave/requests/:id')
  @ApiOperation({ summary: 'Get my leave request by id' })
  getLeaveRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeeSelfServiceService.getLeaveRequest(req.user, id);
  }

  @Post('leave/requests')
  @ApiOperation({ summary: 'Create my leave request' })
  createLeaveRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateMyLeaveRequestDto,
  ) {
    return this.employeeSelfServiceService.createLeaveRequest(req.user, dto);
  }

  @Post('leave/requests/:id/submit')
  @ApiOperation({ summary: 'Submit my leave request' })
  submitLeaveRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeeSelfServiceService.submitLeaveRequest(req.user, id);
  }

  @Post('leave/requests/:id/cancel')
  @ApiOperation({ summary: 'Cancel my leave request' })
  cancelLeaveRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelLeaveRequestDto,
  ) {
    return this.employeeSelfServiceService.cancelLeaveRequest(
      req.user,
      id,
      dto,
    );
  }

  @Get('leave/requests/:id/pdf')
  @ApiOperation({ summary: 'Generate my leave request PDF' })
  async getLeaveRequestPdf(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const buffer = await this.employeeSelfServiceService.getLeaveRequestPdf(
      req.user,
      id,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename=my-leave-request-${id}.pdf`,
    );
    res.send(buffer);
  }

  @Get('attendance/overview')
  @ApiOperation({
    summary:
      'Get my attendance overview including today, history, punches, schedule and assignments',
  })
  getAttendanceOverview(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: MyAttendanceOverviewQueryDto,
  ) {
    return this.employeeSelfServiceService.getAttendanceOverview(
      req.user,
      query,
    );
  }

  @Get('attendance/assignments')
  @ApiOperation({
    summary:
      'Get my assigned shifts, timetable assignments, default timetable and schedule overrides',
  })
  getAttendanceAssignments(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: MyAttendanceAssignmentQueryDto,
  ) {
    return this.employeeSelfServiceService.getAttendanceAssignments(
      req.user,
      query,
    );
  }

  @Post('attendance/check-in')
  @ApiOperation({ summary: 'Employee self-service check-in' })
  checkIn(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateMyAttendancePunchDto,
  ) {
    return this.employeeSelfServiceService.checkIn(
      req.user,
      dto,
      req.ip,
      req.headers['user-agent'] ?? null,
    );
  }

  @Post('attendance/check-out')
  @ApiOperation({ summary: 'Employee self-service check-out' })
  checkOut(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateMyAttendancePunchDto,
  ) {
    return this.employeeSelfServiceService.checkOut(
      req.user,
      dto,
      req.ip,
      req.headers['user-agent'] ?? null,
    );
  }

  // ─── Attendance Correction Requests ────────────────────────────────────────

  @Get('attendance/correction-requests')
  @ApiOperation({ summary: 'List my attendance correction requests' })
  listMyCorrectionRequests(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: QuerySelfServiceRequestDto,
  ) {
    return this.employeeSelfServiceService.listMyCorrectionRequests(
      req.user,
      query,
    );
  }

  @Post('attendance/correction-requests')
  @ApiOperation({ summary: 'Create an attendance correction request' })
  createMyCorrectionRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateAttendanceCorrectionRequestDto,
  ) {
    return this.employeeSelfServiceService.createMyCorrectionRequest(
      req.user,
      dto,
    );
  }

  @Get('attendance/correction-requests/:id')
  @ApiOperation({ summary: 'Get one of my attendance correction requests' })
  getMyCorrectionRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeeSelfServiceService.getMyCorrectionRequest(req.user, id);
  }

  @Post('attendance/correction-requests/:id/submit')
  @ApiOperation({ summary: 'Submit an attendance correction request' })
  submitMyCorrectionRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeeSelfServiceService.submitMyCorrectionRequest(
      req.user,
      id,
    );
  }

  @Post('attendance/correction-requests/:id/cancel')
  @ApiOperation({ summary: 'Cancel an attendance correction request' })
  cancelMyCorrectionRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeeSelfServiceService.cancelMyCorrectionRequest(
      req.user,
      id,
    );
  }

  // ─── Profile Update Requests ─────────────────────────────────────────────────

  @Get('profile-update-requests')
  @ApiOperation({ summary: 'List my profile update requests' })
  listMyProfileUpdateRequests(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: QuerySelfServiceRequestDto,
  ) {
    return this.employeeSelfServiceService.listMyProfileUpdateRequests(
      req.user,
      query,
    );
  }

  @Post('profile-update-requests')
  @ApiOperation({ summary: 'Create a profile update request' })
  createMyProfileUpdateRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateProfileUpdateRequestDto,
  ) {
    return this.employeeSelfServiceService.createMyProfileUpdateRequest(
      req.user,
      dto,
    );
  }

  @Get('profile-update-requests/:id')
  @ApiOperation({ summary: 'Get one of my profile update requests' })
  getMyProfileUpdateRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeeSelfServiceService.getMyProfileUpdateRequest(
      req.user,
      id,
    );
  }

  @Post('profile-update-requests/:id/submit')
  @ApiOperation({ summary: 'Submit a profile update request' })
  submitMyProfileUpdateRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeeSelfServiceService.submitMyProfileUpdateRequest(
      req.user,
      id,
    );
  }

  @Post('profile-update-requests/:id/cancel')
  @ApiOperation({ summary: 'Cancel a profile update request' })
  cancelMyProfileUpdateRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeeSelfServiceService.cancelMyProfileUpdateRequest(
      req.user,
      id,
    );
  }

  // ─── Action items, request timeline, documents, onboarding/offboarding ───────

  @Get('action-items')
  @ApiOperation({ summary: 'Get my pending action items' })
  getMyActionItems(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: ActionItemQueryDto,
  ) {
    return this.employeeSelfServiceService.getMyActionItems(req.user, query);
  }

  @Get('requests')
  @ApiOperation({ summary: 'Get my unified HR request timeline' })
  getMyRequests(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: MyRequestTimelineQueryDto,
  ) {
    return this.employeeSelfServiceService.getMyRequestTimeline(
      req.user,
      query,
    );
  }

  @Get('documents')
  @ApiOperation({ summary: 'Get my employee documents' })
  getMyDocuments(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.employeeSelfServiceService.getMyDocuments(req.user);
  }

  @Post('documents')
  @ApiOperation({ summary: 'Upload one of my employee documents' })
  uploadMyDocument(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: UploadDocumentDto,
  ) {
    return this.employeeSelfServiceService.uploadMyDocument(req.user, dto);
  }

  @Get('documents/:id/download')
  @ApiOperation({ summary: 'Download one of my employee documents' })
  async downloadMyDocument(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const file = await this.employeeSelfServiceService.downloadMyDocument(
      req.user,
      id,
    );

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    res.send(file.buffer);
  }

  @Get('onboarding')
  @ApiOperation({ summary: 'Get my onboarding requests' })
  getMyOnboarding(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.employeeSelfServiceService.getMyOnboarding(req.user);
  }

  @Get('offboarding')
  @ApiOperation({ summary: 'Get my offboarding requests' })
  getMyOffboarding(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.employeeSelfServiceService.getMyOffboarding(req.user);
  }

  @Post('resignation')
  @ApiOperation({ summary: 'Submit my resignation' })
  createMyResignation(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateMyResignationDto,
  ) {
    return this.employeeSelfServiceService.createMyResignation(
      req.user,
      dto,
      this.buildOffboardingContext(req),
    );
  }

  @Get('notifications/preferences')
  @ApiOperation({ summary: 'Get my notification channel preferences' })
  getMyNotificationPreferences(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
  ) {
    if (!req.user.companyMembershipId) {
      throw new BadRequestException('Active company context is required');
    }

    return this.notificationPreferencesService.findMine(
      req.user.companyMembershipId,
    );
  }

  @Post('notifications/preferences')
  @ApiOperation({ summary: 'Set one of my notification channel preferences' })
  setMyNotificationPreference(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: SetMyNotificationPreferenceDto,
  ) {
    if (!req.user.companyMembershipId) {
      throw new BadRequestException('Active company context is required');
    }

    return this.notificationPreferencesService.setPreference(
      req.user.companyMembershipId,
      dto.notification_type,
      dto.channel,
      dto.is_enabled,
    );
  }

  // ─── Manager / Team Attendance ────────────────────────────────────────────────

  @Get('team/attendance')
  @UseGuards(PermissionsGuard)
  @Permissions('team_attendance:read')
  @ApiOperation({
    summary: "Get my direct reports' attendance (manager view)",
  })
  getMyTeamAttendance(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: TeamAttendanceQueryDto,
  ) {
    return this.employeeSelfServiceService.getMyTeamAttendance(req.user, query);
  }

  private buildAbsoluteUrl(
    req: ExpressRequest,
    assetPath: string | null,
  ): string | null {
    if (!assetPath) {
      return null;
    }

    if (/^https?:\/\//i.test(assetPath)) {
      return assetPath;
    }

    const forwardedProtocol = this.readForwardedHeaderValue(
      req.headers['x-forwarded-proto'],
    );
    const forwardedHost = this.readForwardedHeaderValue(
      req.headers['x-forwarded-host'],
    );
    const protocol = forwardedProtocol || req.protocol || 'http';
    const host = forwardedHost || req.get('host') || req.headers.host;

    if (!host) {
      return assetPath;
    }

    return `${protocol}://${host}${assetPath}`;
  }

  private withAbsoluteProfilePhotoUrls<T>(req: ExpressRequest, value: T): T {
    return this.normalizeProfilePhotoUrls(req, value) as T;
  }

  private normalizeProfilePhotoUrls(
    req: ExpressRequest,
    value: unknown,
  ): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeProfilePhotoUrls(req, item));
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const normalized: Record<string, unknown> = {};

      for (const [key, nestedValue] of Object.entries(record)) {
        if (key === 'profile_photo_url') {
          normalized[key] =
            typeof nestedValue === 'string' || nestedValue === null
              ? this.buildAbsoluteUrl(req, nestedValue)
              : nestedValue;
          continue;
        }

        normalized[key] = this.normalizeProfilePhotoUrls(req, nestedValue);
      }

      return normalized;
    }

    return value;
  }

  private readForwardedHeaderValue(
    value: string | string[] | undefined,
  ): string | null {
    const firstValue = Array.isArray(value) ? value[0] : value;
    const normalized = firstValue?.split(',')[0]?.trim();

    return normalized || null;
  }

  private buildOffboardingContext(req: ExpressRequest) {
    const userAgentHeader = req.headers['user-agent'];
    return {
      ip_address: req.ip ?? null,
      user_agent: typeof userAgentHeader === 'string' ? userAgentHeader : null,
    };
  }

  private buildRequestContext(req: ExpressRequest) {
    return {
      ipAddress: req.ip,
      userAgent:
        typeof req.headers['user-agent'] === 'string'
          ? req.headers['user-agent']
          : null,
      requestIdHeader:
        typeof req.headers['x-request-id'] === 'string'
          ? req.headers['x-request-id']
          : null,
    };
  }
}
