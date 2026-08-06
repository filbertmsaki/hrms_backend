export class PayrollMoney {
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
    const cents = this.toCents(value);
    const basisPoints = BigInt(Math.round(Number(percent) * 10000));
    return this.fromCents((cents * basisPoints + 500000n) / 1000000n);
  }

  static multiplyFactor(value: string | number, factor: number): string {
    const cents = this.toCents(value);
    const scaled = BigInt(Math.round(factor * 1000000));
    return this.fromCents((cents * scaled + 500000n) / 1000000n);
  }

  static min(left: string | number, right: string | number): string {
    const leftCents = this.toCents(left);
    const rightCents = this.toCents(right);
    return this.fromCents(leftCents < rightCents ? leftCents : rightCents);
  }
}
