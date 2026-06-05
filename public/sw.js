// Minimal service worker — ONLY handles the Web Share Target POST.
// Deliberately does NOT cache app assets, so auto-deploys are never served stale.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(handleShare(event.request))
  }
  // All other requests fall through to the network (no respondWith).
})

async function handleShare(request) {
  try {
    const form = await request.formData()
    const file = form.get('image')
    const meta = { text: form.get('text') || '', url: form.get('url') || '', title: form.get('title') || '' }
    const cache = await caches.open('trailflip-share')
    if (file && file.size) {
      await cache.put('/__shared_image', new Response(file, { headers: { 'Content-Type': file.type || 'image/jpeg' } }))
    } else {
      await cache.delete('/__shared_image')
    }
    await cache.put('/__shared_meta', new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }))
  } catch {
    /* ignore — still redirect into the app */
  }
  // Redirect (303) so the browser GETs the app, which reads the stashed share.
  return Response.redirect('/?shared=1', 303)
}
