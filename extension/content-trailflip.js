/* eslint-disable */
// Runs on trailflip.vercel.app. Receives a listing the app posts when you click
// "Auto-fill Facebook", and stashes it for the Facebook content script to use.

window.addEventListener('message', (e) => {
  if (e.source !== window) return
  const d = e.data
  if (d && d.source === 'trailflip-lister' && d.listing) {
    chrome.storage.local.set({ listing: d.listing, savedAt: Date.now() })
    window.postMessage({ source: 'trailflip-lister-ext', type: 'stored' }, '*')
  }
})

// Let the page know the extension is installed (so it can show a ✓).
window.postMessage({ source: 'trailflip-lister-ext', type: 'ready' }, '*')
