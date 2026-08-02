import { createClient } from '@supabase/supabase-js';

const getEnvVar = (key: string): string | undefined => {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  try {
    const env = (import.meta as any)?.env;
    if (env && env[key]) return env[key];
  } catch (e) {
    // Ignore in environments without import.meta
  }
  return undefined;
};

const SUPABASE_URL = getEnvVar('VITE_SUPABASE_URL') || getEnvVar('NEXT_PUBLIC_SUPABASE_URL') || 'https://ygoqiipvarlqtvpuhrbo.supabase.co';
const SUPABASE_ANON_KEY = getEnvVar('VITE_SUPABASE_ANON_KEY') || getEnvVar('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || 'sb_publishable_m7jjUWcAzx88qUJ_s_PJnw_bAMgNsOD';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export class DatabaseError extends Error {
  constructor(public table: string, public action: string, message: string, public rawError?: any) {
    super(`[DB Error - Table: ${table} | Action: ${action}] ${message}`);
    this.name = 'DatabaseError';
  }
}

/**
 * Standardized database execution wrapper with error logging
 */
export async function executeDbQuery<T>(
  table: string,
  action: string,
  queryFn: () => Promise<{ data: T | null; error: any }>
): Promise<T> {
  try {
    const { data, error } = await queryFn();
    if (error) {
      console.error(`❌ DB Error on [${table}.${action}]:`, error);
      throw new DatabaseError(table, action, error.message || 'Database query failed', error);
    }
    return data as T;
  } catch (err: any) {
    if (err instanceof DatabaseError) throw err;
    console.error(`❌ DB Execution Exception on [${table}.${action}]:`, err);
    throw new DatabaseError(table, action, err?.message || 'Unexpected database failure', err);
  }
}
