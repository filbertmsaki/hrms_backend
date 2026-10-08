const KPI_TIME_ZONE = 'Africa/Dar_es_Salaam';

export function kpiCycleToday(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: KPI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
