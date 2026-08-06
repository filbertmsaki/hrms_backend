export class EmployeeFinanceMoney {
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

  static multiply(value: string | number, factor: number) {
    return this.fromCents((this.toCents(value) * BigInt(Math.round(factor * 1000000))) / 1000000n);
  }

  static divide(value: string | number, divisor: number) {
    if (divisor <= 0) return '0.00';
    return this.fromCents(this.toCents(value) / BigInt(divisor));
  }

  static min(left: string | number, right: string | number) {
    const leftCents = this.toCents(left);
    const rightCents = this.toCents(right);
    return this.fromCents(leftCents < rightCents ? leftCents : rightCents);
  }
}
