import { useState } from 'react'
import { api } from '../ipc'
import type { TrackMeta } from '@shared/types'

/** Busca por texto (Spotify) e permite enfileirar resultados. */
export function SearchView() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TrackMeta[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    if (!query.trim()) return
    setBusy(true)
    setError(null)
    try {
      setResults(await api.search(query.trim(), 'spotify'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-neutral-800 p-4">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder="Buscar por musica, artista, album..."
            className="flex-1 rounded bg-neutral-800 px-3 py-2 text-sm outline-none placeholder:text-neutral-500"
          />
          <button onClick={run} disabled={busy} className="rounded bg-emerald-600 px-4 py-2 text-sm disabled:opacity-50">
            {busy ? '...' : 'Buscar'}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {results.length === 0 ? (
          <p className="text-sm text-neutral-500">Sem resultados.</p>
        ) : (
          <ul className="space-y-2">
            {results.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded bg-neutral-800 p-3">
                <span className="text-sm">
                  {t.artists.join(', ')} — {t.title}
                </span>
                <button
                  onClick={() => api.enqueue([t])}
                  className="rounded bg-neutral-700 px-3 py-1 text-xs hover:bg-neutral-600"
                >
                  Enfileirar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
