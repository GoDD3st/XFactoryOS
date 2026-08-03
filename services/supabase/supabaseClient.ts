/**
 * NOTE: This file used to create its own `createClient(...)` instance with a
 * hardcoded (non-functional placeholder) anon key, separate from the one in
 * `database/client.ts`. Having two Supabase clients with `persistSession: true`
 * in the same browser tab causes "Multiple GoTrueClient instances detected"
 * warnings and can desync auth state between them. Now there is a single
 * client, sourced from environment variables (VITE_SUPABASE_URL /
 * VITE_SUPABASE_ANON_KEY), re-exported here for backward compatibility with
 * existing imports.
 */
export { supabase } from '@/database/client';

export const LOCAL_STORAGE_RESERVATIONS_KEY = 'xfactory_reservations_v2';
export const LOCAL_STORAGE_WORKSTATIONS_KEY = 'xfactory_workstations_v2';
export const LOCAL_STORAGE_ROLE_KEY = 'xfactory_current_role_v2';
