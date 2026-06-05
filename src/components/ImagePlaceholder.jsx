// Offline-friendly listing "photo": a category-colored gradient with the item's
// emoji front and center. Looks clean and never breaks on a missing image.

export default function ImagePlaceholder({
  from,
  to,
  emoji,
  className = '',
  emojiClass = 'text-6xl',
}) {
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-gradient-to-br ${from} ${to} ${className}`}
    >
      <div className="absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/20 blur-xl" />
      <div className="absolute -bottom-8 -left-6 h-24 w-24 rounded-full bg-black/10 blur-xl" />
      <span className={`relative ${emojiClass} drop-shadow`}>{emoji}</span>
    </div>
  )
}
