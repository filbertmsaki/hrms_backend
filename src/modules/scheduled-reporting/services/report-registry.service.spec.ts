import { BadRequestException } from '@nestjs/common';
import { ReportOutputFormatEnum } from '../enums/report-output-format.enum';
import { ReportRegistryService } from './report-registry.service';

describe('ReportRegistryService', () => {
  let service: ReportRegistryService;

  beforeEach(() => {
    service = new ReportRegistryService(
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
});
