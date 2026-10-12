process.env.DB_NAME = process.env.DB_NAME ?? 'hrms_test_db';

const e2eUser = {
  id: 9,
  email: 'tester@example.com',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 10,
  companyMembershipId: 33,
  employeeId: 501,
  permissions: [],
  roles: [],
};

jest.mock('@nestjs/passport', () => ({
  AuthGuard: () =>
    class MockJwtAuthGuard {
      canActivate(context: {
        switchToHttp: () => { getRequest: () => Record<string, unknown> };
      }) {
        context.switchToHttp().getRequest().user = e2eUser;
        return true;
      }
    },
}));

import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { EmployeeSelfServiceController } from '../src/modules/hr/self-service/employee-self-service.controller';
import { EmployeeSelfServiceService } from '../src/modules/hr/self-service/employee-self-service.service';
import { ProfileChangeRequestsService } from '../src/modules/hr/self-service/profile-change-requests.service';
import { NotificationPreferencesService } from '../src/modules/notifications/notification-preferences.service';
import { ProbationService } from '../src/modules/hr/probation/probation.service';
import { EmployeeMovementsService } from '../src/modules/hr/employee-movements/employee-movements.service';
import { TenantGuard } from '../src/common/guards/tenant.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';

describe('Employee leave documents (e2e)', () => {
  let app: INestApplication;
  const addDocument = jest.fn();
  const createLeaveRequest = jest.fn();

  beforeEach(async () => {
    addDocument
      .mockReset()
      .mockResolvedValue({ id: 91, file_name: 'medical-note.pdf' });
    createLeaveRequest
      .mockReset()
      .mockResolvedValue({ id: 77, status: 'draft' });
    const moduleRef = await Test.createTestingModule({
      controllers: [EmployeeSelfServiceController],
      providers: [
        {
          provide: EmployeeSelfServiceService,
          useValue: {
            addMyLeaveRequestDocument: addDocument,
            createLeaveRequest,
          },
        },
        { provide: ProfileChangeRequestsService, useValue: {} },
        { provide: NotificationPreferencesService, useValue: {} },
        { provide: ProbationService, useValue: {} },
        { provide: EmployeeMovementsService, useValue: {} },
      ],
    })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('accepts a valid attachment for the authenticated employee-owned request', async () => {
    const payload = {
      file: {
        fileName: 'medical-note.pdf',
        fileSize: 4,
        mimeType: 'application/pdf',
        fileString: 'dGVzdA==',
      },
    };

    const response = await request(app.getHttpServer() as App)
      .post('/me/leave/requests/77/documents')
      .send(payload)
      .expect(201);

    expect(response.body).toEqual({ id: 91, file_name: 'medical-note.pdf' });
    expect(addDocument).toHaveBeenCalledWith(e2eUser, 77, payload);
  });

  it('rejects malformed attachment metadata before service execution', async () => {
    await request(app.getHttpServer() as App)
      .post('/me/leave/requests/77/documents')
      .send({
        file: {
          fileName: '../note.pdf',
          fileSize: 0,
          mimeType: 'invalid',
          fileString: 'not base64',
        },
      })
      .expect(400);

    expect(addDocument).not.toHaveBeenCalled();
  });

  it('accepts half-day and short-leave fields on employee request creation', async () => {
    const halfDay = {
      leave_type_id: 7,
      duration_type: 'HALF_DAY',
      half_day_session: 'SECOND_HALF',
      start_date: '2026-10-12',
      end_date: '2026-10-12',
      reason: 'Appointment',
      submit: false,
    };
    await request(app.getHttpServer() as App)
      .post('/me/leave/requests')
      .send(halfDay)
      .expect(201);
    expect(createLeaveRequest).toHaveBeenLastCalledWith(e2eUser, halfDay);

    const shortLeave = {
      leave_type_id: 7,
      duration_type: 'SHORT_LEAVE',
      start_time: '09:15',
      end_time: '11:45',
      start_date: '2026-10-12',
      end_date: '2026-10-12',
      reason: 'Medical appointment',
      submit: false,
    };
    await request(app.getHttpServer() as App)
      .post('/me/leave/requests')
      .send(shortLeave)
      .expect(201);
    expect(createLeaveRequest).toHaveBeenLastCalledWith(e2eUser, shortLeave);
  });

  it('rejects short-leave times outside HH:MM format', async () => {
    await request(app.getHttpServer() as App)
      .post('/me/leave/requests')
      .send({
        leave_type_id: 7,
        duration_type: 'SHORT_LEAVE',
        start_time: '9am',
        end_time: '11:45',
        start_date: '2026-10-12',
        end_date: '2026-10-12',
        reason: 'Medical appointment',
        submit: false,
      })
      .expect(400);

    expect(createLeaveRequest).not.toHaveBeenCalled();
  });
});
