import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { NotificationsService } from '../../../notifications/notifications.service';
import { Employee } from '../../employees/entities/employee.entity';
import { HrAccessService } from '../../shared/hr-access.service';
import { CreateEmployeeKpiDto } from '../dto/employee-kpi.dto';
import {
  EmployeeKpi,
  EmployeeKpiReviewHistory,
} from '../entities/employee-kpi.entity';
import { PerformancePeriod } from '../entities/performance-period.entity';
import {
  EmployeeKpiMeasurementTypeEnum,
  EmployeeKpiProgressSourceEnum,
  EmployeeKpiReviewDecisionEnum,
  EmployeeKpiStatusEnum,
} from '../enums/employee-kpi-status.enum';
import { PerformancePeriodStatusEnum } from '../enums/performance-period-status.enum';
import { PerformanceAuditService } from './performance-audit.service';
import { EmployeeKpiProgressService } from './employee-kpi-progress.service';
import { EmployeeKpiService } from './employee-kpi.service';

const actor: AuthenticatedUser = {
  id: 5,
  email: 'employee@example.com',
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 1,
  companyMembershipId: 15,
  employeeId: 11,
  roles: [],
  permissions: [],
};

function period(status = PerformancePeriodStatusEnum.OPEN): PerformancePeriod {
  return {
    id: 3,
    companyId: 1,
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    status,
  } as PerformancePeriod;
}

function dto(): CreateEmployeeKpiDto {
  return {
    performance_period_id: 3,
    title: 'Acquire customers',
    description: 'Acquire new customers during September.',
    measurement_type: EmployeeKpiMeasurementTypeEnum.NUMBER,
    target_value: 20,
    unit: 'Customers',
    weight: 100,
    due_date: '2026-09-30',
    progress_source: EmployeeKpiProgressSourceEnum.MANUAL,
  };
}

type Harness = {
  service: EmployeeKpiService;
  kpiRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };
  periodRepository: { findOne: jest.Mock };
  employeeRepository: { findOne: jest.Mock };
  dataSource: { manager: EntityManager; transaction: jest.Mock };
  hrAccess: {
    getAccessibleEmployeeIds: jest.Mock;
    getReportingEmployeeIds: jest.Mock;
    hasCompanyScope: jest.Mock;
  };
};

function harness(): Harness {
  const employee = {
    id: 11,
    company_id: 1,
    company_user_id: 15,
    first_name: 'Asha',
    last_name: 'Mushi',
    reports_to: 22,
  } as Employee;
  const openPeriod = period();
  const kpiRepository = {
    create: jest.fn((value: EmployeeKpi) => value),
    save: jest.fn(async (value: EmployeeKpi) => ({
      ...value,
      id: value.id ?? 7,
      version: 1,
    })),
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn(),
  };
  const historyRepository = {
    create: jest.fn((value: EmployeeKpiReviewHistory) => value),
    save: jest.fn(async (value: EmployeeKpiReviewHistory) => value),
  };
  const employeeRepository = { findOne: jest.fn().mockResolvedValue(employee) };
  const periodRepository = { findOne: jest.fn().mockResolvedValue(openPeriod) };
  const manager = {
    getRepository: jest.fn((entity: object) => {
      if (entity === EmployeeKpiReviewHistory) return historyRepository;
      if (entity === PerformancePeriod) return periodRepository;
      return kpiRepository;
    }),
  } as unknown as EntityManager;
  const dataSource = {
    manager,
    transaction: jest.fn(
      async (callback: (entityManager: EntityManager) => unknown) =>
        callback(manager),
    ),
  };
  const hrAccess = {
    ensureActorCompanyId: jest.fn().mockReturnValue(1),
    getAccessibleEmployeeIds: jest.fn().mockResolvedValue([]),
    getReportingEmployeeIds: jest.fn().mockResolvedValue([]),
    hasCompanyScope: jest.fn().mockReturnValue(false),
  };
  const events = { emit: jest.fn() };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const progress = {
    calculate: jest.fn().mockResolvedValue({ achievementPercent: null }),
  };
  const notifications = {
    createAndPush: jest.fn().mockResolvedValue(undefined),
  };
  const config = {
    get: jest.fn((key: string, fallback: number) => fallback),
  };

  const service = new EmployeeKpiService(
    config as unknown as ConfigService,
    hrAccess as unknown as HrAccessService,
    audit as unknown as PerformanceAuditService,
    progress as unknown as EmployeeKpiProgressService,
    notifications as unknown as NotificationsService,
    events as unknown as EventEmitter2,
    dataSource as unknown as DataSource,
    kpiRepository as unknown as Repository<EmployeeKpi>,
    employeeRepository as unknown as Repository<Employee>,
    periodRepository as unknown as Repository<PerformancePeriod>,
  );

  return {
    service,
    kpiRepository,
    periodRepository,
    employeeRepository,
    dataSource: dataSource as unknown as Harness['dataSource'],
    hrAccess,
  };
}

describe('EmployeeKpiService', () => {
  it('derives the employee and reviewer from the authenticated employee record', async () => {
    const test = harness();
    test.kpiRepository.findOne.mockImplementation(async ({ where }) => ({
      ...test.kpiRepository.save.mock.calls[0]?.[0],
      id: where.id,
      version: 1,
      performancePeriod: period(),
      reviewHistory: [],
    }));

    await test.service.create(actor, dto());

    expect(test.kpiRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 1,
        employeeId: 11,
        reviewerEmployeeId: 22,
        status: EmployeeKpiStatusEnum.DRAFT,
      }),
    );
  });

  it('blocks KPI creation when the period is closed', async () => {
    const test = harness();
    test.periodRepository.findOne.mockResolvedValue(
      period(PerformancePeriodStatusEnum.LOCKED),
    );

    await expect(test.service.create(actor, dto())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('allows drafts below 100 but rejects period submission below the configured total', async () => {
    const test = harness();
    const draft = {
      id: 7,
      companyId: 1,
      employeeId: 11,
      performancePeriodId: 3,
      status: EmployeeKpiStatusEnum.DRAFT,
      weight: '60',
    } as EmployeeKpi;
    const manager = {
      getRepository: jest.fn((entity: object) => {
        if (entity === PerformancePeriod) {
          return { findOne: jest.fn().mockResolvedValue(period()) };
        }
        return {
          find: jest.fn().mockResolvedValue([draft]),
          save: jest.fn(),
        };
      }),
    } as unknown as EntityManager;
    test.dataSource.transaction.mockImplementation(
      async (callback: (entityManager: EntityManager) => unknown) =>
        callback(manager),
    );

    await expect(test.service.submitPeriod(actor, 3)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('prevents an unrelated manager from reviewing a KPI', async () => {
    const test = harness();
    const submitted = {
      id: 7,
      companyId: 1,
      employeeId: 11,
      reviewerEmployeeId: 22,
      status: EmployeeKpiStatusEnum.SUBMITTED,
      performancePeriod: period(),
    } as EmployeeKpi;
    test.kpiRepository.findOne.mockResolvedValue(submitted);

    await expect(
      test.service.review({ ...actor, employeeId: 99 }, 7, {
        decision: EmployeeKpiReviewDecisionEnum.APPROVE,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('moves a submitted KPI through pending review before approval', async () => {
    const test = harness();
    const submitted = {
      id: 7,
      companyId: 1,
      employeeId: 11,
      reviewerEmployeeId: 22,
      status: EmployeeKpiStatusEnum.SUBMITTED,
      weight: '100',
      version: 1,
      performancePeriod: period(),
    } as EmployeeKpi;
    const savedStatuses: EmployeeKpiStatusEnum[] = [];
    test.kpiRepository.findOne.mockResolvedValue(submitted);
    test.kpiRepository.find.mockResolvedValue([submitted]);
    test.hrAccess.getReportingEmployeeIds.mockResolvedValue([
      submitted.employeeId,
    ]);
    test.kpiRepository.save.mockImplementation(async (value: EmployeeKpi) => {
      savedStatuses.push(value.status);
      return { ...value, version: value.version + 1 };
    });

    await test.service.review({ ...actor, employeeId: 22 }, 7, {
      decision: EmployeeKpiReviewDecisionEnum.APPROVE,
    });

    expect(savedStatuses).toEqual([
      EmployeeKpiStatusEnum.PENDING_REVIEW,
      EmployeeKpiStatusEnum.APPROVED,
    ]);
  });

  it('prevents an approved KPI from being edited', async () => {
    const test = harness();
    test.kpiRepository.findOne.mockResolvedValue({
      id: 7,
      companyId: 1,
      employeeId: 11,
      status: EmployeeKpiStatusEnum.APPROVED,
      performancePeriod: period(),
    } as EmployeeKpi);

    await expect(
      test.service.update(actor, 7, { title: 'Changed title' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
