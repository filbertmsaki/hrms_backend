import { BadRequestException, ConflictException } from '@nestjs/common';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceCorrectionRequest } from './entities/attendance-correction-request.entity';
import { AttendanceCorrectionDocument } from './entities/attendance-correction-document.entity';
import { SelfServiceRequestStatusEnum } from './enums/self-service-request-status.enum';
import { EmployeeSelfServiceService } from './employee-self-service.service';

function harness(
  options: {
    policy?: Record<string, unknown> | null;
    attendanceStatus?: string | null;
    evidenceCount?: number;
    duplicate?: boolean;
    lockedPeriod?: boolean;
    monthlyCount?: number;
  } = {},
) {
  const request: Partial<AttendanceCorrectionRequest> = {
    id: 51,
    companyId: 7,
    employeeId: 15,
    attendanceDate: '2026-10-22',
    requestType: 'check_in' as never,
    requestedCheckInAt: new Date('2026-10-22T08:00:00Z'),
    requestedCheckOutAt: null,
    requestedStatus: null,
    reason: 'Clock device was offline',
    status: SelfServiceRequestStatusEnum.DRAFT,
    submittedAt: null,
  };
  const builder: Record<string, jest.Mock> = {};
  for (const method of ['where', 'andWhere', 'orderBy', 'skip', 'take']) {
    builder[method] = jest.fn(() => builder);
  }
  builder.getOne = jest.fn(async () => (options.duplicate ? { id: 99 } : null));
  builder.getCount = jest.fn(async () => options.monthlyCount ?? 0);

  const correctionRepository = {
    findOne: jest.fn(async () => request),
    createQueryBuilder: jest.fn(() => builder),
    save: jest.fn(async (value: AttendanceCorrectionRequest) => value),
  };
  const summaryRepository = {
    findOne: jest.fn(async () =>
      options.attendanceStatus
        ? { attendanceStatus: options.attendanceStatus }
        : null,
    ),
  };
  const documentRepository = {
    count: jest.fn(async () => options.evidenceCount ?? 0),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === AttendanceCorrectionRequest) return correctionRepository;
      if (entity === AttendanceDailySummary) return summaryRepository;
      if (entity === AttendanceCorrectionDocument) return documentRepository;
      throw new Error('Unexpected repository');
    }),
    query: jest.fn(async (sql: string) =>
      sql.includes('payroll_periods') && options.lockedPeriod
        ? [{ id: 3 }]
        : [],
    ),
  };
  const service = Object.create(
    EmployeeSelfServiceService.prototype,
  ) as EmployeeSelfServiceService & Record<string, unknown>;
  service.ensureCompanyId = jest.fn(() => 7);
  service.resolveEmployeeId = jest.fn(async () => 15);
  service.getCurrentDateString = jest.fn(() => '2026-10-22');
  service.correctionRequestRepository = {
    manager: {
      transaction: (callback: (m: typeof manager) => unknown) =>
        callback(manager),
    },
  } as never;
  service.attendanceCompanyConfigService = options.policy
    ? { resolveRuntimeDefaults: jest.fn(async () => options.policy) }
    : { resolveRuntimeDefaults: jest.fn(async () => null) };
  return {
    service,
    request,
    correctionRepository,
    summaryRepository,
    documentRepository,
    manager,
    builder,
  };
}

describe('attendance regularization policy enforcement', () => {
  const actor = { companyId: 7, employeeId: 15 } as never;

  it('stores evidence privately and returns only an authenticated download route', async () => {
    const service = Object.create(
      EmployeeSelfServiceService.prototype,
    ) as EmployeeSelfServiceService & Record<string, unknown>;
    const draft = { id: 51, status: SelfServiceRequestStatusEnum.DRAFT };
    const save = jest.fn(async (document) => ({
      id: 80,
      uploadedAt: new Date(),
      ...document,
    }));
    service.ensureCompanyId = jest.fn(() => 7);
    service.resolveEmployeeId = jest.fn(async () => 15);
    service.correctionRequestRepository = {
      findOne: jest.fn(async () => draft),
    } as never;
    service.correctionDocumentRepository = {
      create: jest.fn((document) => document),
      save,
    } as never;
    service.filesService = {
      savePrivateBase64File: jest.fn(async () => ({
        publicPath:
          '/private-uploads/documents/attendance-corrections/test.pdf',
        originalFileName: 'support.pdf',
        mimeType: 'application/pdf',
      })),
    } as never;

    const uploaded = await service.addMyCorrectionDocument(actor, 51, {
      file: {
        fileName: 'support.pdf',
        fileString: 'JVBERi0x',
        fileSize: 6,
        mimeType: 'application/pdf',
      },
    });

    expect(service.filesService.savePrivateBase64File).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'support.pdf' }),
      expect.objectContaining({
        directorySegments: ['documents', 'attendance-corrections', 'company-7'],
        validateFileSignature: true,
      }),
    );
    expect(uploaded).toMatchObject({
      id: 80,
      file_name: 'support.pdf',
      file_url:
        '/api/me/attendance/correction-requests/51/documents/80/download',
    });
  });

  it('does not accept evidence uploads after a correction request is submitted', async () => {
    const service = Object.create(
      EmployeeSelfServiceService.prototype,
    ) as EmployeeSelfServiceService & Record<string, unknown>;
    service.ensureCompanyId = jest.fn(() => 7);
    service.resolveEmployeeId = jest.fn(async () => 15);
    service.correctionRequestRepository = {
      findOne: jest.fn(async () => ({
        id: 51,
        status: SelfServiceRequestStatusEnum.SUBMITTED,
      })),
    } as never;
    service.filesService = { savePrivateBase64File: jest.fn() } as never;

    await expect(
      service.addMyCorrectionDocument(actor, 51, { file: {} as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.filesService.savePrivateBase64File).not.toHaveBeenCalled();
  });

  it('requires evidence only when the effective policy turns it on', async () => {
    const h = harness({ policy: { regularization_evidence_required: true } });
    await expect(
      h.service.submitMyCorrectionRequest(actor, 51),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.documentRepository.count).toHaveBeenCalledWith({
      where: { companyId: 7, requestId: 51 },
    });
    expect(h.request.status).toBe(SelfServiceRequestStatusEnum.DRAFT);
  });

  it('allows submission when required evidence is attached and policy permits the status', async () => {
    const h = harness({
      policy: {
        regularization_evidence_required: true,
        regularization_eligible_statuses: ['MISSING_CHECK_IN'],
      },
      attendanceStatus: 'MISSING_CHECK_IN',
      evidenceCount: 1,
    });
    const result = await h.service.submitMyCorrectionRequest(actor, 51);
    expect(result.status).toBe(SelfServiceRequestStatusEnum.SUBMITTED);
    expect(h.request.submittedAt).toBeInstanceOf(Date);
  });

  it('rejects an attendance status that is excluded by policy', async () => {
    const h = harness({
      policy: { regularization_eligible_statuses: ['ABSENT'] },
      attendanceStatus: 'PRESENT',
    });
    await expect(
      h.service.submitMyCorrectionRequest(actor, 51),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.request.status).toBe(SelfServiceRequestStatusEnum.DRAFT);
  });

  it('treats a missing summary as NO_SUMMARY for eligibility checks', async () => {
    const h = harness({
      policy: { regularization_eligible_statuses: ['NO_SUMMARY'] },
    });
    const result = await h.service.submitMyCorrectionRequest(actor, 51);
    expect(result.status).toBe(SelfServiceRequestStatusEnum.SUBMITTED);
  });

  it('rejects a second submitted or approved request for the same employee and date', async () => {
    const h = harness({ duplicate: true });
    await expect(
      h.service.submitMyCorrectionRequest(actor, 51),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects submission after payroll input closes', async () => {
    const h = harness({ lockedPeriod: true });
    await expect(
      h.service.submitMyCorrectionRequest(actor, 51),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('enforces the monthly submitted-request cap', async () => {
    const h = harness({
      policy: { regularization_monthly_request_limit: 2 },
      monthlyCount: 2,
    });
    await expect(
      h.service.submitMyCorrectionRequest(actor, 51),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
