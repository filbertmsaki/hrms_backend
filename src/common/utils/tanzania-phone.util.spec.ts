import {
  isTanzaniaPhone,
  normalizeTanzaniaPhone,
  normalizeTanzaniaOrUgandaPhone,
  toSmsGatewayMsisdn,
} from './tanzania-phone.util';

describe('tanzania phone util', () => {
  it('normalizes supported Tanzania phone inputs to +255 format', () => {
    expect(normalizeTanzaniaPhone('+255762650393')).toBe('+255762650393');
    expect(normalizeTanzaniaPhone('255762650393')).toBe('+255762650393');
    expect(normalizeTanzaniaPhone('0762650393')).toBe('+255762650393');
    expect(normalizeTanzaniaPhone('0621991156')).toBe('+255621991156');
    expect(normalizeTanzaniaPhone('0712345678')).toBe('+255712345678');
    expect(normalizeTanzaniaPhone('+255 762 650 393')).toBe('+255762650393');
    expect(normalizeTanzaniaPhone('(0621) 991-156')).toBe('+255621991156');
  });

  it('rejects non-Tanzania or malformed phone numbers', () => {
    expect(normalizeTanzaniaPhone('+254712345678')).toBeNull();
    expect(normalizeTanzaniaPhone('762650393')).toBeNull();
    expect(isTanzaniaPhone('123')).toBe(false);
  });

  it('normalizes supported Tanzania and Uganda inputs for company administrators', () => {
    expect(normalizeTanzaniaOrUgandaPhone('0762650393')).toBe('+255762650393');
    expect(normalizeTanzaniaOrUgandaPhone('+256772123456')).toBe(
      '+256772123456',
    );
    expect(normalizeTanzaniaOrUgandaPhone('256772123456')).toBe(
      '+256772123456',
    );
    expect(normalizeTanzaniaOrUgandaPhone('0772123456')).toBe('+255772123456');
    expect(normalizeTanzaniaOrUgandaPhone('+254712345678')).toBeNull();
  });

  it('converts canonical Tanzania numbers to SMS gateway msisdn format', () => {
    expect(toSmsGatewayMsisdn('+255762650393')).toBe('255762650393');
  });
});
