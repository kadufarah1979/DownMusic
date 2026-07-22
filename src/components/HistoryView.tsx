import { useEffect, useState } from 'react'
import { api } from '../ipc'
import type { HistoryEntry } from '@shared/history'
import { groupByGenre } from '@shared/genreGroups'
import type { SourceId } from '@shared/types'

const LABEL: Record<SourceId, string> = {
  spotify: 'Spotify',
  deezer: 'Deezer',
  youtube: 'YouTube',
  soundcloud: 'SoundCloud',
  bandcamp: 'Bandcamp',
  generic: 'Outros'
}

/** Aba Historico: lista tudo que ja foi baixado (independe do arquivo existir). */
export function HistoryView() {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [byGenre, setByGenre] = useState(false)

  useEffect(() => {
    api.getHistory().then(setEntries)
  }, [])

  async function clear() {
    if (!confirm('Limpar todo o historico de downloads?')) return
    await api.clearHistory()
    setEntries([])
  }

  const sorted = [...entries].sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt))
  const groups = groupByGenre(sorted)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-neutral-800 p-4">
        <h2 className="text-sm font-semibold text-neutral-200">
          Histórico <span className="text-neutral-500">({entries.length})</span>
        </h2>
        <div className="flex items-center gap-3">
          {entries.length > 0 && (
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-400">
              <input
                type="checkbox"
                checked={byGenre}
                onChange={(e) => setByGenre(e.target.checked)}
                className="accent-emerald-500"
              />
              Agrupar por gênero
            </label>
          )}
          {entries.length > 0 && (
            <button onClick={clear} className="rounded bg-neutral-700 px-3 py-1 text-xs hover:bg-neutral-600">
              Limpar histórico
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {sorted.length === 0 ? (
          <p className="text-sm text-neutral-500">Nada baixado ainda.</p>
        ) : byGenre ? (
          <div className="space-y-5">
            {groups.map((g) => (
              <section key={g.genre}>
                <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-400">
                  {g.genre} <span className="text-neutral-600">({g.entries.length})</span>
                </h3>
                <ul className="space-y-2">
                  {g.entries.map((e, i) => (
                    <EntryRow key={`${e.nameKey}:${i}`} e={e} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <ul className="space-y-2">
            {sorted.map((e, i) => (
              <EntryRow key={`${e.nameKey}:${i}`} e={e} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function EntryRow({ e }: { e: HistoryEntry }) {
  return (
    <li className="rounded bg-neutral-800 p-3">
      <div className="text-sm">
        {e.artists.join(', ')}
        {e.artists.length ? ' — ' : ''}
        {e.title}
      </div>
      <div className="mt-1 text-xs text-neutral-500">
        {e.playlist ? `${e.playlist} · ` : ''}
        {LABEL[e.sourceId] ?? e.sourceId} · {formatDate(e.downloadedAt)}
      </div>
    </li>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR')
}
