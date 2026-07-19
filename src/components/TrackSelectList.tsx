import { useEffect, useState } from 'react'
import { api } from '../ipc'
import type { TrackMeta } from '@shared/types'

const keyOf = (t: TrackMeta) => `${t.sourceId}:${t.id}`

/**
 * Lista de faixas com checkbox por item (todas marcadas por padrao),
 * "marcar/desmarcar todas" e botao "Enfileirar selecionados (N)".
 * Reutilizado nos grupos da Busca e nas faixas resolvidas da aba Download.
 */
export function TrackSelectList({
  tracks,
  onEnqueued
}: {
  tracks: TrackMeta[]
  onEnqueued?: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(tracks.map(keyOf)))

  // reseta a selecao para tudo-marcado sempre que o conjunto de faixas muda
  useEffect(() => {
    setSelected(new Set(tracks.map(keyOf)))
  }, [tracks])

  function toggle(t: TrackMeta) {
    const k = keyOf(t)
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })
  }

  const allChecked = selected.size === tracks.length && tracks.length > 0
  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(tracks.map(keyOf)))
  }

  async function enqueueSelected() {
    const chosen = tracks.filter((t) => selected.has(keyOf(t)))
    if (chosen.length === 0) return
    await api.enqueue(chosen)
    onEnqueued?.()
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-400">
          <input type="checkbox" checked={allChecked} onChange={toggleAll} />
          {allChecked ? 'Desmarcar todas' : 'Marcar todas'}
        </label>
        <button
          onClick={enqueueSelected}
          disabled={selected.size === 0}
          className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium disabled:opacity-40"
        >
          Enfileirar selecionados ({selected.size})
        </button>
      </div>

      <ul className="space-y-2">
        {tracks.map((t) => (
          <li key={keyOf(t)} className="flex items-center gap-3 rounded bg-neutral-800 p-3">
            <input type="checkbox" checked={selected.has(keyOf(t))} onChange={() => toggle(t)} />
            <span className="flex-1 text-sm">
              {t.artists.join(', ')}
              {t.artists.length ? ' — ' : ''}
              {t.title}
            </span>
            <button
              onClick={() => t.sourceUrl && api.openExternal(t.sourceUrl)}
              disabled={!t.sourceUrl}
              title="Ouvir na plataforma de origem"
              className="rounded px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100 disabled:opacity-30"
            >
              ↗
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
