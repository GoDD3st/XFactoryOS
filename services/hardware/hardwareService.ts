import { HardwareDiagnosticsInfo, Workstation } from '@/frontend/src/types';
import { getSavedWorkstations } from '@/services/workspaces/workspaceService';

export function getHardwareDiagnostics(): HardwareDiagnosticsInfo[] {
  const wsMap = getSavedWorkstations();
  const diagnostics: HardwareDiagnosticsInfo[] = [];

  (Object.values(wsMap) as Workstation[][]).forEach((list) => {
    list.forEach((ws) => {
      let portStatus: 'online' | 'degraded' | 'offline' = 'online';
      if (ws.status === 'maintenance') portStatus = 'degraded';
      if (ws.seat_number === 4 && ws.cluster_id === 'cl-C') portStatus = 'offline';

      diagnostics.push({
        workstation_code: ws.code,
        cluster_code: ws.cluster_id.toUpperCase().replace('CL-', 'CL-'),
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
