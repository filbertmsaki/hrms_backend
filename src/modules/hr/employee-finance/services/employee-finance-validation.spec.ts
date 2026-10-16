import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateEmployeeFinanceApplicationDto,
  EvaluateEmployeeFinanceEligibilityDto,
  EvaluateMyEmployeeFinanceEligibilityDto,
} from '../dto/employee-finance.dto';
import { EmployeeFinanceMoney } from './employee-finance-money.util';

describe('finance boundary validation', () => {
  const payload = {
    product_id: 1,
    employee_id: 2,
    requested_amount: '100.50',
    requested_term_months: 12,
    purpose: 'Travel',
  };
  const types = [
    CreateEmployeeFinanceApplicationDto,
    EvaluateEmployeeFinanceEligibilityDto,
    EvaluateMyEmployeeFinanceEligibilityDto,
  ];
  for (const type of types) {
    describe(type.name, () => {
      async function errors(overrides: Record<string, unknown>) {
        const fields: Record<string, unknown> = { ...payload, ...overrides };
        if (type !== EvaluateEmployeeFinanceEligibilityDto)
          delete fields.employee_id;
        if (type !== CreateEmployeeFinanceApplicationDto) delete fields.purpose;
        return validate(plainToInstance(type, fields), {
          whitelist: true,
          forbidNonWhitelisted: true,
        });
      }
      it.each([
        'abc',
        '1e3',
        '-1',
        '.50',
        '01.00',
        '1.234',
        '',
        ' 1.00 ',
        '1'.repeat(19),
      ])('rejects malformed amount %s', async (amount) => {
        expect(
          (await errors({ requested_amount: amount })).some(
            (error) => error.property === 'requested_amount',
          ),
        ).toBe(true);
      });
      it.each([0, -1, 1.5, 601, 'banana', Infinity])(
        'rejects invalid term %s',
        async (term) => {
          expect(
            (await errors({ requested_term_months: term })).some(
              (error) => error.property === 'requested_term_months',
            ),
          ).toBe(true);
        },
      );
      it.each([1, 600])('accepts boundary term %s', async (term) => {
        expect(await errors({ requested_term_months: term })).toHaveLength(0);
      });
    });
  }

  it.each(['abc', '1.234', '1e3', '', ' 1.00 ', Infinity, NaN])(
    'returns a handled 400 for invalid money %s',
    (value) => {
      expect(() => EmployeeFinanceMoney.toCents(value)).toThrow(
        BadRequestException,
      );
      try {
        EmployeeFinanceMoney.toCents(value);
      } catch (error) {
        expect((error as BadRequestException).getStatus()).toBe(400);
      }
    },
  );
  it('preserves exact large decimal strings and negative internal arithmetic', () => {
    expect(EmployeeFinanceMoney.toCents('999999999999999.99')).toBe(
      99999999999999999n,
    );
    expect(EmployeeFinanceMoney.subtract('10.00', '12.50')).toBe('-2.50');
    expect(EmployeeFinanceMoney.toCents(null)).toBe(0n);
    expect(EmployeeFinanceMoney.toCents(undefined)).toBe(0n);
  });
});
