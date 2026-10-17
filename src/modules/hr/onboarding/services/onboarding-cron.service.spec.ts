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
