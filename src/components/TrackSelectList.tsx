import { useEffect, useMemo, useState } from 'react'
import { api } from '../ipc'
import { trackMatchesQuery } from '@shared/trackFilter'
import type { TrackMeta } from '@shared/types'

const keyOf = (t: TrackMeta) => `${t.sourceId}:${t.id}`

/**
 * Lista de faixas com checkbox por item (todas marcadas por padrao),
 * filtro de texto (por titulo/artista), "marcar/desmarcar todas" e
 * "Enfileirar selecionados (N)". Filtro e uma lente: as acoes (marcar todas,
 * enfileirar, contador) operam sobre as faixas VISIVEIS (filtradas).
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
  const [query, setQuery] = useState('')

  // reseta selecao (tudo marcado) e limpa o filtro quando o conjunto muda
  useEffect(() => {
    setSelected(new Set(tracks.map(keyOf)))
    setQuery('')
  }, [tracks])

  const visible = useMemo(() => tracks.filter((t) => trackMatchesQuery(t, query)), [tracks, query])

  function toggle(t: TrackMeta) {
    const k = keyOf(t)
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })
  }

  // "marcar/desmarcar todas" e contador operam sobre as VISIVEIS
  const visibleSelected = visible.filter((t) => selected.has(keyOf(t)))
  const allVisibleChecked = visible.length > 0 && visibleSelected.length === visible.length

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleChecked) visible.forEach((t) => next.delete(keyOf(t)))
      else visible.forEach((t) => next.add(keyOf(t)))
      return next
    })
  }

  async function enqueueSelected() {
    if (visibleSelected.length === 0) return
    await api.enqueue(visibleSelected)
    onEnqueued?.()
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <div className="relative flex-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar nesta lista..."
            className="w-full rounded bg-neutral-800 px-3 py-1.5 pr-7 text-sm outline-none placeholder:text-neutral-500"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              title="Limpar filtro"
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-1 text-neutral-400 hover:text-neutral-100"
            >
              ×
            </button>
          )}
        </div>
        <button
          onClick={enqueueSelected}
          disabled={visibleSelected.length === 0}
          className="whitespace-nowrap rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          Enfileirar selecionados ({visibleSelected.length})
        </button>
      </div>

      <label className="mb-2 flex w-fit cursor-pointer items-center gap-2 text-xs text-neutral-400">
        <input type="checkbox" checked={allVisibleChecked} onChange={toggleAllVisible} />
        {allVisibleChecked ? 'Desmarcar todas' : 'Marcar todas'}
        {query && <span className="text-neutral-500">(visíveis: {visible.length})</span>}
      </label>

      {visible.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhuma faixa corresponde ao filtro.</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((t) => (
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
      )}
    </div>
  )
}
