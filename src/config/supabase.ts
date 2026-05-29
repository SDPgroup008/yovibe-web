import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Initialize Supabase client
// Hardcoded values as fallback for testing (will be overridden by .env.local if present)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uqukizjohackrcwrtefk.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_P69Y2IRwywqDIjo6hXhwjw_EwbJ-qB_';

let supabase: SupabaseClient;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  console.warn(
    "⚠️ Supabase environment variables not configured. Supabase features will be unavailable. Check your .env.local file for NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
  // Create a dummy client to prevent app crashes
  supabase = createClient(
    "https://placeholder.supabase.co",
    "placeholder-key"
  );
}

export const getSupabaseClient = (): SupabaseClient => {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "Supabase client called but environment variables are not configured"
    );
  }
  return supabase as SupabaseClient;
};

export { supabase };

// Helper function to check if user is authenticated
export const isAuthenticated = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
};

// Helper function to get current user
export const getCurrentUser = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
};

// Helper function to get current session
export const getCurrentSession = async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
};

export default supabase;
