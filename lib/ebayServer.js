// Server-only eBay + Supabase helpers shared by the /api/ebay-* functions.
// Not imported by the client (so the service-role key never ships to the browser).
/* global process, Buffer */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

const EBAY_OAUTH = 'https://api.ebay.com/identity/v1/oauth2/token'

// Scopes needed to create & publish listings on the user's behalf.
export const EBAY_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account',
].join(' ')

// Service-role client (bypasses RLS) — only used server-side to store/read tokens.
export function admin() {
  return createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } })
}

// Verify a Supabase JWT from the Authorization header → the user (or null).
export async function userFromAuthHeader(req) {
  const h = req.headers.authorization || req.headers.Authorization || ''
  const token = h.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const sb = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.getUser(token)
  if (error) return null
  return data.user
}

// Exchange a stored refresh token for a fresh user access token.
export async function ebayUserAccessToken(userId) {
  const { data, error } = await admin().from('ebay_accounts').select('refresh_token').eq('user_id', userId).single()
  if (error || !data) throw new Error('eBay not connected.')
  const basic = Buffer.from(`${process.env.EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`).toString('base64')
  const resp = await fetch(EBAY_OAUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(data.refresh_token)}&scope=${encodeURIComponent(EBAY_SCOPES)}`,
  })
  const j = await resp.json()
  if (!resp.ok) throw new Error(j.error_description || 'eBay token refresh failed — reconnect eBay.')
  return j.access_token
}
