import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DownloadAttendanceReportDto } from './download-attendance-report.dto';

describe('DownloadAttendanceReportDto', () => {
  it('accepts supported formats case-insensitively', async () => {
    const dto = plainToInstance(DownloadAttendanceReportDto, {
      format: 'PDF',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.format).toBe('pdf');
  });

  it('returns a clear validation error for unsupported formats', async () => {
    const dto = plainToInstance(DownloadAttendanceReportDto, {
      format: 'docx',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.constraints?.isEnum).toBe(
      'format must be one of: xlsx, csv, pdf',
    );
  });
});
