import { BadRequestException } from '@nestjs/common';
import { ProfileChangeRequestTypeEnum } from './enums/profile-change-request-type.enum';
import { ProfileChangeFieldPolicyService } from './profile-change-field-policy.service';

describe('ProfileChangeFieldPolicyService', () => {
  const service = new ProfileChangeFieldPolicyService();

  it('accepts an uploaded profile picture as an approval-backed field', () => {
    const policy = service.getPolicy('profile_photo_file');

    expect(policy).toMatchObject({
      editable_by_employee: true,
      requires_approval: true,
      request_types: [ProfileChangeRequestTypeEnum.PROFILE_PHOTO],
    });
    expect(
      service.isFieldAllowedForRequestType(
        'profile_photo_file',
        ProfileChangeRequestTypeEnum.PROFILE_PHOTO,
      ),
    ).toBe(true);
  });

  it('continues rejecting unknown profile fields', () => {
    expect(() => service.getPolicy('unknown_field')).toThrow(
      BadRequestException,
    );
  });
});
