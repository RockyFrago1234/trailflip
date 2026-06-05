/* eslint-disable */
const content = document.getElementById('content')

chrome.storage.local.get(['listing'], ({ listing }) => {
  if (!listing) {
    content.innerHTML =
      '<p>No listing queued yet.</p><p class="muted">In TrailFlip, open a listed item → "Auto-fill Facebook", then come to the Marketplace create page.</p>'
    return
  }
  const price = listing.price != null ? `$${listing.price}` : '—'
  content.innerHTML = `<p>Ready to fill:</p><div class="item"><b>${(listing.title || '').replace(/</g, '&lt;')}</b><span class="muted">${price}</span></div>`
})

document.getElementById('clear').addEventListener('click', () => {
  chrome.storage.local.remove(['listing', 'savedAt'])
  content.innerHTML = '<p class="muted">Cleared.</p>'
})
