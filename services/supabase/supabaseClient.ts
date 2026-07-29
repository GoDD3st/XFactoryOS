import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ygoqiipvarlqtvpuhrbo.supabase.co';
// Public anon key for database interactions
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlnb3FpaXB2YXJscXR2cHVocmJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODgwMDAwMDAsImV4cCI6MjAwMDAwMDAwMH0.placeholderKeyForSupabaseAuthAndClient';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export const LOCAL_STORAGE_RESERVATIONS_KEY = 'xfactory_reservations_v2';
export const LOCAL_STORAGE_WORKSTATIONS_KEY = 'xfactory_workstations_v2';
export const LOCAL_STORAGE_ROLE_KEY = 'xfactory_current_role_v2';
