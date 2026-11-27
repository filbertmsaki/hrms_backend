import { APPROVAL_DEFAULT_TYPES, LetterTypeEnum } from './letter-catalogue';

export type DefaultLetterTemplate = {
  letter_type: LetterTypeEnum;
  name: string;
  subject: string;
  salutation: string;
  body: string;
  closing: string;
  requires_approval: boolean;
  include_acknowledgement: boolean;
};

/**
 * One default per letter type, seeded lazily per company. Defaults only use
 * placeholders that are normally available plus the type's required extra
 * fields, so a letter can be submitted without editing the template.
 */
const DEFAULTS: Array<
  Omit<DefaultLetterTemplate, 'requires_approval' | 'salutation' | 'closing'> &
    Partial<Pick<DefaultLetterTemplate, 'salutation' | 'closing'>>
> = [
  {
    letter_type: LetterTypeEnum.OFFER,
    name: 'Employment offer letter',
    subject: 'Offer of employment – {{position}}',
    include_acknowledgement: true,
    body: [
      'Following your recent interviews, we are pleased to offer you employment with **{{company_name}}** in the position of **{{position}}**, on the terms set out below.',
      '- Commencement date: {{offer_start_date}}\n- Gross salary: {{offer_salary}} per month\n- Probation: the first six months of service, subject to satisfactory performance',
      'Your detailed terms and conditions of service will be set out in your contract of employment, which will be issued on acceptance of this offer. This offer is subject to satisfactory reference checks and the submission of your academic and identification documents.',
      'Please confirm your acceptance by signing and returning a copy of this letter on or before **{{offer_expiry_date}}**, after which this offer will lapse.',
      'We look forward to welcoming you to {{company_name}}.',
    ].join('\n\n'),
  },
  {
    letter_type: LetterTypeEnum.APPOINTMENT,
    name: 'Appointment letter',
    subject: 'Appointment as {{position}}',
    include_acknowledgement: true,
    body: [
      'We are pleased to confirm your appointment to the position of **{{position}}** in the {{department}} department of {{company_name}}, with effect from **{{effective_date}}**.',
      'Your employee number is {{employee_number}}. Please quote it in all correspondence with the Human Resources department.',
      'Your duties, remuneration and other terms of service are set out in your contract of employment and the company policies, which form part of this appointment. You are expected to observe the company Code of Conduct at all times.',
      'Kindly sign the acknowledgement below and return a copy to Human Resources.',
      'We wish you every success in your new role.',
    ].join('\n\n'),
  },
  {
    letter_type: LetterTypeEnum.CONFIRMATION,
    name: 'Employment confirmation letter',
    subject: 'Confirmation of employment',
    include_acknowledgement: false,
    body: [
      'We are pleased to inform you that, following a review of your performance during your probation period, management has confirmed your employment as **{{position}}** in the {{department}} department with effect from **{{effective_date}}**.',
      'All other terms and conditions of your employment remain unchanged.',
      'We thank you for your contribution so far and look forward to your continued commitment to {{company_name}}.',
    ].join('\n\n'),
  },
  {
    letter_type: LetterTypeEnum.PROBATION_EXTENSION,
    name: 'Probation extension letter',
    subject: 'Extension of probation period',
    include_acknowledgement: true,
    body: [
      'Following the review of your performance as **{{position}}** during your probation period, management has decided to extend your probation period up to **{{extension_end_date}}**.',
      'The extension has been made for the following reason:\n{{extension_reason}}',
      'During the extended period your supervisor will agree clear objectives with you and review your progress regularly. Your employment will be reviewed again at the end of the extended period.',
      'All other terms and conditions of your employment remain unchanged. Please sign the acknowledgement below to confirm receipt of this letter.',
    ].join('\n\n'),
  },
  {
    letter_type: LetterTypeEnum.PROBATION_NOT_CONFIRMED,
    name: 'Probation outcome letter (not confirmed)',
    subject: 'Outcome of probation period',
    include_acknowledgement: true,
    body: [
      'We refer to your probationary employment as **{{position}}** in the {{department}} department.',
      'Following the review of your performance during the probation period, we regret to inform you that management has decided not to confirm your employment. This decision takes effect on **{{effective_date}}** and your last working day will be **{{last_working_day}}**.',
      'You will be paid all statutory dues up to your last working day. Please hand over all company property in your possession and complete the exit clearance with Human Resources before your last working day.',
      'We thank you for your service and wish you success in your future endeavours.',
    ].join('\n\n'),
  },
  {
    letter_type: LetterTypeEnum.PROMOTION,
    name: 'Promotion letter',
    subject: 'Promotion to {{new_position}}',
    include_acknowledgement: true,
    body: [
      'We are pleased to inform you that management has approved your promotion from **{{position}}** to **{{new_position}}** with effect from **{{effective_date}}**.',
      'This promotion recognises your performance, dedication and contribution to {{company_name}}. Your revised duties and any change in remuneration will be communicated to you by Human Resources.',
      'All other terms and conditions of your employment remain unchanged.',
      'Congratulations on your promotion. We wish you continued success in your new role.',
    ].join('\n\n'),
  },
  {
    letter_type: LetterTypeEnum.SALARY_INCREMENT,
    name: 'Salary increment letter',
    subject: 'Salary increment',
    include_acknowledgement: false,
    body: [
      'We are pleased to inform you that management has approved an increase in your salary with effect from **{{effective_date}}**, as follows:',
      '- Previous monthly salary: {{previous_salary}}\n- New monthly salary: {{new_salary}}',
      'The revised salary will be reflected in your payroll from the effective date. All other terms and conditions of your employment remain unchanged.',
      'Thank you for your continued contribution to {{company_name}}. This letter and its contents are confidential.',
    ].join('\n\n'),
  },
  {
    letter_type: LetterTypeEnum.TRANSFER,
    name: 'Employee transfer letter',
    subject: 'Transfer to {{new_branch}}',
    include_acknowledgement: true,
    body: [
      'This is to inform you that management has decided to transfer you from your current duty station to **{{new_branch}}** with effect from **{{effective_date}}**.',
      'You will continue to serve as {{position}} unless advised otherwise. Please arrange a proper handover of your current responsibilities to your supervisor before the effective date.',
      'Any transfer allowance payable will be processed in line with the company transfer policy. All other terms and conditions of your employment remain unchanged.',
      'We wish you success at your new duty station.',
    ].join('\n\n'),
  },
  {
    letter_type: LetterTypeEnum.EMPLOYMENT_VERIFICATION,
    name: 'Employment verification letter',
    subject: 'Confirmation of employment – {{employee_name}}',
    salutation: 'To whom it may concern,',
    include_acknowledgement: false,
    body: [
      'This is to confirm that **{{employee_name}}** (employee number {{employee_number}}) is an employee of {{company_name}}, having joined the company on {{hire_date}}.',
      '{{employee_first_name}} currently holds the position of **{{position}}** in the {{department}} department on {{employment_type}} terms.',
      'This letter is issued at the request of the employee for the purpose of {{verification_purpose}} and does not create any liability on the part of the company.',
      'For any further verification, please contact the Human Resources department using the details above.',
    ].join('\n\n'),
  },
  {
    letter_type: LetterTypeEnum.CONTRACT_RENEWAL,
    name: 'Contract renewal letter',
    subject: 'Renewal of employment contract',
    include_acknowledgement: true,
    body: [
      'We are pleased to inform you that management has decided to renew your employment contract as **{{position}}** for a further period from **{{renewal_start_date}}** to **{{renewal_end_date}}**.',
      'The terms and conditions of your current contract will continue to apply during the renewed period unless otherwise communicated in writing. A renewed contract will be prepared for your signature.',
      'Please sign the acknowledgement below to confirm your acceptance of the renewal.',
    ].join('\n\n'),
  },
  {
    letter_type: LetterTypeEnum.ACTING_APPOINTMENT,
    name: 'Acting appointment letter',
    subject: 'Acting appointment as {{acting_position}}',
    include_acknowledgement: true,
    body: [
      'You are hereby appointed to act as **{{acting_position}}** with effect from **{{acting_start_date}}**, in addition to your substantive role as {{position}}, until further notice.',
      'During the acting period you will exercise the authority and carry out the responsibilities of the position. Any acting allowance will be paid in accordance with the company policy.',
      'This acting appointment does not by itself constitute a promotion or a permanent change in your terms of employment.',
      'We trust that you will discharge these responsibilities with diligence.',
    ].join('\n\n'),
  },
  {
    letter_type: LetterTypeEnum.WARNING,
    name: 'Warning letter',
    subject: '{{warning_level}}',
    include_acknowledgement: true,
    body: [
      'This letter serves as a **{{warning_level}}** in respect of the following misconduct, which occurred on {{incident_date}}:',
      '{{warning_reason}}',
      'The conduct described above is contrary to the company Code of Conduct and the standards expected of you as {{position}}. You are required to improve your conduct immediately.',
      'Please note that any further misconduct may lead to more serious disciplinary action, up to and including termination of employment. This warning will remain on your personal file in accordance with the company disciplinary policy.',
      'You may appeal against this warning in writing to Human Resources within five (5) working days of receiving this letter.',
    ].join('\n\n'),
  },
  {
    letter_type: LetterTypeEnum.TERMINATION,
    name: 'Termination letter',
    subject: 'Termination of employment',
    include_acknowledgement: true,
    body: [
      'We regret to inform you that your employment with {{company_name}} as **{{position}}** is terminated with effect from **{{termination_date}}**, for the following reason:',
      '{{termination_reason}}',
      'Your last working day will be **{{last_working_day}}**. You will be paid all terminal benefits due to you under the Employment and Labour Relations Act and your contract of employment, less any amounts owed to the company.',
      '- Hand over all company property, documents and access cards in your possession\n- Complete the exit clearance process with Human Resources\n- Collect your certificate of service once clearance is complete',
      'If you wish to appeal against this decision, you may do so in writing within the period provided in the company disciplinary policy.',
    ].join('\n\n'),
  },
  {
    letter_type: LetterTypeEnum.CERTIFICATE_OF_SERVICE,
    name: 'Certificate of service',
    subject: 'Certificate of service',
    salutation: 'To whom it may concern,',
    include_acknowledgement: false,
    body: [
      'This is to certify that **{{employee_name}}** (employee number {{employee_number}}) was employed by {{company_name}} from **{{hire_date}}** to **{{last_working_day}}**.',
      'At the time of leaving, {{employee_first_name}} held the position of {{position}} in the {{department}} department.',
      'This certificate is issued in accordance with section 44(2) of the Employment and Labour Relations Act, 2004.',
      'We wish {{employee_first_name}} success in the future.',
    ].join('\n\n'),
  },
  {
    letter_type: LetterTypeEnum.CUSTOM,
    name: 'Custom letter',
    subject: 'Letter to {{employee_name}}',
    include_acknowledgement: false,
    body: [
      'Write the content of the letter here. You may use placeholders such as {{position}} and {{department}}, which are filled in for the selected employee.',
      'For any clarification, please contact the Human Resources department.',
    ].join('\n\n'),
  },
];

export const DEFAULT_LETTER_TEMPLATES: DefaultLetterTemplate[] = DEFAULTS.map(
  (item) => ({
    salutation: 'Dear {{employee_first_name}},',
    closing: 'Yours sincerely,',
    ...item,
    requires_approval: APPROVAL_DEFAULT_TYPES.has(item.letter_type),
  }),
);
