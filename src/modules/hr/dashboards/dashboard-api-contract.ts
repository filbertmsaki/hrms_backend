export type DashboardWidgetAvailabilityState = 'UNAVAILABLE' | 'PARTIAL_ERROR';

export interface DashboardUnavailableWidget {
  code: string;
  available: false;
  state: DashboardWidgetAvailabilityState;
  reason: string;
}

export interface DashboardSourceResult<T> {
  value: T;
  unavailableWidget: DashboardUnavailableWidget | null;
}

export async function isolateDashboardSource<T>(
  code: string,
  source: Promise<T>,
  fallback: T,
): Promise<DashboardSourceResult<T>> {
  try {
    return { value: await source, unavailableWidget: null };
  } catch {
    return {
      value: fallback,
      unavailableWidget: {
        code,
        available: false,
        state: 'PARTIAL_ERROR',
        reason: 'SOURCE_ERROR',
      },
    };
  }
}
