export const TANZANIA_PHONE_CANONICAL_REGEX = /^\+255\d{9}$/;
export const TANZANIA_OR_UGANDA_PHONE_CANONICAL_REGEX = /^\+(?:255|256)\d{9}$/;
const TANZANIA_PHONE_FLEX_REGEX = /^(?:\+255\d{9}|255\d{9}|0\d{9})$/;
const UGANDA_PHONE_FLEX_REGEX = /^(?:\+256\d{9}|256\d{9})$/;

export function normalizeTanzaniaPhone(
  value: string | null | undefined,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const compact = value.replace(/[\s()-]/g, '').trim();
  if (!compact) {
    return null;
  }

  if (!TANZANIA_PHONE_FLEX_REGEX.test(compact)) {
    return null;
  }

  if (compact.startsWith('+255')) {
    return compact;
  }

  if (compact.startsWith('255')) {
    return `+${compact}`;
  }

  return `+255${compact.slice(1)}`;
}

export function isTanzaniaPhone(
  value: string | null | undefined,
): value is string {
  return normalizeTanzaniaPhone(value) !== null;
}

export function normalizeTanzaniaOrUgandaPhone(
  value: string | null | undefined,
): string | null {
  const tanzaniaPhone = normalizeTanzaniaPhone(value);
  if (tanzaniaPhone) {
    return tanzaniaPhone;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const compact = value.replace(/[\s()-]/g, '').trim();
  if (!UGANDA_PHONE_FLEX_REGEX.test(compact)) {
    return null;
  }

  if (compact.startsWith('+256')) {
    return compact;
  }

  if (compact.startsWith('256')) {
    return `+${compact}`;
  }

  return null;
}

export function toSmsGatewayMsisdn(phone: string): string {
  const normalized = normalizeTanzaniaPhone(phone);
  if (!normalized) {
    throw new Error(
      'Phone number must be a valid Tanzanian number in +255 format',
    );
  }

  return normalized.slice(1);
}
