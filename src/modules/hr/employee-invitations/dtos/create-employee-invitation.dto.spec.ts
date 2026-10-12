import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EmploymentTypeEnum } from '../../employees/enums/employment-type.enum';
import { CreateEmployeeInvitationDto } from './create-employee-invitation.dto';

describe('CreateEmployeeInvitationDto channels', () => {
  const base = {
    first_name: 'Amina',
    last_name: 'Moshi',
    gender: 'female',
    email: 'amina@example.com',
    phone: '+255712345678',
    primary_branch_id: 2,
    primary_department_id: 5,
    primary_position_id: 9,
    employment_type: EmploymentTypeEnum.FULL_TIME,
  };

  async function channelErrors(channels: unknown): Promise<string[]> {
    const dto = plainToInstance(CreateEmployeeInvitationDto, {
      ...base,
      channels,
    });
    const errors = await validate(dto);
    return errors
      .filter((error) => error.property === 'channels')
      .flatMap((error) => Object.values(error.constraints ?? {}));
  }

  it.each([[['EMAIL']], [['EMAIL', 'SMS']], [['SMS', 'EMAIL']]])(
    'accepts %j',
    async (channels) => {
      await expect(channelErrors(channels)).resolves.toEqual([]);
    },
  );

  it('rejects SMS-only because the link is only sent by email', async () => {
    await expect(channelErrors(['SMS'])).resolves.toContain(
      'Email is required for invitations; SMS can only be added as a reminder',
    );
  });

  it.each([
    ['empty', []],
    ['duplicate', ['EMAIL', 'EMAIL']],
    ['unknown channel', ['EMAIL', 'WHATSAPP']],
    ['missing', undefined],
  ])('rejects %s channels', async (_label, channels) => {
    const errors = await channelErrors(channels);
    expect(errors.length).toBeGreaterThan(0);
  });
});
