export class ActionItemIssueReportedEvent {
  static readonly EVENT = 'hr.action_item.issue_reported';
  constructor(
    public readonly companyId: number,
    public readonly actionItemId: number,
    public readonly title: string,
    public readonly comment: string,
    public readonly reportedByCompanyUserId: number,
    public readonly reportedBy: string,
    public readonly sourceModule: string,
    public readonly sourceEntityType: string,
    public readonly sourceEntityId: string,
    public readonly actionUrl: string | null,
    public readonly commentId: string,
  ) {}
}
