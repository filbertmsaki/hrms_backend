import { KpiDataSourceTypeEnum } from '../enums/kpi-data-source-type.enum';
import { KpiProviderKeyEnum } from '../enums/kpi-provider-key.enum';

const ACTIVITY_PROVIDER_KEYS = new Set<KpiProviderKeyEnum>([
  KpiProviderKeyEnum.PHASE13_DAILY_ACTIVITY,
  KpiProviderKeyEnum.ACTIVITY_SUBMISSION_DISCIPLINE,
  KpiProviderKeyEnum.ACTIVITY_COMPLETION_RATE,
  KpiProviderKeyEnum.ACTIVITY_PLAN_VS_COMPLETION,
  KpiProviderKeyEnum.ACTIVITY_MANAGER_APPROVAL_RATE,
  KpiProviderKeyEnum.ACTIVITY_ON_TIME_SUBMISSION_RATE,
]);

const FIELD_VISIT_PROVIDER_KEYS = new Set<KpiProviderKeyEnum>([
  KpiProviderKeyEnum.PHASE13_FIELD_VISIT,
  KpiProviderKeyEnum.FIELD_VISITS_PLANNED,
  KpiProviderKeyEnum.FIELD_VISITS_COMPLETED,
  KpiProviderKeyEnum.FIELD_VISIT_COMPLETION_RATE,
  KpiProviderKeyEnum.CUSTOMER_VISITS_COMPLETED,
  KpiProviderKeyEnum.BROKER_VISITS_COMPLETED,
  KpiProviderKeyEnum.UNPLANNED_VISIT_RATE,
  KpiProviderKeyEnum.VISIT_MANAGER_APPROVAL_RATE,
  KpiProviderKeyEnum.LEADS_GENERATED,
  KpiProviderKeyEnum.QUOTATIONS_REPORTED,
  KpiProviderKeyEnum.BUSINESS_REPORTED_CLOSED,
  KpiProviderKeyEnum.POTENTIAL_VALUE_REPORTED,
  KpiProviderKeyEnum.ACTUAL_VALUE_VALIDATED,
  KpiProviderKeyEnum.RENEWAL_FOLLOWUPS_COMPLETED,
  KpiProviderKeyEnum.COLLECTION_FOLLOWUPS_COMPLETED,
  KpiProviderKeyEnum.FOLLOWUP_COMPLETION_RATE,
]);

const LEGACY_SOURCE_PROVIDER_KEYS: Partial<
  Record<KpiDataSourceTypeEnum, ReadonlySet<KpiProviderKeyEnum>>
> = {
  [KpiDataSourceTypeEnum.ATTENDANCE]: new Set([
    KpiProviderKeyEnum.ATTENDANCE_PRESENT_RATE,
    KpiProviderKeyEnum.ATTENDANCE_LATE_OCCURRENCE,
  ]),
  [KpiDataSourceTypeEnum.LEAVE]: new Set([
    KpiProviderKeyEnum.LEAVE_APPROVED_DAYS,
  ]),
  [KpiDataSourceTypeEnum.DAILY_ACTIVITY]: ACTIVITY_PROVIDER_KEYS,
  [KpiDataSourceTypeEnum.FIELD_VISIT]: FIELD_VISIT_PROVIDER_KEYS,
};

export function isKpiProviderKey(value: unknown): value is KpiProviderKeyEnum {
  return (
    typeof value === 'string' &&
    Object.values(KpiProviderKeyEnum).includes(value as KpiProviderKeyEnum)
  );
}

export function isProviderAllowedForSource(
  sourceType: KpiDataSourceTypeEnum,
  providerKey: KpiProviderKeyEnum,
): boolean {
  if (sourceType === KpiDataSourceTypeEnum.SYSTEM_CALCULATION) {
    // Every enum entry has a concrete, internally implemented provider branch.
    // Phase 13 providers still honor their runtime feature flags.
    return true;
  }

  return LEGACY_SOURCE_PROVIDER_KEYS[sourceType]?.has(providerKey) ?? false;
}

export function configuredProviderKey(
  sourceType: KpiDataSourceTypeEnum,
  configuration: Record<string, unknown> | null | undefined,
): KpiProviderKeyEnum | null {
  const configured = configuration?.provider_key;
  if (configured !== undefined) {
    return isKpiProviderKey(configured) &&
      isProviderAllowedForSource(sourceType, configured)
      ? configured
      : null;
  }

  switch (sourceType) {
    case KpiDataSourceTypeEnum.ATTENDANCE:
      return KpiProviderKeyEnum.ATTENDANCE_PRESENT_RATE;
    case KpiDataSourceTypeEnum.LEAVE:
      return KpiProviderKeyEnum.LEAVE_APPROVED_DAYS;
    default:
      return null;
  }
}
