import { BadRequestException } from '@nestjs/common';
import Decimal from 'decimal.js';

export class EmployeeFinanceMoney {
  private static decimalOf(value: string | number | null | undefined): Decimal {
    if (value === null || value === undefined || value === '')
      return new Decimal(0);
    return new Decimal(String(value).trim() || '0');
  }

  private static fromDecimal(value: Decimal): string {
    return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  }

  static toCents(value: string | number | null | undefined): bigint {
    // Optional persisted monetary fields retain their established zero default.
    if (value === null || value === undefined) return 0n;
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new BadRequestException(
        'Money must be a decimal string or a finite number.',
      );
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new BadRequestException('Money must be finite.');
    }
    const raw = String(value);
    // Internal arithmetic may produce negative balances; request DTOs disallow them.
    // Never silently truncate excess decimal places or accept exponent notation.
    if (raw.length > 64 || !/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw)) {
      throw new BadRequestException(
        'Money must use a decimal format with at most two fractional digits.',
      );
    }
    try {
      const sign = raw.startsWith('-') ? -1n : 1n;
      const [whole, fraction = ''] = raw.replace(/^-/, '').split('.');
      const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
      // Numeric callers must not pass amounts whose integer cents lose precision.
      if (
        typeof value === 'number' &&
        cents > BigInt(Number.MAX_SAFE_INTEGER)
      ) {
        throw new BadRequestException(
          'Large monetary values must be provided as decimal strings.',
        );
      }
      return sign * cents;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Invalid monetary value.');
    }
  }

  static fromCents(cents: bigint): string {
    const sign = cents < 0n ? '-' : '';
    const absolute = cents < 0n ? -cents : cents;
    return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
  }

  static add(...values: Array<string | number | null | undefined>) {
    return this.fromCents(
      values.reduce((sum, value) => sum + this.toCents(value), 0n),
    );
  }

  static subtract(left: string | number, right: string | number) {
    return this.fromCents(this.toCents(left) - this.toCents(right));
  }

  static multiply(value: string | number, factor: string | number) {
    return this.fromDecimal(
      this.decimalOf(value).times(this.decimalOf(factor)),
    );
  }

  static multiplyPercent(value: string | number, percent: string | number) {
    return this.fromDecimal(
      this.decimalOf(value).times(this.decimalOf(percent)).div(100),
    );
  }

  static multiplyRatio(
    value: string | number,
    numerator: number | bigint,
    denominator: number | bigint,
  ) {
    const resolvedDenominator = BigInt(denominator);

    if (resolvedDenominator <= 0n) return '0.00';

    return this.fromDecimal(
      this.decimalOf(value)
        .times(String(numerator))
        .div(String(resolvedDenominator)),
    );
  }

  static divide(value: string | number, divisor: number) {
    if (divisor <= 0) return '0.00';
    return this.fromDecimal(this.decimalOf(value).div(divisor));
  }

  static min(left: string | number, right: string | number) {
    const leftCents = this.toCents(left);
    const rightCents = this.toCents(right);
    return this.fromCents(leftCents < rightCents ? leftCents : rightCents);
  }

  static percentage(numerator: bigint, denominator: bigint): string {
    if (denominator <= 0n) return '0.00';
    return this.fromDecimal(
      new Decimal(numerator.toString()).times(100).div(denominator.toString()),
    );
  }
}
