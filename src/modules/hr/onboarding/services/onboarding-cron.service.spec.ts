import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { Document } from '../../documents/entities/document.entity';
import { OnboardingApproval } from '../entities/onboarding-approval.entity';
import { OnboardingRequest } from '../entities/onboarding-request.entity';
import { OnboardingTask } from '../entities/onboarding-task.entity';
import { OnboardingRequestStatusEnum } from '../enums/onboarding-request-status.enum';
import { OnboardingCronService } from './onboarding-cron.service';
import { OnboardingDocumentReminderEvent } from '../../notifications/events';
import * as positions from '../utils/position-assignment';

describe('OnboardingCronService document reminders', () => {
  let service: OnboardingCronService;
  let requests: OnboardingRequest[];
  let documents: Document[];
  let savedRequest: OnboardingRequest;
  let emit: jest.Mock;
  let save: jest.Mock;

  beforeEach(() => {
    const requestQuery = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => requests),
    };
    const requestEntityRepository = {
      findOne: jest.fn(async () => savedRequest),
      save: jest.fn(async (value) => {
        savedRequest = value;
        return value;
      }),
    };
    save = requestEntityRepository.save;
    const requestRepository = {
      createQueryBuilder: jest.fn(() => requestQuery),
      manager: {
        transaction: jest.fn(async (callback) =>
          callback({ getRepository: () => requestEntityRepository }),
        ),
      },
    };
    emit = jest.fn();
    service = new OnboardingCronService(
      {} as never as Repository<OnboardingTask>,
      {} as never as Repository<OnboardingApproval>,
      requestRepository as never as Repository<OnboardingRequest>,
      {} as never as Repository<CompanyUser>,
      { find: jest.fn(async () => documents) } as never as Repository<Document>,
      { emit } as never as EventEmitter2,
      {
        get: (_key: string, fallback: number) => fallback,
      } as never as ConfigService,
    );

    savedRequest = {
      id: 17,
      company_id: 3,
      onboarding_no: 'ONB-17',
      status: OnboardingRequestStatusEnum.IN_PROGRESS,
      metadata: null,
      completed_at: null,
      cancelled_at: null,
    } as OnboardingRequest;
    requests = [
      {
        ...savedRequest,
        employee: {
          first_name: 'Neema',
          last_name: 'David',
          company_user: { id: 81 },
        },
        tasks: [
          {
            is_required: true,
            required_document_type_code: 'identity_document',
          },
        ],
      } as OnboardingRequest,
    ];
    documents = [];
  });

  it('reminds an onboarding employee when a required document is missing', async () => {
    await (service as any).notifyCandidatesWithOutstandingDocuments();

    expect(save).toHaveBeenCalledTimes(1);
    expect(savedRequest.metadata).toMatchObject({ document_reminder_count: 1 });
    expect(emit).toHaveBeenCalledWith(
      OnboardingDocumentReminderEvent.EVENT,
      expect.objectContaining({
        companyId: 3,
        onboardingRequestId: 17,
        employeeCompanyUserId: 81,
        outstandingDocumentTypes: ['identity_document'],
      }),
    );
  });

  it('does not remind again before the configured interval elapses', async () => {
    savedRequest.metadata = {
      document_reminder_last_sent_at: new Date().toISOString(),
    };

    await (service as any).notifyCandidatesWithOutstandingDocuments();

    expect(save).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('does not remind when the required document is approved', async () => {
    documents = [
      {
        document_type: 'identity_document',
        is_verified: true,
        metadata: { onboarding_review_status: 'approved' },
      } as Document,
    ];

    await (service as any).notifyCandidatesWithOutstandingDocuments();

    expect(save).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('OnboardingCronService workflow reminders', () => {
  let service: OnboardingCronService;
  let current: Record<string, unknown>;
  let request: Record<string, unknown>;
  let save: jest.Mock;
  let findOne: jest.Mock;
  beforeEach(() => {
    current = {
      id: 1,
      onboarding_request_id: 17,
      status: 'pending',
      approval_level: 1,
      last_reminder_at: null,
      reminder_count: 0,
    };
    request = {
      id: 17,
      status: 'in_progress',
      current_approval_level: 1,
      tasks: [],
      approvals: [],
    };
    save = jest.fn(async (value) => value);
    findOne = jest.fn(async () => current);
    const repository = { findOne, save };
    const requestRepository = {
      manager: {
        transaction: jest.fn(async (callback) =>
          callback({
            getRepository: (entity: unknown) =>
              entity === OnboardingRequest
                ? { findOne: jest.fn(async () => request) }
                : repository,
          }),
        ),
      },
    };
    service = new OnboardingCronService(
      {} as never,
      {} as never,
      requestRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });
  afterEach(() => jest.restoreAllMocks());

  it('locks and records an approval reminder only once during its cooldown', async () => {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    expect(await (service as any).claimReminder('approval', 1, cutoff)).toBe(
      true,
    );
    expect(await (service as any).claimReminder('approval', 1, cutoff)).toBe(
      false,
    );
    expect(save).toHaveBeenCalledTimes(1);
    expect(current.reminder_count).toBe(1);
    expect(findOne).toHaveBeenCalledWith({
      where: { id: 1 },
      lock: { mode: 'pessimistic_write' },
    });
  });
  it.each(['completed', 'cancelled', 'rejected', 'draft'])(
    'does not remind a %s request',
    async (status) => {
      request.status = status;
      expect(
        await (service as any).claimReminder('approval', 1, new Date()),
      ).toBe(false);
      expect(save).not.toHaveBeenCalled();
    },
  );
  it('does not remind a completed approval or a future level', async () => {
    current.status = 'approved';
    expect(
      await (service as any).claimReminder('approval', 1, new Date()),
    ).toBe(false);
    current.status = 'pending';
    current.approval_level = 2;
    expect(
      await (service as any).claimReminder('approval', 1, new Date()),
    ).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
  it('checks task eligibility again under the reminder lock', async () => {
    request.tasks = [
      { id: 1, status: 'completed', due_date: new Date('2020-01-01') },
    ];
    expect(await (service as any).claimReminder('task', 1, new Date())).toBe(
      false,
    );
    request.tasks = [
      { id: 1, status: 'pending', due_date: new Date('2020-01-01') },
    ];
    expect(await (service as any).claimReminder('task', 1, new Date())).toBe(
      true,
    );
    expect(save).toHaveBeenCalledTimes(1);
  });
  it('routes position-assigned reminders through the existing active-position resolver', async () => {
    const resolve = jest
      .spyOn(positions, 'resolvePositionMembers')
      .mockResolvedValue([{ id: 8 }, { id: 8 }, { id: 9 }] as CompanyUser[]);
    expect(
      await (service as any).resolveTaskRecipientIds({
        workflow_step: { metadata: { assigned_position_id: 3 } },
        onboarding_request: { company_id: 10 },
      }),
    ).toEqual([8, 9]);
    expect(resolve).toHaveBeenCalledWith(expect.anything(), 10, 3);
  });
});
