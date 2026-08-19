import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './client';
import { getAdminClient, getServerWriteClient, extractBearerToken } from './serverClient';

/**
 * Returns the Supabase client appropriate for the current runtime.
 * - Browser: shared anon client (user session attached automatically)
 * - Server: service-role client when configured, else user JWT client
 */
export function getDbClient(accessToken?: string): SupabaseClient {
  if (typeof window !== 'undefined') return supabase;
  return getServerWriteClient(accessToken);
}

/** Server-only admin client - throws a clear error if service role key is missing. */
export function requireAdminClient(): SupabaseClient {
  const admin = getAdminClient();
  if (!admin) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY manquant dans .env. ' +
        'Ajoutez la clé service_role depuis Supabase Dashboard → Project Settings → API, puis redémarrez le serveur.'
    );
  }
  return admin;
}

export function hasAdminClient(): boolean {
  return getAdminClient() !== null;
}