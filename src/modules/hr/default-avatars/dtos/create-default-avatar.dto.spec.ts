import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDefaultAvatarDto } from './create-default-avatar.dto';
import { DefaultAvatarGenderEnum } from '../enums/default-avatar-gender.enum';

describe('CreateDefaultAvatarDto', () => {
  it('rejects a payload without an image file', async () => {
    const dto = plainToInstance(CreateDefaultAvatarDto, {
      avatar_name: 'Male Avatar 01',
      gender_category: DefaultAvatarGenderEnum.MALE,
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});
