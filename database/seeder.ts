import { supabase } from './client';
import { getAdminClient } from './serverClient';

function db() {
  return getAdminClient() || supabase;
}

export const INITIAL_CLUSTERS_SEED = [
  { code: 'CL-A', name: 'Cluster A — Innovation & R&D', management_reserved: false, enabled: true, desk_count: 4 },
  { code: 'CL-B', name: 'Cluster B — Digital Factory & Tech', management_reserved: false, enabled: true, desk_count: 4 },
  { code: 'CL-C', name: 'Cluster C — Facility Management & Operations', management_reserved: false, enabled: true, desk_count: 4 },
  { code: 'CL-D', name: 'Cluster D — Security & Infrastructure', management_reserved: false, enabled: true, desk_count: 4 },
  { code: 'CL-E', name: 'Cluster E — GCI Governance', management_reserved: false, enabled: true, desk_count: 4 },
  { code: 'CL-F', name: 'Cluster F — Executive Direction', management_reserved: true, enabled: true, desk_count: 4 },
  { code: 'CL-G', name: 'Cluster G — VIP Boardroom Annex', management_reserved: true, enabled: true, desk_count: 4 },
];

export async function seedDatabaseIfEmpty(): Promise<void> {
  try {
    // 1. Check & Seed Buildings / Spaces / Clusters
    const { data: existingClusters } = await db().from('clusters').select('id');
    
    if (!existingClusters || existingClusters.length === 0) {
      console.log('🌱 Seeding initial Supabase building, floor, space, and clusters...');

      // Seed Building
      let { data: building } = await db().from('buildings').select('id').eq('code', 'BLD-SFI-01').single();
      if (!building) {
        const { data: newBuilding } = await db().from('buildings').insert({
          name: 'Bâtiment Principal XFactory Safi',
          code: 'BLD-SFI-01',
          active: true,
        }).select().single();
        building = newBuilding;
      }

      if (building) {
        // Seed Floor
        let { data: floor } = await db().from('floors').select('id').eq('building_id', building.id).single();
        if (!floor) {
          const { data: newFloor } = await db().from('floors').insert({
            building_id: building.id,
            name: 'Niveau 1 — Open Space Smart',
            level: 1,
          }).select().single();
          floor = newFloor;
        }

        if (floor) {
          // Seed Space
          let { data: space } = await db().from('spaces').select('id').eq('floor_id', floor.id).single();
          if (!space) {
            const { data: newSpace } = await db().from('spaces').insert({
              floor_id: floor.id,
              name: 'Open Space Central Safi',
              type: 'OPEN_SPACE',
              active: true,
              capacity: 28,
            }).select().single();
            space = newSpace;
          }

          if (space) {
            // Seed Clusters & 28 Workstations (4 per cluster per SRS §3.2)
            for (const clSeed of INITIAL_CLUSTERS_SEED) {
              const { data: cluster } = await db().from('clusters').insert({
                space_id: space.id,
                code: clSeed.code,
                name: clSeed.name,
                management_reserved: clSeed.management_reserved,
                enabled: clSeed.enabled,
                desk_count: clSeed.desk_count,
              }).select().single();

              if (cluster) {
                for (let seat = 1; seat <= 4; seat++) {
                  const wsCode = `${clSeed.code}-W${seat}`;
                  await db().from('workstations').insert({
                    cluster_id: cluster.id,
                    code: wsCode,
                    status: clSeed.management_reserved ? 'MANAGEMENT_RESERVED' : 'AVAILABLE',
                    reservable: !clSeed.management_reserved,
                    svg_position: { x: 50 + seat * 100, y: 100 },
                    metadata: {
                      seat_number: seat,
                      near_window: seat === 1,
                      is_pmr: seat === 1,
                      is_quiet_zone: clSeed.code === 'CL-E',
                    },
                  });
                }
              }
            }
          }
        }
      }
    }

    // 2. Seed Default System Settings
    const { data: settings } = await db().from('settings').select('id');
    if (!settings || settings.length === 0) {
      console.log('🌱 Seeding initial Supabase system settings...');
      await db().from('settings').insert({
        max_duration_hours_no_approval: 72, // 3 days
        no_show_window_minutes: 30,
        business_days: [1, 2, 3, 4, 5],
        business_hours_start: '08:00:00',
        business_hours_end: '18:00:00',
        waiting_list_offer_expiry_minutes: 15,
      });
    }

    console.log('✅ Supabase Seeder check completed successfully.');
  } catch (err) {
    console.warn('⚠️ Seeder notice (Supabase tables ready or pending connection):', err);
  }
}
