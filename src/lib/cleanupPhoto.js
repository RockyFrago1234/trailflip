// On-device background removal. Lazy-loaded so the ~model assets only download
// when the flipper actually uses it (free, private — nothing leaves the browser).
export async function cleanWhiteBg(srcUrl) {
  const { removeBackground } = await import('@imgly/background-removal')
  const cutout = await removeBackground(srcUrl) // transparent PNG blob

  // Composite onto white — marketplaces render transparency unpredictably, and
  // a clean white background sells.
  const bmp = await createImageBitmap(cutout)
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width
  canvas.height = bmp.height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0)
  bmp.close?.()
  return canvas.toDataURL('image/jpeg', 0.9)
}
