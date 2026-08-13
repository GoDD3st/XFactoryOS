import { Cluster, Workstation, SeatStatus } from '@/frontend/src/types';
import { WorkstationRepository } from '@/database/repositories/workstationRepository';
import { ReservationRepository } from '@/database/repositories/reservationRepository';
import { Reservation } from '@/frontend/src/types';
import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/database/client';

export const INITIAL_CLUSTERS: Cluster[] = [
  { id: 'cl-a', code: 'CL-A', name: 'Cluster A', description: 'Cluster A', desk_count: 4, is_management_only: false, enabled: true, location_zone: 'Openspace', workstations: [] },
  { id: 'cl-b', code: 'CL-B', name: 'Cluster B', description: 'Cluster B', desk_count: 4, is_management_only: false, enabled: true, location_zone: 'Openspace', workstations: [] },
  { id: 'cl-c', code: 'CL-C', name: 'Cluster C', description: 'Cluster C', desk_count: 4, is_management_only: false, enabled: true, location_zone: 'Openspace', workstations: [] },
  { id: 'cl-d', code: 'CL-D', name: 'Cluster D', description: 'Cluster D', desk_count: 4, is_management_only: false, enabled: true, location_zone: 'Openspace', workstations: [] },
  { id: 'cl-e', code: 'CL-E', name: 'Cluster E', description: 'Cluster E', desk_count: 4, is_management_only: false, enabled: true, location_zone: 'Openspace', workstations: [] },
  { id: 'cl-f', code: 'CL-F', name: 'Cluster F', description: 'Cluster F', desk_count: 4, is_management_only: false, enabled: true, location_zone: 'Openspace', workstations: [] },
  { id: 'cl-g', code: 'CL-G', name: 'Cluster G', description: 'Cluster G', desk_count: 4, is_management_only: false, enabled: true, location_zone: 'Openspace', workstations: [] },
];

export class WorkspaceService {
  /**
   * Get all workstation data from database repository with local caching
   */
  static getSavedWorkstations(): Record<string, Workstation[]> {
    WorkstationRepository.getWorkstations().then((data) => {
      if (typeof window !== 'undefined' && Object.keys(data).length > 0) {
        localStorage.setItem('xfactory_workstations_v2', JSON.stringify(data));
      }
    });

    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('xfactory_workstations_v2');
      if (cached) return JSON.parse(cached);
    }
    return this.generateDefaultWorkstations();
  }

  static async fetchClustersWithOverlays(): Promise<Cluster[]> {
    const wsMap = await WorkstationRepository.getWorkstations();
    const clusters = await WorkstationRepository.getClusters();

    let reservations: Reservation[] = [];
    if (typeof window !== 'undefined') {
      const { ReservationService } = await import('../reservations/reservationService');
      reservations = ReservationService.readCachedReservations();
    } else {
      try {
        const { getAdminClient } = await import('@/database/serverClient');
        const admin = getAdminClient();
        reservations = admin
          ? await ReservationRepository.getAllReservations(admin)
          : await ReservationRepository.getAllReservations();
      } catch {
        reservations = [];
      }
    }

    const reservedStatuses = new Set(['confirmée', 'check-in', 'en attente']);
    const reservedByWorkstationId = new Map<string, Reservation>();
    const reservedByWorkstationCode = new Map<string, Reservation>();

    reservations.forEach((r) => {
      if (!reservedStatuses.has(r.status)) return;
      if (r.workstation_id) reservedByWorkstationId.set(r.workstation_id, r);
      if (r.workstation_code) reservedByWorkstationCode.set(r.workstation_code, r);
    });

    const applyReservationOverlay = (ws: Workstation): Workstation => {
      if (ws.status === 'maintenance' || ws.status === 'management_reserved') return ws;

      const activeRes =
        reservedByWorkstationId.get(ws.id) || reservedByWorkstationCode.get(ws.code);

      if (!activeRes) return ws;

      const overlayStatus: SeatStatus =
        activeRes.status === 'check-in' ? 'occupé' : 'réservé';

      return { ...ws, status: overlayStatus, reservable: false };
    };

    const targetClusters = clusters.length > 0 ? clusters : INITIAL_CLUSTERS;
    const defaultWsMap = this.generateDefaultWorkstations();

    return targetClusters.map((c) => {
      const codeKey = c.code ? c.code.toLowerCase() : c.id;
      const formattedCodeKey = codeKey.startsWith('cl-') ? codeKey : `cl-${codeKey}`;

      const seats =
        (wsMap[c.id] && wsMap[c.id].length > 0 ? wsMap[c.id] : null) ||
        (wsMap[formattedCodeKey] && wsMap[formattedCodeKey].length > 0 ? wsMap[formattedCodeKey] : null) ||
        (wsMap[codeKey] && wsMap[codeKey].length > 0 ? wsMap[codeKey] : null) ||
        defaultWsMap[c.id] ||
        defaultWsMap[formattedCodeKey] ||
        defaultWsMap[c.code?.toLowerCase()] ||
        [];

      return {
        ...c,
        workstations: seats.map(applyReservationOverlay),
      };
    });
  }

  static generateDefaultWorkstations(): Record<string, Workstation[]> {
    const map: Record<string, Workstation[]> = {};
    INITIAL_CLUSTERS.forEach((cluster) => {
      map[cluster.id] = Array.from({ length: 4 }, (_, i) => {
        const seatNum = i + 1;
        return {
          id: `${cluster.id}-seat-${seatNum}`,
          cluster_id: cluster.id,
          code: `${cluster.code}-W${seatNum}`,
          seat_number: seatNum,
          status: cluster.is_management_only ? 'management_reserved' : 'disponible',
          reservable: !cluster.is_management_only,
          is_extension: false,
          visibleToUsers: true,
          metadata: {
            near_window: seatNum === 1,
            is_pmr: seatNum === 1,
            is_quiet_zone: cluster.id === 'cl-e',
          },
        };
      });
    });
    return map;
  }

  static async setSeatMaintenanceStatus(
    clusterId: string,
    seatId: string,
    isMaintenance: boolean,
    actorId?: string,
    actorName?: string,
    actorRole?: string,
    dbClient?: SupabaseClient
  ): Promise<Record<string, Workstation[]>> {
    // Was reading getSavedWorkstations(), which on the server (no `window`) falls straight
    // through to generateDefaultWorkstations() — synthetic seed data with fake ids like
    // 'cl-a-seat-1'. The real UUID sent from the browser never matched, so `seat` was always
    // undefined and this silently no-op'd — the button appeared to work (200 OK) but never
    // touched the database. Same bug as toggleExtensionSeatVisibility below.
    const workstations = await WorkstationRepository.getWorkstations(dbClient);
    const clusterSeats = workstations[clusterId] || workstations[clusterId.toLowerCase()];
    const seat = clusterSeats?.find((s) => s.id === seatId || s.code === seatId);
    if (!seat) {
      throw new Error(`Poste introuvable (${seatId}) dans le cluster ${clusterId}.`);
    }

    const newStatus: SeatStatus = isMaintenance ? 'maintenance' : 'disponible';
    const updated = await WorkstationRepository.updateWorkstationStatus(seat.id, newStatus, !isMaintenance, dbClient);
    if (!updated) {
      throw new Error(`Échec de la mise à jour du poste ${seat.code} — le changement de statut n'a pas été persisté.`);
    }
    seat.status = newStatus;

    const { AuditRepository } = await import('@/database/repositories/auditRepository');
    await AuditRepository.logEvent(
      'UPDATE',
      actorId || 'system',
      actorName || 'Building Manager',
      actorRole || 'building_manager',
      seat.code || seatId,
      `Poste ${seat.code || seatId} ${isMaintenance ? 'mis en maintenance' : 'remis en service'}.`,
      '10.120.4.18',
      'cluster_management'
    );

    return workstations;
  }

  static async toggleExtensionSeatVisibility(
    clusterId: string,
    seatId: string,
    visible: boolean,
    actorId?: string,
    actorName?: string,
    actorRole?: string,
    dbClient?: SupabaseClient
  ): Promise<Record<string, Workstation[]>> {
    const workstations = await WorkstationRepository.getWorkstations(dbClient);
    const clusterSeats = workstations[clusterId] || workstations[clusterId.toLowerCase()];
    const seat = clusterSeats?.find((s) => s.id === seatId || s.code === seatId);
    if (!seat) {
      throw new Error(`Poste introuvable (${seatId}) dans le cluster ${clusterId}.`);
    }

    const updated = await WorkstationRepository.updateWorkstation(seat.id, { metadataPatch: { visibleToUsers: visible } }, dbClient);
    if (!updated) {
      throw new Error(`Échec de la mise à jour du poste ${seat.code} — la visibilité n'a pas été persistée.`);
    }
    seat.visibleToUsers = visible;

    const { AuditRepository } = await import('@/database/repositories/auditRepository');
    await AuditRepository.logEvent(
      'UPDATE',
      actorId || 'system',
      actorName || 'Administrateur',
      actorRole || 'admin',
      seat.code || seatId,
      `Visibilité du poste d'extension ${seat.code || seatId} ${visible ? 'activée' : 'désactivée'}.`,
      '10.120.4.18',
      'cluster_management'
    );

    return workstations;
  }

  /**
   * SRS §13 "Gérer clusters" = CRUD for Administrator/Super Admin. Before this, `clusters` rows
   * were only ever inserted by database/seeder.ts — there was no create path in the application
   * at all, so the C in CRUD did not exist.
   */
  static async createCluster(
    payload: { code: string; name: string; deskCount?: number; isManagement?: boolean },
    actorId?: string,
    actorName?: string,
    actorRole?: string,
    dbClient?: SupabaseClient
  ): Promise<{ id: string; code: string; name: string }> {
    const db = dbClient || supabase;
    const code = payload.code.trim().toUpperCase();

    const { data: existing } = await db.from('clusters').select('id').eq('code', code).maybeSingle();
    if (existing) throw new Error(`Un cluster portant le code ${code} existe déjà.`);

    // clusters.space_id is NOT NULL — inherit the space the existing clusters belong to rather
    // than inventing one, so a new cluster lands on the same site as the rest.
    const { data: anyCluster } = await db.from('clusters').select('space_id').limit(1).maybeSingle();
    if (!anyCluster?.space_id) throw new Error("Aucun espace de référence trouvé pour rattacher le cluster.");

    const { data: created, error } = await db
      .from('clusters')
      .insert({
        space_id: anyCluster.space_id,
        code,
        name: payload.name.trim(),
        desk_count: payload.deskCount ?? 4,
        management_reserved: payload.isManagement ?? false,
        enabled: true,
      })
      .select('id, code, name')
      .single();

    if (error || !created) throw new Error(`Échec de la création du cluster : ${error?.message}`);

    const { AuditRepository } = await import('@/database/repositories/auditRepository');
    await AuditRepository.logEvent(
      'CREATE',
      actorId || 'system',
      actorName || 'Administrateur',
      actorRole || 'admin',
      created.code,
      `Cluster ${created.code} (${created.name}) créé.`,
      '10.120.4.18',
      'cluster_management'
    );

    return created;
  }

  /**
   * Soft delete (`enabled = false`): the cluster and its seats leave the booking flows and the
   * Digital Twin, but reservations and audit history remain intact. Pass `enabled: true` to
   * restore. Refuses while the cluster still holds active reservations, since disabling it would
   * strand people who already booked a seat there.
   */
  static async setClusterEnabled(
    clusterId: string,
    enabled: boolean,
    actorId?: string,
    actorName?: string,
    actorRole?: string,
    dbClient?: SupabaseClient
  ): Promise<void> {
    const db = dbClient || supabase;

    const { data: cluster } = await db.from('clusters').select('code, name').eq('id', clusterId).maybeSingle();
    if (!cluster) throw new Error('Cluster introuvable.');

    if (!enabled) {
      const { data: seats } = await db.from('workstations').select('id').eq('cluster_id', clusterId);
      const seatIds = (seats || []).map((s: any) => s.id);

      if (seatIds.length > 0) {
        const { count } = await db
          .from('reservations')
          .select('id', { count: 'exact', head: true })
          .in('workstation_id', seatIds)
          // Real reservation_status enum labels — 'PENDING'/'CHECKED_IN' do not exist and would
          // fail the query with 22P02 rather than returning zero rows.
          .in('status', ['PENDING_APPROVAL', 'CONFIRMED', 'CHECK_IN_PENDING', 'OCCUPIED'])
          .gte('end_at', new Date().toISOString());

        if ((count ?? 0) > 0) {
          throw new Error(
            `Impossible de désactiver ${cluster.code} : ${count} réservation(s) active(s) sur ses postes. Annulez-les d'abord.`
          );
        }
      }
    }

    const { error } = await db.from('clusters').update({ enabled, updated_at: new Date().toISOString() }).eq('id', clusterId);
    if (error) throw new Error(`Échec de la mise à jour du cluster : ${error.message}`);

    const { AuditRepository } = await import('@/database/repositories/auditRepository');
    await AuditRepository.logEvent(
      enabled ? 'UPDATE' : 'DELETE',
      actorId || 'system',
      actorName || 'Administrateur',
      actorRole || 'admin',
      cluster.code,
      `Cluster ${cluster.code} ${enabled ? 'réactivé' : 'désactivé (suppression logique)'}.`,
      '10.120.4.18',
      'cluster_management'
    );
  }

  /** Cluster code (CL-F) for audit targets; returns the raw id if it can't be resolved. */
  private static async resolveClusterCode(clusterId: string, dbClient?: SupabaseClient): Promise<string> {
    try {
      const db = dbClient || supabase;
      const { data } = await db.from('clusters').select('code').eq('id', clusterId).maybeSingle();
      return data?.code || clusterId;
    } catch {
      return clusterId;
    }
  }

  static async toggleManagementClusterLock(
    clusterId: string,
    unlocked: boolean,
    actorId?: string,
    actorName?: string,
    dbClient?: SupabaseClient
  ): Promise<Record<string, Workstation[]>> {
    // Fetch live from Supabase (not the localStorage cache / synthetic-ID fallback that
    // getSavedWorkstations() can return) so the write below targets real workstation UUIDs.
    const workstations = await WorkstationRepository.getWorkstations(dbClient);
    const clusterSeats = workstations[clusterId] || workstations[clusterId.toLowerCase()];

    if (clusterSeats && clusterSeats.length > 0) {
      for (const seat of clusterSeats) {
        const newStatus: SeatStatus = unlocked ? 'disponible' : 'management_reserved';
        seat.status = newStatus;
        seat.reservable = unlocked;
        const updated = await WorkstationRepository.updateWorkstationStatus(seat.id, newStatus, unlocked, dbClient);
        if (!updated) {
          throw new Error(`Échec de mise à jour du poste ${seat.code} — le déblocage du cluster n'a pas été persisté.`);
        }
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('xfactory_workstations_v2', JSON.stringify(workstations));
        window.dispatchEvent(new CustomEvent('xfactory_workstations_changed'));
        window.dispatchEvent(new CustomEvent('xfactory_clusters_changed'));
      }

      // Log the cluster CODE, not its UUID: target_resource is what the audit screen's
      // "Entité / Cible" filter shows, and a raw UUID there is unreadable. Falls back to the id
      // only if the cluster can't be resolved.
      const clusterCode = await this.resolveClusterCode(clusterId, dbClient);

      const { AuditRepository } = await import('@/database/repositories/auditRepository');
      await AuditRepository.logEvent(
        unlocked ? 'CLUSTER_ACTIVATE' : 'CLUSTER_DEACTIVATE',
        actorId || 'admin-current',
        actorName || 'Admin Direction Safi',
        'super_admin',
        clusterCode,
        `Cluster Management ${clusterCode} ${unlocked ? 'débloqué pour les utilisateurs' : 'verrouillé réservé Direction'}.`
      );
    }
    return workstations;
  }

  /**
   * Super Admin/Admin/Director/EA can mark ANY cluster VIP (not just the seeded CL-F/CL-G) —
   * toggling `clusters.management_reserved` and cascading the same seat-lock/unlock as
   * toggleManagementClusterLock. This is the first code path that ever writes that column
   * after seed time.
   */
  static async setClusterVipStatus(
    clusterId: string,
    isVip: boolean,
    actorId?: string,
    actorName?: string,
    dbClient?: SupabaseClient
  ): Promise<void> {
    const db = dbClient || supabase;
    const { error } = await db.from('clusters').update({ management_reserved: isVip }).eq('id', clusterId);
    if (error) throw new Error(`Échec de mise à jour du statut VIP du cluster : ${error.message}`);

    await this.toggleManagementClusterLock(clusterId, !isVip, actorId, actorName, dbClient);
  }

  static async getClusterVipMembers(
    clusterId: string,
    dbClient?: SupabaseClient
  ): Promise<{ id: string; user_id: string; full_name: string; email: string; assigned_at: string }[]> {
    const db = dbClient || supabase;
    // cluster_vip_members has TWO foreign keys to users (user_id AND assigned_by), so the plain
    // `users(...)` embed is ambiguous — PostgREST errors, which silently fell into the
    // `error || !data` branch below and returned an empty list every time regardless of how many
    // VIP members were actually assigned. Same bug class as UserRepository.getUsers().
    const { data, error } = await db
      .from('cluster_vip_members')
      .select('id, user_id, assigned_at, users!cluster_vip_members_user_id_fkey(full_name, email)')
      .eq('cluster_id', clusterId);

    if (error || !data) return [];
    return data.map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      full_name: row.users?.full_name || 'Utilisateur inconnu',
      email: row.users?.email || '',
      assigned_at: row.assigned_at,
    }));
  }

  static async addClusterVipMember(
    clusterId: string,
    userId: string,
    assignedBy?: string,
    dbClient?: SupabaseClient,
    assignedByName?: string,
    assignedByRole?: string
  ): Promise<void> {
    const db = dbClient || supabase;
    const { isValidUuid } = await import('@/database/utils/uuid');
    const { error } = await db.from('cluster_vip_members').upsert(
      {
        cluster_id: clusterId,
        user_id: userId,
        // Demo-mode actor ids are human-readable placeholders (e.g. 'usr-dir-1'), not real UUIDs
        // — assigned_by is a nullable FK, so omit it rather than fail the whole insert.
        assigned_by: isValidUuid(assignedBy) ? assignedBy : null,
      },
      { onConflict: 'cluster_id,user_id' }
    );
    if (error) throw new Error(`Échec de l'assignation de l'utilisateur au cluster VIP : ${error.message}`);

    const { AuditRepository } = await import('@/database/repositories/auditRepository');
    await AuditRepository.logEvent(
      'UPDATE',
      assignedBy || 'system',
      assignedByName || 'Direction',
      assignedByRole || 'director',
      clusterId,
      `Utilisateur ${userId} ajouté à la liste VIP du cluster ${clusterId}.`,
      '10.120.4.18',
      'cluster_management'
    );
  }

  static async removeClusterVipMember(
    clusterId: string,
    userId: string,
    dbClient?: SupabaseClient,
    actorId?: string,
    actorName?: string,
    actorRole?: string
  ): Promise<void> {
    const db = dbClient || supabase;
    const { error } = await db
      .from('cluster_vip_members')
      .delete()
      .eq('cluster_id', clusterId)
      .eq('user_id', userId);
    if (error) throw new Error(`Échec du retrait de l'utilisateur du cluster VIP : ${error.message}`);

    const { AuditRepository } = await import('@/database/repositories/auditRepository');
    await AuditRepository.logEvent(
      'UPDATE',
      actorId || 'system',
      actorName || 'Direction',
      actorRole || 'director',
      clusterId,
      `Utilisateur ${userId} retiré de la liste VIP du cluster ${clusterId}.`,
      '10.120.4.18',
      'cluster_management'
    );
  }

  /**
   * Adds the next sequential extension seat (5-8) to a cluster. Hard-capped at 8 per cluster.
   * `reason` is mandatory (governance: every ad-hoc seat addition must state why). `isPublic`
   * controls whether the seat is open to any collaborator (reservable=true) or restricted the
   * same way a VIP-locked seat is (reservable=false — bypassable only by role or a
   * cluster_vip_members entry, see ReservationService.createReservation's BR-07 check).
   * `isTemporary` + `endAt` are read back by expireTemporarySeats() below, which the server ticker
   * calls every 60s to auto-disable seats whose window has elapsed.
   */
  static async addExtensionSeat(
    clusterId: string,
    dbClient?: SupabaseClient,
    actorId?: string,
    actorName?: string,
    actorRole?: string,
    options?: { reason: string; isPublic: boolean; isTemporary: boolean; startAt?: string; endAt?: string }
  ): Promise<Workstation> {
    const db = dbClient || supabase;

    const { data: cluster, error: clusterErr } = await db
      .from('clusters')
      .select('code, management_reserved')
      .eq('id', clusterId)
      .maybeSingle();
    if (clusterErr || !cluster) throw new Error('Cluster introuvable.');

    const { data: existing, error: wsErr } = await db
      .from('workstations')
      .select('metadata')
      .eq('cluster_id', clusterId);
    if (wsErr) throw new Error(`Échec de lecture des postes existants : ${wsErr.message}`);

    const seatNumbers = (existing || []).map((w: any) => w.metadata?.seat_number || 0);
    const nextSeat = (seatNumbers.length > 0 ? Math.max(...seatNumbers) : 0) + 1;
    if (nextSeat > 8) {
      throw new Error('Ce cluster a déjà atteint la limite maximale de 8 postes.');
    }

    const reservable = options ? options.isPublic : !cluster.management_reserved;
    const isTemporary = options?.isTemporary ?? false;
    const tempStartAt = isTemporary ? options?.startAt || new Date().toISOString() : undefined;
    const tempEndAt = isTemporary ? options?.endAt : undefined;

    const { data: created, error: insertErr } = await db
      .from('workstations')
      .insert({
        cluster_id: clusterId,
        code: `${cluster.code}-W${nextSeat}`,
        status: 'AVAILABLE',
        reservable,
        svg_position: { x: 50 + nextSeat * 100, y: 100 },
        metadata: {
          seat_number: nextSeat,
          near_window: false,
          is_pmr: false,
          is_quiet_zone: false,
          visibleToUsers: true,
          notes: options?.reason ? `[Ajout ${new Date().toLocaleDateString('fr-FR')}] ${options.reason}` : '',
          is_temporary: isTemporary,
          temp_start_at: tempStartAt,
          temp_end_at: tempEndAt,
        },
      })
      .select()
      .single();

    if (insertErr || !created) throw new Error(`Échec de la création du poste : ${insertErr?.message}`);

    const { AuditRepository } = await import('@/database/repositories/auditRepository');
    const visibilityLabel = reservable ? 'public' : 'privé';
    const durationLabel = isTemporary
      ? `temporaire jusqu'au ${tempEndAt ? new Date(tempEndAt).toLocaleString('fr-FR') : '?'}`
      : 'permanent';
    await AuditRepository.logEvent(
      'CREATE',
      actorId || 'system',
      actorName || 'Direction',
      actorRole || 'director',
      created.code,
      `Poste d'extension ${created.code} ajouté au cluster ${cluster.code} (siège ${nextSeat}/8) — ${visibilityLabel}, ${durationLabel}. Motif : ${options?.reason || 'non renseigné'}.`,
      '10.120.4.18',
      'cluster_management'
    );

    return {
      id: created.id,
      cluster_id: cluster.code.toLowerCase(),
      code: created.code,
      seat_number: nextSeat,
      status: 'disponible',
      reservable: created.reservable,
      is_extension: true,
      visibleToUsers: true,
      metadata: {
        near_window: false,
        is_pmr: false,
        is_quiet_zone: false,
        notes: created.metadata?.notes || '',
        is_temporary: isTemporary,
        temp_start_at: tempStartAt,
        temp_end_at: tempEndAt,
      },
    };
  }

  /**
   * Auto-disables temporary seats (see addExtensionSeat) whose window has elapsed. Called from a
   * 60s server ticker (backend/server.ts), same pattern as NoShowService/WaitingListService.
   * Uses jsonb containment (`.contains`) to find candidates, matching PostgREST's native support
   * rather than raw ->> text-extraction filters.
   */
  static async expireTemporarySeats(dbClient?: SupabaseClient): Promise<number> {
    const db = dbClient || supabase;
    const { data, error } = await db
      .from('workstations')
      .select('id, code, status, metadata')
      .contains('metadata', { is_temporary: true });

    if (error || !data || data.length === 0) return 0;

    const now = Date.now();
    const expired = data.filter((w: any) => {
      if (w.status === 'DISABLED') return false;
      const endAt = w.metadata?.temp_end_at;
      return !!endAt && new Date(endAt).getTime() <= now;
    });

    if (expired.length === 0) return 0;

    const { AuditRepository } = await import('@/database/repositories/auditRepository');
    for (const seat of expired) {
      const { error: updateErr } = await db
        .from('workstations')
        .update({ status: 'DISABLED', reservable: false, updated_at: new Date().toISOString() })
        .eq('id', seat.id);
      if (updateErr) continue;

      await AuditRepository.logEvent(
        'UPDATE',
        'system',
        'Système XFactory',
        'admin',
        seat.code,
        `Poste temporaire ${seat.code} désactivé automatiquement (fin de période atteinte).`,
        '10.120.4.18',
        'cluster_management'
      );
    }

    return expired.length;
  }
}

export const fetchClustersWithOverlays = WorkspaceService.fetchClustersWithOverlays.bind(WorkspaceService);
export const getSavedWorkstations = WorkspaceService.getSavedWorkstations.bind(WorkspaceService);
export const setSeatMaintenanceStatus = WorkspaceService.setSeatMaintenanceStatus.bind(WorkspaceService);
export const toggleExtensionSeatVisibility = WorkspaceService.toggleExtensionSeatVisibility.bind(WorkspaceService);
export const toggleManagementClusterLock = WorkspaceService.toggleManagementClusterLock.bind(WorkspaceService);
export const setClusterVipStatus = WorkspaceService.setClusterVipStatus.bind(WorkspaceService);
export const getClusterVipMembers = WorkspaceService.getClusterVipMembers.bind(WorkspaceService);
export const addClusterVipMember = WorkspaceService.addClusterVipMember.bind(WorkspaceService);
export const removeClusterVipMember = WorkspaceService.removeClusterVipMember.bind(WorkspaceService);
export const addExtensionSeat = WorkspaceService.addExtensionSeat.bind(WorkspaceService);
