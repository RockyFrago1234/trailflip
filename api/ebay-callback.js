// Step 2 of eBay OAuth: eBay redirects here with a code. Exchange it for tokens
// and store the refresh token (service role) for the user carried in `state`.

import { admin } from '../lib/ebayServer.js'

const APP = 'https://trailflip.vercel.app'

export default async function handler(req, res) {
  const { code, state } = req.query || {}
  if (!code || !state) {
    res.writeHead(302, { Location: `${APP}/?ebay=error` })
    res.end()
    return
  }
  try {
    const basic = Buffer.from(`${process.env.EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`).toString('base64')
    const resp = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
      body: `grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(process.env.EBAY_REDIRECT_URI)}`,
    })
    const j = await resp.json()
    if (!resp.ok) throw new Error(j.error_description || 'token exchange failed')
    await admin().from('ebay_accounts').upsert({
      user_id: state,
      refresh_token: j.refresh_token,
      updated_at: new Date().toISOString(),
    })
    res.writeHead(302, { Location: `${APP}/?ebay=connected` })
    res.end()
  } catch (err) {
    console.error('ebay-callback error:', err)
    res.writeHead(302, { Location: `${APP}/?ebay=error` })
    res.end()
  }
}
