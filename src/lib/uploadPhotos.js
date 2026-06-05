import { supabase } from './supabase'

function dataURLtoBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(',')
  const mime = /data:(.*?);/.exec(meta)?.[1] || 'image/jpeg'
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

// Uploads resized data-URL photos to the listing-photos bucket under the
// user's folder and returns their public URLs (first = cover).
export async function uploadListingPhotos(userId, dataUrls) {
  const urls = []
  for (let i = 0; i < dataUrls.length; i++) {
    const blob = dataURLtoBlob(dataUrls[i])
    const path = `${userId}/${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.jpg`
    const { error } = await supabase.storage
      .from('listing-photos')
      .upload(path, blob, { contentType: blob.type, upsert: false })
    if (error) throw error
    urls.push(supabase.storage.from('listing-photos').getPublicUrl(path).data.publicUrl)
  }
  return urls
}
