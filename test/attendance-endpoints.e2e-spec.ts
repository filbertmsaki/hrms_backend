process.env.DB_NAME = process.env.DB_NAME ?? 'hrms_test_db';

type TestUser = {
  id: number;
  email: string;
  scope: 'company';
  userType: 'COMPANY_USER';
  companyId: number;
  companyMembershipId: number;
  employeeId?: number | null;
  roles: string[];
  permissions: string[];
};

let currentUser: TestUser = {
  id: 9,
  email: 'employee@example.com',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 10,
  companyMembershipId: 33,
  employeeId: 101,
  roles: ['Employee'],
  permissions: [],
};

jest.mock('@nestjs/passport', () => ({
  AuthGuard: () =>
    class MockJwtAuthGuard {
      canActivate(context: {
        switchToHttp: () => { getRequest: () => Record<string, unknown> };
      }) {
        const request = context.switchToHttp().getRequest();
        request.user = currentUser;
        return true;
      }
    },
}));

import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { TenantGuard } from '../src/common/guards/tenant.guard';
import { SecurityEventsService } from '../src/modules/security/security-events.service';
import { AttendanceMobilePunchesController } from '../src/modules/hr/attendance/mobile-punches/attendance-mobile-punches.controller';
import { AttendanceMobilePunchesService } from '../src/modules/hr/attendance/mobile-punches/attendance-mobile-punches.service';
import { AttendanceProcessingController } from '../src/modules/hr/attendance/processing/attendance-processing.controller';
import { AttendanceProcessingService } from '../src/modules/hr/attendance/processing/attendance-processing.service';
import { AttendanceDailySummaryService } from '../src/modules/hr/attendance/processing/attendance-daily-summary.service';
import { AttendanceProcessingExceptionsService } from '../src/modules/hr/attendance/processing/attendance-processing-exceptions.service';
import { AttendanceRecalculationService } from '../src/modules/hr/attendance/processing/attendance-recalculation.service';
import { AttendanceReportService } from '../src/modules/hr/attendance/processing/reports/attendance-report.service';
import { AttendanceCheckpointsController } from '../src/modules/hr/attendance/checkpoints/attendance-checkpoints.controller';
import { AttendanceCheckpointsService } from '../src/modules/hr/attendance/checkpoints/attendance-checkpoints.service';
import { AttendanceDeviceSyncLogsController } from '../src/modules/hr/attendance/sync-logs/attendance-device-sync-logs.controller';
import { AttendanceDeviceSyncLogsService } from '../src/modules/hr/attendance/sync-logs/attendance-device-sync-logs.service';
import { ShiftAssignmentsController } from '../src/modules/hr/attendance/shift/shift-assignments/shift-assignments.controller';
import { ShiftAssignmentsService } from '../src/modules/hr/attendance/shift/shift-assignments/shift-assignments.service';
import { ShiftSchedulesController } from '../src/modules/hr/attendance/shift/shift-schedules/shift-schedules.controller';
import { ShiftSchedulesService } from '../src/modules/hr/attendance/shift/shift-schedules/shift-schedules.service';

describe('Attendance endpoints (e2e)', () => {
  let app: INestApplication;
  let mobilePunchesService: {
    checkIn: jest.Mock;
    checkOut: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    approveOverride: jest.Mock;
    rejectOverride: jest.Mock;
  };
  let processingService: { processRange: jest.Mock };
  let dailySummaryService: {
    findDailySummaries: jest.Mock;
    findUnmatchedLogs: jest.Mock;
    upsertAdjustment: jest.Mock;
    clearAdjustment: jest.Mock;
  };
  let exceptionService: {
    findAll: jest.Mock;
    updateStatus: jest.Mock;
  };
  let recalculationService: {
    processPendingJobs: jest.Mock;
    findJobs: jest.Mock;
    refreshSummaries: jest.Mock;
  };
  let attendanceReportService: {
    downloadReport: jest.Mock;
  };
  let checkpointsService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };
  let deviceSyncLogsService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
  };
  let shiftAssignmentsService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };
  let shiftSchedulesService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };
  let securityEventsService: { logBestEffort: jest.Mock };

  const punchPayload = {
    clientRequestId: '01c21917-8762-4a66-b75b-049c09fb5660',
    clientCapturedAt: '2026-08-03T08:15:00.000Z',
    latitude: -6.792354,
    longitude: 39.208328,
    accuracyMeters: 8.5,
    wifiSsid: 'Alliance-HQ-Staff',
    wifiBssid: 'AA:BB:CC:DD:EE:FF',
    ipAddress: '10.40.1.24',
  };

  beforeEach(async () => {
    currentUser = {
      id: 9,
      email: 'employee@example.com',
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId: 10,
      companyMembershipId: 33,
      employeeId: 101,
      roles: ['Employee'],
      permissions: [],
    };

    mobilePunchesService = {
      checkIn: jest.fn().mockResolvedValue({
        id: 501,
        employeeId: 101,
        punchType: 'CHECK_IN',
        status: 'ACCEPTED',
      }),
      checkOut: jest.fn().mockResolvedValue({
        id: 502,
        employeeId: 101,
        punchType: 'CHECK_OUT',
        status: 'ACCEPTED',
      }),
      findAll: jest.fn().mockResolvedValue({
        data: [{ id: 501, employeeId: 101 }],
        meta: { total: 1 },
      }),
      findOne: jest.fn().mockResolvedValue({ id: 501, employeeId: 101 }),
      approveOverride: jest.fn().mockResolvedValue({ id: 501 }),
      rejectOverride: jest.fn().mockResolvedValue({ id: 501 }),
    };
    processingService = {
      processRange: jest.fn().mockResolvedValue({
        processed_events: 4,
        summaries_rebuilt: 2,
      }),
    };
    dailySummaryService = {
      findDailySummaries: jest.fn().mockResolvedValue({
        data: [{ employee_id: 101, attendance_date: '2026-08-03' }],
        meta: { total: 1 },
      }),
      findUnmatchedLogs: jest.fn().mockResolvedValue({ data: [] }),
      upsertAdjustment: jest.fn().mockResolvedValue({ employee_id: 101 }),
      clearAdjustment: jest.fn().mockResolvedValue({ employee_id: 101 }),
    };
    exceptionService = {
      findAll: jest.fn().mockResolvedValue({ data: [] }),
      updateStatus: jest.fn().mockResolvedValue({ id: 1 }),
    };
    recalculationService = {
      processPendingJobs: jest.fn().mockResolvedValue({ processed: 0 }),
      findJobs: jest.fn().mockResolvedValue({ data: [] }),
      refreshSummaries: jest.fn().mockResolvedValue({ queued: 1 }),
    };
    attendanceReportService = {
      downloadReport: jest.fn().mockResolvedValue(undefined),
    };
    checkpointsService = {
      create: jest.fn().mockResolvedValue({
        id: 41,
        policy_set_id: 7,
        name: 'HQ GPS',
        type: 'GPS',
        geofence_id: 17,
      }),
      findAll: jest.fn().mockResolvedValue({
        data: [{ id: 41, name: 'HQ GPS', type: 'GPS' }],
        meta: { total: 1 },
      }),
      findOne: jest.fn().mockResolvedValue({ id: 41, name: 'HQ GPS' }),
      update: jest.fn().mockResolvedValue({ id: 41, status: 'INACTIVE' }),
      remove: jest
        .fn()
        .mockResolvedValue({ message: 'Attendance checkpoint deleted successfully' }),
    };
    deviceSyncLogsService = {
      create: jest.fn().mockResolvedValue({
        id: 61,
        company_id: 10,
        device_id: 5,
        sync_type: 'MANUAL',
        status: 'SUCCESS',
      }),
      findAll: jest.fn().mockResolvedValue({
        data: [{ id: 61, device_id: 5, status: 'SUCCESS' }],
        meta: { total: 1 },
      }),
      findOne: jest.fn().mockResolvedValue({ id: 61, device_id: 5 }),
    };
    shiftAssignmentsService = {
      create: jest.fn().mockResolvedValue({
        id: 71,
        employee_id: 101,
        shift_id: 12,
        status: 'ACTIVE',
      }),
      findAll: jest.fn().mockResolvedValue({
        data: [{ id: 71, employee_id: 101, shift_id: 12 }],
        meta: { total: 1 },
      }),
      findOne: jest.fn().mockResolvedValue({ id: 71, employee_id: 101 }),
      update: jest.fn().mockResolvedValue({ id: 71, status: 'INACTIVE' }),
      remove: jest
        .fn()
        .mockResolvedValue({ message: 'Shift assignment deleted successfully' }),
    };
    shiftSchedulesService = {
      create: jest.fn().mockResolvedValue({
        id: 81,
        employee_id: 101,
        shift_id: 12,
      }),
      findAll: jest.fn().mockResolvedValue({
        data: [{ id: 81, employee_id: 101, shift_id: 12 }],
        meta: { total: 1 },
      }),
      findOne: jest.fn().mockResolvedValue({ id: 81, employee_id: 101 }),
      update: jest.fn().mockResolvedValue({ id: 81, is_off_day: true }),
      remove: jest
        .fn()
        .mockResolvedValue({ message: 'Shift schedule deleted successfully' }),
    };
    securityEventsService = {
      logBestEffort: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [
        AttendanceMobilePunchesController,
        AttendanceProcessingController,
        AttendanceCheckpointsController,
        AttendanceDeviceSyncLogsController,
        ShiftAssignmentsController,
        ShiftSchedulesController,
      ],
      providers: [
        {
          provide: AttendanceMobilePunchesService,
          useValue: mobilePunchesService,
        },
        { provide: AttendanceProcessingService, useValue: processingService },
        {
          provide: AttendanceDailySummaryService,
          useValue: dailySummaryService,
        },
        {
          provide: AttendanceProcessingExceptionsService,
          useValue: exceptionService,
        },
        {
          provide: AttendanceRecalculationService,
          useValue: recalculationService,
        },
        { provide: AttendanceReportService, useValue: attendanceReportService },
        { provide: AttendanceCheckpointsService, useValue: checkpointsService },
        {
          provide: AttendanceDeviceSyncLogsService,
          useValue: deviceSyncLogsService,
        },
        {
          provide: ShiftAssignmentsService,
          useValue: shiftAssignmentsService,
        },
        { provide: ShiftSchedulesService, useValue: shiftSchedulesService },
        { provide: SecurityEventsService, useValue: securityEventsService },
        PermissionsGuard,
        TenantGuard,
        Reflector,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('allows an employee to create their own mobile check-in without HR create permission', async () => {
    const response = await request(app.getHttpServer() as App)
      .post('/attendance/mobile-punches/check-in')
      .send(punchPayload)
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        employeeId: 101,
        punchType: 'CHECK_IN',
      }),
    );
    expect(mobilePunchesService.checkIn).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 10,
        authenticatedEmployeeId: 101,
        employeeId: 101,
        dto: expect.objectContaining({ latitude: -6.792354 }),
      }),
    );
  });

  it('blocks a non-employee actor from creating punches without create permission', async () => {
    currentUser = {
      ...currentUser,
      employeeId: null,
      permissions: [],
    };

    await request(app.getHttpServer() as App)
      .post('/attendance/mobile-punches/check-in')
      .send({ ...punchPayload, employeeId: 101 })
      .expect(403);

    expect(mobilePunchesService.checkIn).not.toHaveBeenCalled();
  });

  it('limits employee mobile-punch listing to the authenticated employee even when another employeeId is requested', async () => {
    await request(app.getHttpServer() as App)
      .get('/attendance/mobile-punches?employeeId=999&page=1&limit=10')
      .expect(200);

    expect(mobilePunchesService.findAll).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        employeeId: 101,
        page: 1,
        limit: 10,
      }),
    );
  });

  it('allows HR with read permission to list attendance daily summaries', async () => {
    currentUser = {
      ...currentUser,
      employeeId: null,
      permissions: ['attendance_summaries:read'],
    };

    await request(app.getHttpServer() as App)
      .get(
        '/attendance/daily-summaries?from_date=2026-08-01&to_date=2026-08-31&page=1&limit=20',
      )
      .expect(200);

    expect(dailySummaryService.findDailySummaries).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        from_date: '2026-08-01',
        to_date: '2026-08-31',
        page: 1,
        limit: 20,
      }),
      expect.objectContaining({
        companyId: 10,
        permissions: ['attendance_summaries:read'],
      }),
    );
  });

  it('rejects daily summary access without attendance summary permission', async () => {
    currentUser = {
      ...currentUser,
      employeeId: null,
      permissions: [],
    };

    await request(app.getHttpServer() as App)
      .get('/attendance/daily-summaries')
      .expect(403);

    expect(dailySummaryService.findDailySummaries).not.toHaveBeenCalled();
    expect(securityEventsService.logBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Required permission check failed',
        metadata: expect.objectContaining({
          required_permissions: ['attendance_summaries:read'],
          missing_permissions: ['attendance_summaries:read'],
        }),
      }),
    );
  });

  it('runs attendance range processing only for actors with execute permission', async () => {
    currentUser = {
      ...currentUser,
      employeeId: null,
      permissions: ['attendance_processing:execute'],
    };

    await request(app.getHttpServer() as App)
      .post('/attendance/processing/run-range')
      .send({
        start_date: '2026-08-01',
        end_date: '2026-08-03',
        rebuild_summaries: true,
      })
      .expect(201);

    expect(processingService.processRange).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        start_date: '2026-08-01',
        end_date: '2026-08-03',
        rebuild_summaries: true,
      }),
    );
  });

  it('runs pending recalculation jobs only for actors with recalculation execute permission', async () => {
    currentUser = {
      ...currentUser,
      employeeId: null,
      permissions: ['attendance_recalculation:execute'],
    };

    await request(app.getHttpServer() as App)
      .post('/attendance/processing/jobs/run-pending')
      .send({ limit: 7 })
      .expect(201);

    expect(recalculationService.processPendingJobs).toHaveBeenCalledWith(7);
  });

  it('lists recalculation jobs for actors with attendance processing read permission', async () => {
    currentUser = {
      ...currentUser,
      employeeId: null,
      permissions: ['attendance_processing:read'],
    };

    await request(app.getHttpServer() as App)
      .get('/attendance/processing/jobs?page=1&limit=25')
      .expect(200);

    expect(recalculationService.findJobs).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ page: 1, limit: 25 }),
    );
  });

  it('queues attendance daily-summary refresh with normalized legacy client aliases', async () => {
    currentUser = {
      ...currentUser,
      employeeId: null,
      permissions: ['attendance_recalculation:execute'],
    };

    await request(app.getHttpServer() as App)
      .post('/attendance/daily-summaries/refresh')
      .send({
        startDate: '2026-08-01',
        endDate: '2026-08-03',
        processingSource: 'database_only',
        execution: 'sync',
        employeeId: 101,
      })
      .expect(201);

    expect(recalculationService.refreshSummaries).toHaveBeenCalledWith(
      10,
      33,
      expect.objectContaining({
        start_date: '2026-08-01',
        end_date: '2026-08-03',
        processing_source: 'database_only',
        execution_mode: 'immediate',
        employee_id: 101,
      }),
    );
  });

  it('upserts and clears daily-summary adjustments only with processing execute permission', async () => {
    currentUser = {
      ...currentUser,
      employeeId: null,
      permissions: ['attendance_processing:execute'],
    };

    await request(app.getHttpServer() as App)
      .put('/attendance/daily-summaries/101/2026-08-03/adjustment')
      .send({
        check_in_at: '2026-08-03T08:05:00.000Z',
        check_out_at: '2026-08-03T17:05:00.000Z',
        attendance_status: 'PRESENT',
        worked_minutes: 480,
        notes: 'Approved HR correction.',
      })
      .expect(200);

    expect(dailySummaryService.upsertAdjustment).toHaveBeenCalledWith(
      10,
      101,
      '2026-08-03',
      expect.objectContaining({
        attendance_status: 'PRESENT',
        worked_minutes: 480,
      }),
      33,
    );

    await request(app.getHttpServer() as App)
      .delete('/attendance/daily-summaries/101/2026-08-03/adjustment')
      .expect(200);

    expect(dailySummaryService.clearAdjustment).toHaveBeenCalledWith(
      10,
      101,
      '2026-08-03',
    );
  });

  it('updates processing exceptions only for actors with processing execute permission', async () => {
    currentUser = {
      ...currentUser,
      employeeId: null,
      permissions: ['attendance_processing:execute'],
    };

    await request(app.getHttpServer() as App)
      .patch('/attendance/processing/exceptions/71')
      .send({ status: 'RESOLVED', resolution_note: 'Mapped manually.' })
      .expect(200);

    expect(exceptionService.updateStatus).toHaveBeenCalledWith(
      10,
      71,
      expect.objectContaining({
        status: 'RESOLVED',
        resolution_note: 'Mapped manually.',
      }),
      33,
    );
  });

  it('protects checkpoint listing behind attendance checkpoint read permission', async () => {
    currentUser = {
      ...currentUser,
      employeeId: null,
      permissions: [],
    };

    await request(app.getHttpServer() as App)
      .get('/attendance/checkpoints?page=1&limit=20')
      .expect(403);

    expect(checkpointsService.findAll).not.toHaveBeenCalled();
    expect(securityEventsService.logBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Required permission check failed',
        metadata: expect.objectContaining({
          required_permissions: ['attendance_checkpoints:read'],
          missing_permissions: ['attendance_checkpoints:read'],
        }),
      }),
    );
  });

  it('routes checkpoint CRUD requests through tenant-scoped service calls', async () => {
    currentUser = {
      ...currentUser,
      employeeId: null,
      permissions: [
        'attendance_checkpoints:create',
        'attendance_checkpoints:read',
        'attendance_checkpoints:update',
        'attendance_checkpoints:delete',
      ],
    };

    await request(app.getHttpServer() as App)
      .post('/attendance/checkpoints')
      .send({
        policy_set_id: 7,
        name: 'HQ GPS',
        type: 'GPS',
        geofence_id: 17,
        max_distance_meters: 90,
      })
      .expect(201);

    expect(checkpointsService.create).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        policy_set_id: 7,
        name: 'HQ GPS',
        type: 'GPS',
        geofence_id: 17,
        max_distance_meters: 90,
      }),
    );

    await request(app.getHttpServer() as App)
      .get('/attendance/checkpoints?policy_set_id=7&type=GPS&page=1&limit=20')
      .expect(200);

    expect(checkpointsService.findAll).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        policy_set_id: 7,
        type: 'GPS',
        page: 1,
        limit: 20,
      }),
    );

    await request(app.getHttpServer() as App)
      .get('/attendance/checkpoints/41')
      .expect(200);

    expect(checkpointsService.findOne).toHaveBeenCalledWith(10, 41);

    await request(app.getHttpServer() as App)
      .patch('/attendance/checkpoints/41')
      .send({ status: 'INACTIVE' })
      .expect(200);

    expect(checkpointsService.update).toHaveBeenCalledWith(
      10,
      41,
      expect.objectContaining({ status: 'INACTIVE' }),
    );

    await request(app.getHttpServer() as App)
      .delete('/attendance/checkpoints/41')
      .expect(200);

    expect(checkpointsService.remove).toHaveBeenCalledWith(10, 41);
  });

  it('protects device sync-log listing behind read permission', async () => {
    currentUser = {
      ...currentUser,
      employeeId: null,
      permissions: [],
    };

    await request(app.getHttpServer() as App)
      .get('/attendance/device-sync-logs?device_id=5')
      .expect(403);

    expect(deviceSyncLogsService.findAll).not.toHaveBeenCalled();
    expect(securityEventsService.logBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Required permission check failed',
        metadata: expect.objectContaining({
          required_permissions: ['attendance_device_sync_logs:read'],
          missing_permissions: ['attendance_device_sync_logs:read'],
        }),
      }),
    );
  });

  it('routes device sync-log create/list/detail through tenant-scoped service calls', async () => {
    currentUser = {
      ...currentUser,
      employeeId: null,
      permissions: [
        'attendance_device_sync_logs:create',
        'attendance_device_sync_logs:read',
      ],
    };

    await request(app.getHttpServer() as App)
      .post('/attendance/device-sync-logs')
      .send({
        device_id: 5,
        sync_type: 'MANUAL',
        status: 'SUCCESS',
        started_at: '2026-08-03T08:00:00.000Z',
        completed_at: '2026-08-03T08:05:00.000Z',
        records_received: 12,
        records_processed: 12,
        failed_records: 0,
      })
      .expect(201);

    expect(deviceSyncLogsService.create).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        device_id: 5,
        sync_type: 'MANUAL',
        status: 'SUCCESS',
        records_received: 12,
      }),
    );

    await request(app.getHttpServer() as App)
      .get(
        '/attendance/device-sync-logs?device_id=5&sync_type=MANUAL&status=SUCCESS&from_date=2026-08-01&to_date=2026-08-31&page=1&limit=20',
      )
      .expect(200);

    expect(deviceSyncLogsService.findAll).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        device_id: 5,
        sync_type: 'MANUAL',
        status: 'SUCCESS',
        from_date: '2026-08-01',
        to_date: '2026-08-31',
        page: 1,
        limit: 20,
      }),
    );

    await request(app.getHttpServer() as App)
      .get('/attendance/device-sync-logs/61')
      .expect(200);

    expect(deviceSyncLogsService.findOne).toHaveBeenCalledWith(10, 61);
  });

  it('protects shift assignment listing behind read permission', async () => {
    currentUser = {
      ...currentUser,
      employeeId: null,
      permissions: [],
    };

    await request(app.getHttpServer() as App)
      .get('/attendance/assignments/shifts?employee_id=101')
      .expect(403);

    expect(shiftAssignmentsService.findAll).not.toHaveBeenCalled();
    expect(securityEventsService.logBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Required permission check failed',
        metadata: expect.objectContaining({
          required_permissions: ['shift_assignments:read'],
          missing_permissions: ['shift_assignments:read'],
        }),
      }),
    );
  });

  it('routes shift assignment CRUD through tenant-scoped service calls', async () => {
    currentUser = {
      ...currentUser,
      employeeId: null,
      permissions: [
        'shift_assignments:create',
        'shift_assignments:read',
        'shift_assignments:update',
        'shift_assignments:delete',
      ],
    };

    await request(app.getHttpServer() as App)
      .post('/attendance/assignments/shifts')
      .send({
        employee_id: 101,
        shift_id: 12,
        effective_from: '2026-08-01',
        rotation_group_id: 3,
        is_primary: true,
      })
      .expect(201);

    expect(shiftAssignmentsService.create).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        employee_id: 101,
        shift_id: 12,
        effective_from: '2026-08-01',
        rotation_group_id: 3,
        is_primary: true,
      }),
    );

    await request(app.getHttpServer() as App)
      .get('/attendance/assignments/shifts?employee_id=101&shift_id=12&status=ACTIVE&page=1&limit=20')
      .expect(200);

    expect(shiftAssignmentsService.findAll).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        employee_id: 101,
        shift_id: 12,
        status: 'ACTIVE',
        page: 1,
        limit: 20,
      }),
    );

    await request(app.getHttpServer() as App)
      .get('/attendance/assignments/shifts/71')
      .expect(200);

    expect(shiftAssignmentsService.findOne).toHaveBeenCalledWith(10, 71);

    await request(app.getHttpServer() as App)
      .patch('/attendance/assignments/shifts/71')
      .send({ status: 'INACTIVE', effective_to: '2026-09-30' })
      .expect(200);

    expect(shiftAssignmentsService.update).toHaveBeenCalledWith(
      10,
      71,
      expect.objectContaining({
        status: 'INACTIVE',
        effective_to: '2026-09-30',
      }),
    );

    await request(app.getHttpServer() as App)
      .delete('/attendance/assignments/shifts/71')
      .expect(200);

    expect(shiftAssignmentsService.remove).toHaveBeenCalledWith(10, 71);
  });

  it('protects manual schedule override listing behind read permission', async () => {
    currentUser = {
      ...currentUser,
      employeeId: null,
      permissions: [],
    };

    await request(app.getHttpServer() as App)
      .get('/attendance/schedules/manual-overrides?employee_id=101')
      .expect(403);

    expect(shiftSchedulesService.findAll).not.toHaveBeenCalled();
    expect(securityEventsService.logBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Required permission check failed',
        metadata: expect.objectContaining({
          required_permissions: ['shift_schedules:read'],
          missing_permissions: ['shift_schedules:read'],
        }),
      }),
    );
  });

  it('routes manual schedule override CRUD through tenant-scoped service calls', async () => {
    currentUser = {
      ...currentUser,
      employeeId: null,
      permissions: [
        'shift_schedules:create',
        'shift_schedules:read',
        'shift_schedules:update',
        'shift_schedules:delete',
      ],
    };

    await request(app.getHttpServer() as App)
      .post('/attendance/schedules/manual-overrides')
      .send({
        employee_id: 101,
        shift_id: 12,
        schedule_date: '2026-08-05',
        remarks: 'Training day coverage.',
      })
      .expect(201);

    expect(shiftSchedulesService.create).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        employee_id: 101,
        shift_id: 12,
        schedule_date: '2026-08-05',
        remarks: 'Training day coverage.',
      }),
    );

    await request(app.getHttpServer() as App)
      .get('/attendance/schedules/manual-overrides?employee_id=101&shift_id=12&from_date=2026-08-01&to_date=2026-08-31&page=1&limit=20')
      .expect(200);

    expect(shiftSchedulesService.findAll).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        employee_id: 101,
        shift_id: 12,
        from_date: '2026-08-01',
        to_date: '2026-08-31',
        page: 1,
        limit: 20,
      }),
    );

    await request(app.getHttpServer() as App)
      .get('/attendance/schedules/manual-overrides/81')
      .expect(200);

    expect(shiftSchedulesService.findOne).toHaveBeenCalledWith(10, 81);

    await request(app.getHttpServer() as App)
      .patch('/attendance/schedules/manual-overrides/81')
      .send({ is_off_day: true, shift_id: null })
      .expect(200);

    expect(shiftSchedulesService.update).toHaveBeenCalledWith(
      10,
      81,
      expect.objectContaining({
        is_off_day: true,
        shift_id: null,
      }),
    );

    await request(app.getHttpServer() as App)
      .delete('/attendance/schedules/manual-overrides/81')
      .expect(200);

    expect(shiftSchedulesService.remove).toHaveBeenCalledWith(10, 81);
  });
});
