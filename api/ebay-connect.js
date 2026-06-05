// Step 1 of eBay OAuth: redirect the user to eBay's consent screen.
// The user's id rides along in `state` so the callback knows whose token to save.

import { EBAY_SCOPES } from '../lib/ebayServer.js'

const APP = 'https://trailflip.vercel.app'

export default function handler(req, res) {
  const id = process.env.EBAY_APP_ID
  const ru = process.env.EBAY_REDIRECT_URI // the eBay "RuName" for this app
  if (!id || !ru) {
    res.writeHead(302, { Location: `${APP}/?ebay=notconfigured` })
    res.end()
    return
  }
  const uid = req.query?.uid
  if (!uid) {
    res.writeHead(302, { Location: `${APP}/?ebay=error` })
    res.end()
    return
  }
  const url =
    `https://auth.ebay.com/oauth2/authorize?client_id=${encodeURIComponent(id)}` +
    `&response_type=code&redirect_uri=${encodeURIComponent(ru)}` +
    `&scope=${encodeURIComponent(EBAY_SCOPES)}&state=${encodeURIComponent(uid)}`
  res.writeHead(302, { Location: url })
  res.end()
}
