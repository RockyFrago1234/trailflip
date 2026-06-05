import { createClient } from '@supabase/supabase-js'

// These are injected at build time by Vite from .env.local (local) and from
// Vercel project env vars (production). The anon key is meant to be public —
// data access is controlled by Row-Level-Security policies in the database.
const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anon)

export const supabase = isSupabaseConfigured ? createClient(url, anon) : null
