import { BadRequestException } from '@nestjs/common';
import { CompaniesService } from './companies.service';

describe('CompaniesService timezone metadata validation', () => {
  const service = Object.create(CompaniesService.prototype) as {
    assertValidTimezoneMetadata(
      metadata?: Record<string, unknown> | null,
    ): void;
  };

  it('allows timezone omission while company configuration is incomplete', () => {
    expect(() => service.assertValidTimezoneMetadata(undefined)).not.toThrow();
    expect(() =>
      service.assertValidTimezoneMetadata({ timezone: null }),
    ).not.toThrow();
  });

  it('accepts valid IANA zones and rejects invalid values', () => {
    expect(() =>
      service.assertValidTimezoneMetadata({ timezone: 'Africa/Dar_es_Salaam' }),
    ).not.toThrow();
    expect(() =>
      service.assertValidTimezoneMetadata({ timezone: 'Not/A_Timezone' }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.assertValidTimezoneMetadata({ timezone: ' ' }),
    ).toThrow(BadRequestException);
  });
});
