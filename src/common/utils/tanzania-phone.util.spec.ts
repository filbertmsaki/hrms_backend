import {
  isTanzaniaPhone,
  normalizeTanzaniaPhone,
  toSmsGatewayMsisdn,
} from './tanzania-phone.util';

describe('tanzania phone util', () => {
  it('normalizes supported Tanzania phone inputs to +255 format', () => {
    expect(normalizeTanzaniaPhone('+255762650393')).toBe('+255762650393');
    expect(normalizeTanzaniaPhone('255762650393')).toBe('+255762650393');
    expect(normalizeTanzaniaPhone('0762650393')).toBe('+255762650393');
    expect(normalizeTanzaniaPhone('+255 762 650 393')).toBe('+255762650393');
  });

  it('rejects non-Tanzania or malformed phone numbers', () => {
    expect(normalizeTanzaniaPhone('+254712345678')).toBeNull();
    expect(normalizeTanzaniaPhone('762650393')).toBeNull();
    expect(isTanzaniaPhone('123')).toBe(false);
  });

  it('converts canonical Tanzania numbers to SMS gateway msisdn format', () => {
    expect(toSmsGatewayMsisdn('+255762650393')).toBe('255762650393');
  });
});
