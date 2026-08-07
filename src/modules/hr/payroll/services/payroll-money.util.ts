import Decimal from 'decimal.js';

export class PayrollMoney {
  private static decimalOf(value: string | number | null | undefined): Decimal {
    if (value === null || value === undefined || value === '') {
      return new Decimal(0);
    }

    return new Decimal(String(value).trim() || '0');
  }

  private static fromDecimal(value: Decimal): string {
    return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  }

  static toCents(value: string | number | null | undefined): bigint {
    if (value === null || value === undefined || value === '') {
      return 0n;
    }

    const raw = String(value).trim();
    const sign = raw.startsWith('-') ? -1n : 1n;
    const normalized = raw.replace(/^-/, '');
    const [wholeRaw, fractionRaw = ''] = normalized.split('.');
    const whole = BigInt(wholeRaw || '0') * 100n;
    const fraction = BigInt((fractionRaw + '00').slice(0, 2));
    return sign * (whole + fraction);
  }

  static fromCents(cents: bigint): string {
    const sign = cents < 0n ? '-' : '';
    const absolute = cents < 0n ? -cents : cents;
    const whole = absolute / 100n;
    const fraction = absolute % 100n;
    return `${sign}${whole}.${fraction.toString().padStart(2, '0')}`;
  }

  static add(...values: Array<string | number | null | undefined>): string {
    return this.fromCents(values.reduce((sum, value) => sum + this.toCents(value), 0n));
  }

  static multiplyPercent(value: string | number, percent: string | number): string {
    return this.fromDecimal(
      this.decimalOf(value).times(this.decimalOf(percent)).div(100),
    );
  }

  static multiplyFactor(value: string | number, factor: string | number): string {
    return this.fromDecimal(this.decimalOf(value).times(this.decimalOf(factor)));
  }

  static multiplyRatio(
    value: string | number,
    numerator: number | bigint,
    denominator: number | bigint,
  ): string {
    const resolvedDenominator = BigInt(denominator);

    if (resolvedDenominator <= 0n) {
      return '0.00';
    }

    return this.fromDecimal(
      this.decimalOf(value).times(String(numerator)).div(String(resolvedDenominator)),
    );
  }

  static min(left: string | number, right: string | number): string {
    const leftCents = this.toCents(left);
    const rightCents = this.toCents(right);
    return this.fromCents(leftCents < rightCents ? leftCents : rightCents);
  }
}
