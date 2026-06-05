// Step 1 of eBay OAuth: redirect the user to eBay's consent screen.
// The user's id rides along in `state` so the callback knows whose token to save.

import { EBAY_SCOPES } from '../lib/ebayServer.js'

export default function handler(req, res) {
  const id = process.env.EBAY_APP_ID
  const ru = process.env.EBAY_REDIRECT_URI // the eBay "RuName" for this app
  if (!id || !ru) {
    res.status(200).send('eBay listing isn’t configured yet (set EBAY_APP_ID, EBAY_CERT_ID and EBAY_REDIRECT_URI).')
    return
  }
  const uid = req.query?.uid
  if (!uid) {
    res.status(400).send('Missing user id.')
    return
  }
  const url =
    `https://auth.ebay.com/oauth2/authorize?client_id=${encodeURIComponent(id)}` +
    `&response_type=code&redirect_uri=${encodeURIComponent(ru)}` +
    `&scope=${encodeURIComponent(EBAY_SCOPES)}&state=${encodeURIComponent(uid)}`
  res.writeHead(302, { Location: url })
  res.end()
}
