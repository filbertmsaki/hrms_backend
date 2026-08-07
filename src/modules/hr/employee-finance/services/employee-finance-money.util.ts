import Decimal from 'decimal.js';

export class EmployeeFinanceMoney {
  private static decimalOf(value: string | number | null | undefined): Decimal {
    if (value === null || value === undefined || value === '') return new Decimal(0);
    return new Decimal(String(value).trim() || '0');
  }

  private static fromDecimal(value: Decimal): string {
    return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  }

  static toCents(value: string | number | null | undefined): bigint {
    if (value === null || value === undefined || value === '') return 0n;
    const raw = String(value).trim();
    const sign = raw.startsWith('-') ? -1n : 1n;
    const normalized = raw.replace(/^-/, '');
    const [wholeRaw, fractionRaw = ''] = normalized.split('.');
    return sign * (BigInt(wholeRaw || '0') * 100n + BigInt((fractionRaw + '00').slice(0, 2)));
  }

  static fromCents(cents: bigint): string {
    const sign = cents < 0n ? '-' : '';
    const absolute = cents < 0n ? -cents : cents;
    return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
  }

  static add(...values: Array<string | number | null | undefined>) {
    return this.fromCents(values.reduce((sum, value) => sum + this.toCents(value), 0n));
  }

  static subtract(left: string | number, right: string | number) {
    return this.fromCents(this.toCents(left) - this.toCents(right));
  }

  static multiply(value: string | number, factor: string | number) {
    return this.fromDecimal(this.decimalOf(value).times(this.decimalOf(factor)));
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
      this.decimalOf(value).times(String(numerator)).div(String(resolvedDenominator)),
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
}
