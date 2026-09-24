import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PayrollOvertimeApprovalQueryDto } from './payroll.dto';

describe('PayrollOvertimeApprovalQueryDto', () => {
  it('accepts standard pagination query parameters', async () => {
    const dto = plainToInstance(PayrollOvertimeApprovalQueryDto, {
      page: '1',
      limit: '100',
      status: 'PENDING',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual([]);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(100);
  });
});
