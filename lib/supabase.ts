"use client";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const fallbackSupabaseUrl = "https://placeholder.supabase.co";
const fallbackSupabaseAnonKey = "placeholder-anon-key";

function isValidHttpUrl(value?: string) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && value.includes("supabase.co");
  } catch {
    return false;
  }
}

function hasUsableAnonKey(value?: string) {
  return Boolean(value && !value.includes("your-anon-key") && value.split(".").length === 3);
}

export const isSupabaseConfigured = isValidHttpUrl(supabaseUrl) && hasUsableAnonKey(supabaseAnonKey);

export const supabaseConfigError = !isValidHttpUrl(supabaseUrl)
  ? "NEXT_PUBLIC_SUPABASE_URL harus berupa URL project Supabase, contoh https://abcd.supabase.co."
  : !hasUsableAnonKey(supabaseAnonKey)
    ? "NEXT_PUBLIC_SUPABASE_ANON_KEY belum diisi dengan anon key Supabase."
    : "";

const resolvedSupabaseUrl = isValidHttpUrl(supabaseUrl) ? supabaseUrl as string : fallbackSupabaseUrl;
const resolvedSupabaseAnonKey = hasUsableAnonKey(supabaseAnonKey) ? supabaseAnonKey as string : fallbackSupabaseAnonKey;

export const supabase = createClient(resolvedSupabaseUrl, resolvedSupabaseAnonKey);
