import { Component } from 'react'

// Catches any render crash so users get a reload screen (and the error text to
// relay) instead of a blank white page. Inline styles so it works even if the
// stylesheet failed to load.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('TrailFlip crashed:', error, info)
  }

  async hardReload() {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.()
      regs?.forEach((r) => r.unregister())
    } catch { /* ignore */ }
    window.location.replace('/')
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ maxWidth: 440, textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>🧭</div>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: '8px 0', color: '#0f172a' }}>Something glitched</h1>
          <p style={{ color: '#475569', fontSize: 14 }}>TrailFlip hit an error while loading. A refresh usually clears it.</p>
          <pre style={{ textAlign: 'left', whiteSpace: 'pre-wrap', background: '#f1f5f9', padding: 10, borderRadius: 10, fontSize: 11, color: '#b91c1c', marginTop: 10, overflow: 'auto', maxHeight: 160 }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button onClick={() => this.hardReload()} style={{ marginTop: 12, padding: '10px 22px', border: 0, borderRadius: 9999, background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            Reload TrailFlip
          </button>
        </div>
      </div>
    )
  }
}
