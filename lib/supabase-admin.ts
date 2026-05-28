import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function isValidHttpUrl(value?: string) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && value.includes("supabase.co");
  } catch {
    return false;
  }
}

function hasUsableServiceRoleKey(value?: string) {
  return Boolean(value && value.split(".").length === 3);
}

export const isSupabaseAdminConfigured = isValidHttpUrl(supabaseUrl) && hasUsableServiceRoleKey(serviceRoleKey);

export const supabaseAdmin = isSupabaseAdminConfigured
  ? createClient(supabaseUrl as string, serviceRoleKey as string, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;
