import type { NotificationRecipient } from './leave.events';

export class EmployeeMovementApprovalRequiredEvent {
  static readonly EVENT = 'hr.employee_movement.approval_required';
  constructor(
    public readonly companyId: number,
    public readonly movementId: number,
    public readonly movementNo: string,
    public readonly movementType: string,
    public readonly employeeName: string,
    public readonly effectiveDate: string,
    public readonly reviewUrl: string,
    public readonly approvers: NotificationRecipient[],
  ) {}
}

export class EmployeeMovementApprovedEvent {
  static readonly EVENT = 'hr.employee_movement.approved';
  constructor(
    public readonly companyId: number,
    public readonly movementId: number,
    public readonly movementNo: string,
    public readonly movementType: string,
    public readonly employeeName: string,
    public readonly employeeEmail: string,
    public readonly effectiveDate: string,
    public readonly dashboardUrl: string,
  ) {}
}

export class EmployeeMovementRejectedEvent {
  static readonly EVENT = 'hr.employee_movement.rejected';
  constructor(
    public readonly companyId: number,
    public readonly movementId: number,
    public readonly movementNo: string,
    public readonly movementType: string,
    public readonly employeeName: string,
    public readonly employeeEmail: string,
    public readonly comments: string,
    public readonly dashboardUrl: string,
  ) {}
}

export class EmployeeMovementAppliedEvent {
  static readonly EVENT = 'hr.employee_movement.applied';
  constructor(
    public readonly companyId: number,
    public readonly movementId: number,
    public readonly movementNo: string,
    public readonly movementType: string,
    public readonly employeeName: string,
    public readonly employeeEmail: string,
    public readonly effectiveDate: string,
    public readonly dashboardUrl: string,
  ) {}
}
