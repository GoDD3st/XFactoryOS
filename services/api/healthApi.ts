export type HealthStatus = 'ok' | 'degraded' | 'down';

export interface HealthComponent {
  status: HealthStatus;
  detail?: string;
}

export interface HealthReport {
  status: HealthStatus;
  service: string;
  site: string;
  components: Record<string, HealthComponent>;
  timestamp: string;
}

/**
 * /api/health is public (it sits above the auth middleware) and now actually probes each
 * component rather than returning a constant. A non-2xx response still carries a JSON body when
 * the API itself is up, so it is parsed rather than discarded — a 503 with component detail is
 * exactly what the IT console needs to display.
 */
export async function apiFetchHealth(): Promise<HealthReport | null> {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    const body = await response.json().catch(() => null);
    if (body && body.components) return body as HealthReport;
    return null;
  } catch {
    // Fetch itself failed — the API is unreachable from the browser.
    return {
      status: 'down',
      service: 'XFactory OS Backend API',
      site: '—',
      components: { api: { status: 'down', detail: 'Injoignable depuis le navigateur.' } },
      timestamp: new Date().toISOString(),
    };
  }
}
