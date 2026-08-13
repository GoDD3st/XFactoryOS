import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabase as sharedSupabase } from './client';

const getEnvVar = (key: string): string | undefined => {
  if (typeof process !== 'undefined' && process.env?.[key]) return process.env[key];
  try {
    const env = (import.meta as any)?.env;
    if (env?.[key]) return env[key];
  } catch {
    // ignore
  }
  return undefined;
};

const SUPABASE_URL =
  getEnvVar('VITE_SUPABASE_URL') ||
  getEnvVar('NEXT_PUBLIC_SUPABASE_URL') ||
  'https://ygoqiipvarlqtvpuhrbo.supabase.co';

const SUPABASE_ANON_KEY =
  getEnvVar('VITE_SUPABASE_ANON_KEY') ||
  getEnvVar('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ||
  'sb_publishable_m7jjUWcAzx88qUJ_s_PJnw_bAMgNsOD';

const SUPABASE_SERVICE_ROLE_KEY = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');

let adminClient: SupabaseClient | null = null;

/** Server-side Supabase client with service role (bypasses RLS). Never expose to browser. */
export function getAdminClient(): SupabaseClient | null {
  if (typeof window !== 'undefined') return null;
  if (!SUPABASE_SERVICE_ROLE_KEY) return null;

  if (!adminClient) {
    adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

/** Supabase client scoped to a user's JWT (respects RLS as that user). */
export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Best client for server DB writes: service role → user JWT → shared anon. */
export function getServerWriteClient(accessToken?: string): SupabaseClient {
  const admin = getAdminClient();
  if (admin) return admin;
  if (accessToken) return createUserClient(accessToken);
  return sharedSupabase;
}

/** Whether the service-role key is configured (server only). */
export function hasAdminClient(): boolean {
  return getAdminClient() !== null;
}

/**
 * Fresh anon-key client with no persisted session — used only to verify a password via
 * signInWithPassword (step-up re-authentication before a sensitive action) without touching or
 * replacing the caller's own active session/token.
 */
export function createVerificationClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Server-only admin client — throws if service role key is missing. */
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

/** Extract Bearer token from Express request headers. */
export function extractBearerToken(authHeader?: string): string | undefined {
  if (!authHeader?.startsWith('Bearer ')) return undefined;
  return authHeader.substring(7);
}
