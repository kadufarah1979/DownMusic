import { useState } from 'react'
import { api } from '../ipc'
import type { TrackMeta } from '@shared/types'

/** Cola um link, resolve as faixas e entrega para selecao (nao enfileira direto). */
export function UrlBar({ onResolved }: { onResolved: (tracks: TrackMeta[]) => void }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!url.trim()) return
    setBusy(true)
    setError(null)
    try {
      const tracks = await api.resolve(url.trim())
      onResolved(tracks)
      setUrl('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-b border-neutral-800 p-4">
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Cole um link ou canal (YouTube, Spotify, Deezer, SoundCloud, TikTok, Vimeo, Dailymotion...)"
          className="flex-1 rounded bg-neutral-800 px-3 py-2 text-sm outline-none placeholder:text-neutral-500"
        />
        <button
          onClick={submit}
          disabled={busy}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? '...' : 'Resolver'}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <p className="mt-2 text-xs text-neutral-500">
        💡 Arraste o link para iniciar o download da sua música, playlist, canal…
      </p>
    </div>
  )
}
