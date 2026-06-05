/* eslint-disable */
// Runs on facebook.com/marketplace/create/*. Reads the listing stashed by the
// TrailFlip page and fills the form's text fields. FB uses React-controlled
// inputs, so we set the value via the native setter and dispatch input events.
// Photos and the category/condition pickers are left for you (file inputs can't
// be set by scripts, and the pickers are menus) — title/price/description are
// the big time-savers.

function setNativeValue(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
  setter.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  el.dispatchEvent(new Event('blur', { bubbles: true }))
}

function fieldFor(labels) {
  const els = [...document.querySelectorAll('input[aria-label], textarea[aria-label]')]
  return els.find((el) => {
    const a = (el.getAttribute('aria-label') || '').toLowerCase()
    return labels.some((l) => a.includes(l))
  })
}

function wait(fn, timeout = 20000, step = 400) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const tick = () => {
      let r = null
      try { r = fn() } catch { /* ignore */ }
      if (r) return resolve(r)
      if (Date.now() - t0 > timeout) return resolve(null)
      setTimeout(tick, step)
    }
    tick()
  })
}

async function run() {
  const { listing, savedAt } = await chrome.storage.local.get(['listing', 'savedAt'])
  if (!listing) return
  // Only act on a recent hand-off (last 10 min), so old data doesn't refill later.
  if (savedAt && Date.now() - savedAt > 10 * 60 * 1000) return

  const title = await wait(() => fieldFor(['title']))
  if (!title) return
  setNativeValue(title, listing.title || '')

  const price = fieldFor(['price'])
  if (price && listing.price != null) setNativeValue(price, String(listing.price))

  const desc = fieldFor(['description'])
  if (desc && listing.description) setNativeValue(desc, listing.description)

  // Best-effort toast so you know it worked.
  const note = document.createElement('div')
  note.textContent = '✓ TrailFlip filled title, price & description — add photos, pick category/condition, then post.'
  note.style.cssText =
    'position:fixed;z-index:99999;left:50%;bottom:24px;transform:translateX(-50%);background:#16a34a;color:#fff;padding:10px 16px;border-radius:9999px;font:600 13px system-ui;box-shadow:0 4px 16px rgba(0,0,0,.2)'
  document.body.appendChild(note)
  setTimeout(() => note.remove(), 6000)

  // One-shot: clear so navigating around doesn't refill.
  chrome.storage.local.remove(['listing', 'savedAt'])
}

run()
