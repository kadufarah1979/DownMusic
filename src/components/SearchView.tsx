import { useState } from 'react'
import { api } from '../ipc'
import { TrackSelectList } from './TrackSelectList'
import { useDownloadedChecker } from '../lib/downloaded'
import type { SearchGroup, SourceId, TrackMeta } from '@shared/types'

/** Plataformas pesquisaveis (Bandcamp fica de fora — yt-dlp nao busca nele). */
const PLATFORMS: { id: SourceId; label: string }[] = [
  { id: 'spotify', label: 'Spotify' },
  { id: 'deezer', label: 'Deezer' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'soundcloud', label: 'SoundCloud' }
]

/** Busca por texto em varias plataformas (multi-selecao), resultados agrupados. */
export function SearchView() {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<SourceId[]>(PLATFORMS.map((p) => p.id))
  const [groups, setGroups] = useState<SearchGroup[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isDownloaded = useDownloadedChecker()

  function toggle(id: SourceId) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function run() {
    if (!query.trim() || selected.length === 0) return
    setBusy(true)
    setError(null)
    try {
      setGroups(await api.search(query.trim(), selected))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const label = (id: SourceId) => PLATFORMS.find((p) => p.id === id)?.label ?? id

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

        <div className="mt-3 flex flex-wrap gap-4">
          {PLATFORMS.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm text-neutral-300">
              <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
              {p.label}
            </label>
          ))}
        </div>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {groups.length === 0 ? (
          <p className="text-sm text-neutral-500">Sem resultados. Faca uma busca.</p>
        ) : (
          <div className="space-y-6">
            {groups.map((g) => (
              <GroupSection key={g.sourceId} group={g} title={label(g.sourceId)} isDownloaded={isDownloaded} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function GroupSection({
  group,
  title,
  isDownloaded
}: {
  group: SearchGroup
  title: string
  isDownloaded?: (t: TrackMeta) => boolean
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-neutral-200">
        {title} <span className="text-neutral-500">({group.tracks.length})</span>
      </h2>

      {group.error ? (
        <p className="text-sm text-red-400">{group.error}</p>
      ) : group.tracks.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum resultado.</p>
      ) : (
        <TrackSelectList tracks={group.tracks} isDownloaded={isDownloaded} />
      )}
    </section>
  )
}
