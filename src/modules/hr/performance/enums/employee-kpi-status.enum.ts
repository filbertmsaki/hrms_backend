export enum EmployeeKpiStatusEnum {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  RETURNED = 'RETURNED',
  RESUBMITTED = 'RESUBMITTED',
  REJECTED = 'REJECTED',
}

export enum EmployeeKpiReviewDecisionEnum {
  APPROVE = 'APPROVE',
  RETURN = 'RETURN',
  REJECT = 'REJECT',
}

export enum EmployeeKpiMeasurementTypeEnum {
  NUMBER = 'NUMBER',
  PERCENTAGE = 'PERCENTAGE',
  CURRENCY = 'CURRENCY',
  BOOLEAN = 'BOOLEAN',
  RATING = 'RATING',
  MANUAL = 'MANUAL',
}

export enum EmployeeKpiProgressSourceEnum {
  MANUAL = 'MANUAL',
  APPROVED_ACTIVITIES = 'APPROVED_ACTIVITIES',
  SYSTEM = 'SYSTEM',
}
