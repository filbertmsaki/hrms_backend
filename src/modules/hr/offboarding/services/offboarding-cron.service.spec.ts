import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { OffboardingCronService } from './offboarding-cron.service';
import { OffboardingApproval } from '../entities/offboarding-approval.entity';
import { OffboardingClearance } from '../entities/offboarding-clearance.entity';
import { OffboardingTask } from '../entities/offboarding-task.entity';
import type { PostgresAdvisoryLockService } from '../../../../common/database/postgres-advisory-lock.service';
import {
  OffboardingApprovalReminderEvent,
  OffboardingClearanceOverdueEvent,
  OffboardingTaskOverdueEvent,
} from '../../notifications/events';

type QueryBuilderMock<T> = {
  innerJoin: jest.MockedFunction<(a: string, b: string) => QueryBuilderMock<T>>;
  leftJoinAndSelect: jest.MockedFunction<
    (a: string, b: string) => QueryBuilderMock<T>
  >;
  where: jest.MockedFunction<(a: string, b?: unknown) => QueryBuilderMock<T>>;
  andWhere: jest.MockedFunction<
    (a: string, b?: unknown) => QueryBuilderMock<T>
  >;
  getMany: jest.MockedFunction<() => Promise<T[]>>;
  update: jest.MockedFunction<() => QueryBuilderMock<T>>;
  set: jest.MockedFunction<(a: unknown) => QueryBuilderMock<T>>;
  execute: jest.MockedFunction<() => Promise<{ affected: number }>>;
};

const createQueryBuilderMock = <T>(items: T[]): QueryBuilderMock<T> => {
  const builder = {
    innerJoin: jest.fn(),
    leftJoinAndSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    getMany: jest.fn().mockResolvedValue(items),
    update: jest.fn(),
    set: jest.fn(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  } as QueryBuilderMock<T>;

  builder.innerJoin.mockReturnValue(builder);
  builder.leftJoinAndSelect.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  builder.andWhere.mockReturnValue(builder);
  builder.update.mockReturnValue(builder);
  builder.set.mockReturnValue(builder);
  return builder;
};

describe('OffboardingCronService', () => {
  it('emits overdue task, clearance, and approval reminder events', async () => {
    const taskRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(
        createQueryBuilderMock<OffboardingTask>([
          {
            id: 11,
            offboarding_request_id: 4,
            title: 'Collect laptop',
            assigned_to_company_user_id: 22,
            due_date: new Date('2026-07-20T08:00:00.000Z'),
            offboarding_request: {
              company_id: 10,
              last_working_date: '2026-07-25',
              employee: {
                first_name: 'Amina',
                last_name: 'John',
              },
            },
            assigned_to_company_user: {
              user: {
                first_name: 'IT',
                last_name: 'Owner',
                email: 'it.owner@example.com',
              },
            },
          } as OffboardingTask,
        ]),
      ),
    } as unknown as Repository<OffboardingTask>;

    const clearanceRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(
        createQueryBuilderMock<OffboardingClearance>([
          {
            id: 7,
            offboarding_request_id: 4,
            clearance_type: 'system_access',
            owner_company_user_id: 23,
            due_date: new Date('2026-07-19T08:00:00.000Z'),
            offboarding_request: {
              company_id: 10,
              last_working_date: '2026-07-25',
              employee: {
                first_name: 'Amina',
                last_name: 'John',
              },
            },
            owner_company_user: {
              user: {
                first_name: 'Security',
                last_name: 'Lead',
                email: 'security.lead@example.com',
              },
            },
          } as unknown as OffboardingClearance,
        ]),
      ),
    } as unknown as Repository<OffboardingClearance>;

    const approvalRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(
        createQueryBuilderMock<OffboardingApproval>([
          {
            id: 5,
            offboarding_request_id: 4,
            approver_company_user_id: 24,
            workflow_step: {
              approval_level: 2,
            },
            offboarding_request: {
              company_id: 10,
              last_working_date: '2026-07-25',
              employee: {
                first_name: 'Amina',
                last_name: 'John',
              },
            },
            approver_company_user: {
              user: {
                first_name: 'HR',
                last_name: 'Manager',
                email: 'hr.manager@example.com',
              },
            },
          } as unknown as OffboardingApproval,
        ]),
      ),
    } as unknown as Repository<OffboardingApproval>;

    const eventEmitter = { emit: jest.fn() } as unknown as EventEmitter2;
    const configService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'APP_FRONTEND_URL') {
          return 'http://localhost:5173';
        }
        return defaultValue;
      }),
    } as unknown as ConfigService;

    const advisoryLockService = {
      runWithLock: jest.fn(
        async (_key: string, callback: () => Promise<unknown>) => ({
          acquired: true,
          result: await callback(),
        }),
      ),
    } as unknown as PostgresAdvisoryLockService;

    const emptyRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilderMock([])),
    };

    const service = new OffboardingCronService(
      taskRepository,
      clearanceRepository,
      approvalRepository,
      emptyRepository as unknown as Repository<
        import('../entities/offboarding-asset-return.entity').OffboardingAssetReturn
      >,
      emptyRepository as unknown as Repository<
        import('../entities/offboarding-settlement-item.entity').OffboardingSettlementItem
      >,
      eventEmitter,
      configService,
      advisoryLockService,
    );

    await service.handleOffboardingEscalations();

    expect((eventEmitter.emit as jest.Mock).mock.calls).toEqual(
      expect.arrayContaining([
        [
          OffboardingTaskOverdueEvent.EVENT,
          expect.any(OffboardingTaskOverdueEvent),
        ],
        [
          OffboardingClearanceOverdueEvent.EVENT,
          expect.any(OffboardingClearanceOverdueEvent),
        ],
        [
          OffboardingApprovalReminderEvent.EVENT,
          expect.any(OffboardingApprovalReminderEvent),
        ],
      ]),
    );
  });
});
