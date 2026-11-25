import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateFieldVisitPlanItemDto } from './field-visit.dto';
import { FieldVisitTypeEnum } from '../enums/work-activity.enums';

describe('CreateFieldVisitPlanItemDto coordinates', () => {
  const payload = {
    visit_type: FieldVisitTypeEnum.CUSTOMER_VISIT,
    purpose: 'Renewal discussion',
  };

  it('accepts precise GPS coordinates', async () => {
    const errors = await validate(
      plainToInstance(CreateFieldVisitPlanItemDto, {
        ...payload,
        latitude: -6.816123,
        longitude: 39.280456,
      }),
    );
    expect(errors).toEqual([]);
  });

  it.each([
    { latitude: -91 },
    { latitude: 91 },
    { longitude: -181 },
    { longitude: 181 },
  ])('rejects out-of-range coordinates: %o', async (coordinates) => {
    const errors = await validate(
      plainToInstance(CreateFieldVisitPlanItemDto, {
        ...payload,
        ...coordinates,
      }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe(Object.keys(coordinates)[0]);
  });

  it('validates a visit name and an existing item id', async () => {
    const valid = plainToInstance(CreateFieldVisitPlanItemDto, {
      ...payload,
      id: 2,
      visit_name: 'Renewal meeting',
    });
    expect(await validate(valid)).toEqual([]);
    const invalid = plainToInstance(CreateFieldVisitPlanItemDto, {
      ...payload,
      id: 0,
      visit_name: 'x'.repeat(201),
    });
    expect((await validate(invalid)).map((item) => item.property)).toEqual(
      expect.arrayContaining(['id', 'visit_name']),
    );
  });
});
