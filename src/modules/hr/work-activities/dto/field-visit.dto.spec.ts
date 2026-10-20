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
});
