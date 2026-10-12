export class EmployeeInvitationAcceptedEvent {
  static readonly EVENT = 'hr.employee-invitation.accepted';
  constructor(
    public readonly companyId: number,
    public readonly invitationId: number,
    public readonly employeeId: number,
    public readonly employeeNo: string | null,
    public readonly employeeName: string,
    /** The invitation owner: whoever created or last resent it. */
    public readonly inviterCompanyUserId: number | null,
    public readonly profileUrl: string | null,
  ) {}
}
