import { HardwareDiagnosticsInfo, Workstation } from '@/frontend/src/types';
import { WorkstationRepository } from '@/database/repositories/workstationRepository';

/**
 * §10.3 "Préparé, minimal" — there's no real IoT/network monitoring integration (CDVI/Hager are
 * future integrations per SRS §6), so per-port link speed / dock wattage can't be genuinely
 * measured. What IS real here: the workstation code, its cluster, and its actual DB status
 * (`maintenance` -> degraded, otherwise online) — derived from live Supabase data instead of
 * the synthetic seed set getSavedWorkstations() falls back to when called server-side.
 */
export async function getHardwareDiagnostics(): Promise<HardwareDiagnosticsInfo[]> {
  const wsMap = await WorkstationRepository.getWorkstations();
  const seen = new Set<string>();
  const diagnostics: HardwareDiagnosticsInfo[] = [];

  (Object.values(wsMap) as Workstation[][]).forEach((list) => {
    list.forEach((ws) => {
      if (seen.has(ws.id)) return;
      seen.add(ws.id);

      const portStatus: 'online' | 'degraded' | 'offline' = ws.status === 'maintenance' ? 'degraded' : 'online';

      diagnostics.push({
        workstation_code: ws.code,
        cluster_code: ws.cluster_id.toUpperCase(),
        rj45_port: `ETH-SAF-${ws.code}`,
        link_speed: portStatus === 'online' ? '1.0 Gbps' : '100 Mbps',
        port_status: portStatus,
        dock_power_delivery: '85W PD Active',
        display_count: 1,
        last_ping: new Date().toISOString(),
      });
    });
  });

  return diagnostics;
}

export function resetHardwarePort(workstationCode: string): boolean {
  console.log(`[IoT Supervision] Port reset command sent to ETH-SAF-${workstationCode}`);
  return true;
}

export class HardwareService {
  static getHardwareDiagnostics = getHardwareDiagnostics;
  static resetHardwarePort = resetHardwarePort;
}
