import { BadRequestException, Injectable } from '@nestjs/common';
import { ProfileChangeFieldSourceEntityEnum } from './enums/profile-change-field-source-entity.enum';
import { ProfileChangeRequestTypeEnum } from './enums/profile-change-request-type.enum';

export type ProfileFieldPolicy = {
  field_name: string;
  source_entity: ProfileChangeFieldSourceEntityEnum;
  editable_by_employee: boolean;
  requires_approval: boolean;
  editable_by_hr: boolean;
  sensitive: boolean;
  validation_rules: string[];
  display_label: string;
  request_types: ProfileChangeRequestTypeEnum[];
  value_type: 'string' | 'email' | 'phone' | 'date' | 'number';
};

const PROFILE_FIELD_POLICIES: ProfileFieldPolicy[] = [
  {
    field_name: 'first_name',
    source_entity: ProfileChangeFieldSourceEntityEnum.USER,
    editable_by_employee: true,
    requires_approval: true,
    editable_by_hr: true,
    sensitive: false,
    validation_rules: ['required', 'string', 'max:100'],
    display_label: 'First Name',
    request_types: [ProfileChangeRequestTypeEnum.PERSONAL_INFORMATION],
    value_type: 'string',
  },
  {
    field_name: 'middle_name',
    source_entity: ProfileChangeFieldSourceEntityEnum.EMPLOYEE,
    editable_by_employee: true,
    requires_approval: true,
    editable_by_hr: true,
    sensitive: false,
    validation_rules: ['string', 'max:100'],
    display_label: 'Middle Name',
    request_types: [ProfileChangeRequestTypeEnum.PERSONAL_INFORMATION],
    value_type: 'string',
  },
  {
    field_name: 'last_name',
    source_entity: ProfileChangeFieldSourceEntityEnum.USER,
    editable_by_employee: true,
    requires_approval: true,
    editable_by_hr: true,
    sensitive: false,
    validation_rules: ['required', 'string', 'max:100'],
    display_label: 'Last Name',
    request_types: [ProfileChangeRequestTypeEnum.PERSONAL_INFORMATION],
    value_type: 'string',
  },
  {
    field_name: 'preferred_name',
    source_entity: ProfileChangeFieldSourceEntityEnum.EMPLOYEE,
    editable_by_employee: true,
    requires_approval: true,
    editable_by_hr: true,
    sensitive: false,
    validation_rules: ['string', 'max:100'],
    display_label: 'Preferred Name',
    request_types: [ProfileChangeRequestTypeEnum.PERSONAL_INFORMATION],
    value_type: 'string',
  },
  {
    field_name: 'gender',
    source_entity: ProfileChangeFieldSourceEntityEnum.EMPLOYEE,
    editable_by_employee: true,
    requires_approval: true,
    editable_by_hr: true,
    sensitive: true,
    validation_rules: ['enum:male,female'],
    display_label: 'Gender',
    request_types: [ProfileChangeRequestTypeEnum.PERSONAL_INFORMATION],
    value_type: 'string',
  },
  {
    field_name: 'date_of_birth',
    source_entity: ProfileChangeFieldSourceEntityEnum.EMPLOYEE,
    editable_by_employee: true,
    requires_approval: true,
    editable_by_hr: true,
    sensitive: true,
    validation_rules: ['date', 'past_or_today'],
    display_label: 'Date of Birth',
    request_types: [ProfileChangeRequestTypeEnum.PERSONAL_INFORMATION],
    value_type: 'date',
  },
  {
    field_name: 'marital_status',
    source_entity: ProfileChangeFieldSourceEntityEnum.EMPLOYEE,
    editable_by_employee: true,
    requires_approval: true,
    editable_by_hr: true,
    sensitive: true,
    validation_rules: ['string', 'max:30'],
    display_label: 'Marital Status',
    request_types: [ProfileChangeRequestTypeEnum.PERSONAL_INFORMATION],
    value_type: 'string',
  },
  {
    field_name: 'nationality',
    source_entity: ProfileChangeFieldSourceEntityEnum.EMPLOYEE,
    editable_by_employee: true,
    requires_approval: true,
    editable_by_hr: true,
    sensitive: false,
    validation_rules: ['string', 'max:100'],
    display_label: 'Nationality',
    request_types: [ProfileChangeRequestTypeEnum.PERSONAL_INFORMATION],
    value_type: 'string',
  },
  {
    field_name: 'phone',
    source_entity: ProfileChangeFieldSourceEntityEnum.USER,
    editable_by_employee: true,
    requires_approval: true,
    editable_by_hr: true,
    sensitive: true,
    validation_rules: ['required', 'phone', 'max:20'],
    display_label: 'Account Phone Number',
    request_types: [ProfileChangeRequestTypeEnum.CONTACT_INFORMATION],
    value_type: 'phone',
  },
  {
    field_name: 'email',
    source_entity: ProfileChangeFieldSourceEntityEnum.USER,
    editable_by_employee: true,
    requires_approval: true,
    editable_by_hr: true,
    sensitive: true,
    validation_rules: ['required', 'email', 'max:100'],
    display_label: 'Account Email Address',
    request_types: [ProfileChangeRequestTypeEnum.CONTACT_INFORMATION],
    value_type: 'email',
  },
  {
    field_name: 'personal_phone_number',
    source_entity: ProfileChangeFieldSourceEntityEnum.EMPLOYEE_CONTACT,
    editable_by_employee: true,
    requires_approval: true,
    editable_by_hr: true,
    sensitive: true,
    validation_rules: ['phone', 'max:30'],
    display_label: 'Personal Phone Number',
    request_types: [ProfileChangeRequestTypeEnum.CONTACT_INFORMATION],
    value_type: 'phone',
  },
  {
    field_name: 'personal_email',
    source_entity: ProfileChangeFieldSourceEntityEnum.EMPLOYEE_CONTACT,
    editable_by_employee: true,
    requires_approval: true,
    editable_by_hr: true,
    sensitive: true,
    validation_rules: ['email', 'max:150'],
    display_label: 'Personal Email Address',
    request_types: [ProfileChangeRequestTypeEnum.CONTACT_INFORMATION],
    value_type: 'email',
  },
  {
    field_name: 'address_line_1',
    source_entity: ProfileChangeFieldSourceEntityEnum.EMPLOYEE_ADDRESS,
    editable_by_employee: true,
    requires_approval: true,
    editable_by_hr: true,
    sensitive: true,
    validation_rules: ['string', 'max:255'],
    display_label: 'Address Line 1',
    request_types: [ProfileChangeRequestTypeEnum.ADDRESS_INFORMATION],
    value_type: 'string',
  },
  {
    field_name: 'address_line_2',
    source_entity: ProfileChangeFieldSourceEntityEnum.EMPLOYEE_ADDRESS,
    editable_by_employee: true,
    requires_approval: true,
    editable_by_hr: true,
    sensitive: true,
    validation_rules: ['string', 'max:255'],
    display_label: 'Address Line 2',
    request_types: [ProfileChangeRequestTypeEnum.ADDRESS_INFORMATION],
    value_type: 'string',
  },
  {
    field_name: 'city',
    source_entity: ProfileChangeFieldSourceEntityEnum.EMPLOYEE_ADDRESS,
    editable_by_employee: true,
    requires_approval: true,
    editable_by_hr: true,
    sensitive: true,
    validation_rules: ['string', 'max:100'],
    display_label: 'City',
    request_types: [ProfileChangeRequestTypeEnum.ADDRESS_INFORMATION],
    value_type: 'string',
  },
  {
    field_name: 'state',
    source_entity: ProfileChangeFieldSourceEntityEnum.EMPLOYEE_ADDRESS,
    editable_by_employee: true,
    requires_approval: true,
    editable_by_hr: true,
    sensitive: true,
    validation_rules: ['string', 'max:100'],
    display_label: 'State/Region',
    request_types: [ProfileChangeRequestTypeEnum.ADDRESS_INFORMATION],
    value_type: 'string',
  },
  {
    field_name: 'country',
    source_entity: ProfileChangeFieldSourceEntityEnum.EMPLOYEE_ADDRESS,
    editable_by_employee: true,
    requires_approval: true,
    editable_by_hr: true,
    sensitive: true,
    validation_rules: ['string', 'max:100'],
    display_label: 'Country',
    request_types: [ProfileChangeRequestTypeEnum.ADDRESS_INFORMATION],
    value_type: 'string',
  },
  {
    field_name: 'postal_code',
    source_entity: ProfileChangeFieldSourceEntityEnum.EMPLOYEE_ADDRESS,
    editable_by_employee: true,
    requires_approval: true,
    editable_by_hr: true,
    sensitive: true,
    validation_rules: ['string', 'max:30'],
    display_label: 'Postal Code',
    request_types: [ProfileChangeRequestTypeEnum.ADDRESS_INFORMATION],
    value_type: 'string',
  },
  {
    field_name: 'emergency_contact_name',
    source_entity: ProfileChangeFieldSourceEntityEnum.EMPLOYEE_RELATIVE,
    editable_by_employee: true,
    requires_approval: true,
    editable_by_hr: true,
    sensitive: true,
    validation_rules: ['required', 'string', 'max:150'],
    display_label: 'Emergency Contact Name',
    request_types: [ProfileChangeRequestTypeEnum.EMERGENCY_CONTACT],
    value_type: 'string',
  },
  {
    field_name: 'emergency_contact_relationship',
    source_entity: ProfileChangeFieldSourceEntityEnum.EMPLOYEE_RELATIVE,
    editable_by_employee: true,
    requires_approval: true,
    editable_by_hr: true,
    sensitive: true,
    validation_rules: ['required', 'string', 'max:100'],
    display_label: 'Emergency Contact Relationship',
    request_types: [ProfileChangeRequestTypeEnum.EMERGENCY_CONTACT],
    value_type: 'string',
  },
  {
    field_name: 'emergency_contact_phone',
    source_entity: ProfileChangeFieldSourceEntityEnum.EMPLOYEE_RELATIVE,
    editable_by_employee: true,
    requires_approval: true,
    editable_by_hr: true,
    sensitive: true,
    validation_rules: ['phone', 'max:30'],
    display_label: 'Emergency Contact Phone',
    request_types: [ProfileChangeRequestTypeEnum.EMERGENCY_CONTACT],
    value_type: 'phone',
  },
  {
    field_name: 'emergency_contact_email',
    source_entity: ProfileChangeFieldSourceEntityEnum.EMPLOYEE_RELATIVE,
    editable_by_employee: true,
    requires_approval: true,
    editable_by_hr: true,
    sensitive: true,
    validation_rules: ['email', 'max:150'],
    display_label: 'Emergency Contact Email',
    request_types: [ProfileChangeRequestTypeEnum.EMERGENCY_CONTACT],
    value_type: 'email',
  },
  {
    field_name: 'emergency_contact_address',
    source_entity: ProfileChangeFieldSourceEntityEnum.EMPLOYEE_RELATIVE,
    editable_by_employee: true,
    requires_approval: true,
    editable_by_hr: true,
    sensitive: true,
    validation_rules: ['string', 'max:1000'],
    display_label: 'Emergency Contact Address',
    request_types: [ProfileChangeRequestTypeEnum.EMERGENCY_CONTACT],
    value_type: 'string',
  },
  {
    field_name: 'emergency_contact_occupation',
    source_entity: ProfileChangeFieldSourceEntityEnum.EMPLOYEE_RELATIVE,
    editable_by_employee: true,
    requires_approval: true,
    editable_by_hr: true,
    sensitive: false,
    validation_rules: ['string', 'max:120'],
    display_label: 'Emergency Contact Occupation',
    request_types: [ProfileChangeRequestTypeEnum.EMERGENCY_CONTACT],
    value_type: 'string',
  },
  {
    field_name: 'default_avatar_id',
    source_entity: ProfileChangeFieldSourceEntityEnum.EMPLOYEE,
    editable_by_employee: true,
    requires_approval: true,
    editable_by_hr: true,
    sensitive: false,
    validation_rules: ['nullable', 'number'],
    display_label: 'Selected Default Avatar',
    request_types: [
      ProfileChangeRequestTypeEnum.PROFILE_PHOTO,
      ProfileChangeRequestTypeEnum.OTHER_PROFILE_INFORMATION,
    ],
    value_type: 'number',
  },
];

@Injectable()
export class ProfileChangeFieldPolicyService {
  private readonly policyMap = new Map(
    PROFILE_FIELD_POLICIES.map((policy) => [policy.field_name, policy]),
  );

  listPolicies(): ProfileFieldPolicy[] {
    return PROFILE_FIELD_POLICIES;
  }

  getPolicy(fieldName: string): ProfileFieldPolicy {
    const policy = this.policyMap.get(fieldName);
    if (!policy) {
      throw new BadRequestException(
        `Unsupported profile field '${fieldName}'.`,
      );
    }

    return policy;
  }

  getPoliciesForRequestType(
    requestType: ProfileChangeRequestTypeEnum,
  ): ProfileFieldPolicy[] {
    return PROFILE_FIELD_POLICIES.filter((policy) =>
      policy.request_types.includes(requestType),
    );
  }

  isFieldAllowedForRequestType(
    fieldName: string,
    requestType: ProfileChangeRequestTypeEnum,
  ): boolean {
    const policy = this.policyMap.get(fieldName);
    return Boolean(policy?.request_types.includes(requestType));
  }
}
