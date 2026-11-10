export type SelfServiceWorkflowRequestKind =
  | 'attendance_correction'
  | 'profile_update';

/**
 * Emitted on every status transition of an attendance correction or profile
 * update request. The listener routes notifications by `toStatus`.
 */
export class SelfServiceRequestTransitionedEvent {
  static readonly EVENT = 'hr.self_service.request_transitioned';
  constructor(
    public readonly companyId: number,
    public readonly requestKind: SelfServiceWorkflowRequestKind,
    public readonly requestId: number,
    public readonly employeeId: number,
    public readonly action: string,
    public readonly fromStatus: string | null,
    public readonly toStatus: string,
    public readonly actorCompanyUserId: number | null,
    public readonly comment: string | null,
  ) {}
}
