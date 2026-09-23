import { BadRequestException } from '@nestjs/common';
import { ReportOutputFormatEnum } from '../enums/report-output-format.enum';
import { ReportRegistryService } from './report-registry.service';

describe('ReportRegistryService', () => {
  let service: ReportRegistryService;

  beforeEach(() => {
    service = new ReportRegistryService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('returns the registered attendance summary definition', () => {
    const definition: ReturnType<ReportRegistryService['require']> =
      service.require('ATTENDANCE_SUMMARY');

    expect(definition.reportCode).toBe('ATTENDANCE_SUMMARY');
    expect(definition.supportedFormats).toEqual(
      expect.arrayContaining([
        ReportOutputFormatEnum.CSV,
        ReportOutputFormatEnum.PDF,
        ReportOutputFormatEnum.XLSX,
      ]),
    );
  });

  it('rejects an unknown report code', () => {
    expect(() => service.require('ATTENDANCE_UNKNOWN_REPORT')).toThrow(
      new BadRequestException(
        'The selected report "ATTENDANCE_UNKNOWN_REPORT" is not registered or implemented and cannot be scheduled.',
      ),
    );
  });

  it('rejects unsupported formats', () => {
    expect(() =>
      service.ensureFormatSupported(
        'ATTENDANCE_SUMMARY',
        'DOCX' as ReportOutputFormatEnum,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects unsupported filters', () => {
    expect(() =>
      service.ensureFiltersSupported('ATTENDANCE_SUMMARY', {
        date_from: '2026-07-01',
        unsupported_filter: true,
      }),
    ).toThrow(
      'The selected report "ATTENDANCE_SUMMARY" does not support these filters: unsupported_filter.',
    );
  });

  it('registers new operational analytics reports for scheduling', () => {
    expect(service.require('KPI_TARGET_VS_ACHIEVEMENT')).toMatchObject({
      reportCode: 'KPI_TARGET_VS_ACHIEVEMENT',
      generatorService: 'OperationalAnalyticsReportRunner',
      supportedFormats: expect.arrayContaining([
        ReportOutputFormatEnum.CSV,
        ReportOutputFormatEnum.PDF,
        ReportOutputFormatEnum.XLSX,
      ]),
    });
    expect(service.require('ATTENDANCE_EXCEPTIONS')).toMatchObject({
      reportCode: 'ATTENDANCE_EXCEPTIONS',
      generatorService: 'OperationalAnalyticsReportRunner',
    });
  });

  it('routes operational report codes to the shared operational runner', () => {
    const runner = { reportCode: 'OPERATIONAL_ANALYTICS' };
    service = new ReportRegistryService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      runner as never,
    );

    expect(service.requireRunner('MONTHLY_KPI_SCORE')).toBe(runner);
    expect(service.requireRunner('ATTENDANCE_CORRECTIONS')).toBe(runner);
  });
});
