import { useEffect, useMemo, useState } from 'react'
import { api } from '../ipc'
import { trackMatchesQuery } from '@shared/trackFilter'
import type { TrackMeta, SourceId } from '@shared/types'

const keyOf = (t: TrackMeta) => `${t.sourceId}:${t.id}`

const SRC_LABEL: Record<SourceId, string> = {
  spotify: 'Spotify', deezer: 'Deezer', youtube: 'YouTube',
  soundcloud: 'SoundCloud', bandcamp: 'Bandcamp', generic: 'Outros'
}

/** Formata segundos como m:ss. */
function fmtDur(sec?: number): string {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

/**
 * Lista de faixas com checkbox por item (todas marcadas por padrao),
 * filtro de texto (por titulo/artista), "marcar/desmarcar todas" e
 * "Enfileirar selecionados (N)". Filtro e uma lente: as acoes (marcar todas,
 * enfileirar, contador) operam sobre as faixas VISIVEIS (filtradas).
 * Reutilizado nos grupos da Busca e nas faixas resolvidas da aba Download.
 */
export function TrackSelectList({
  tracks,
  onEnqueued,
  isDownloaded,
  outputDir,
  onReplace
}: {
  tracks: TrackMeta[]
  onEnqueued?: () => void
  isDownloaded?: (t: TrackMeta) => boolean
  outputDir?: string
  /** Quando fornecido, habilita "Buscar versões extended" e a troca por faixa. */
  onReplace?: (original: TrackMeta, replacement: TrackMeta) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(tracks.map(keyOf)))
  const [query, setQuery] = useState('')
  const [extBusy, setExtBusy] = useState(false)
  const [extProgress, setExtProgress] = useState<{ done: number; total: number } | null>(null)
  const [candidates, setCandidates] = useState<Record<string, Partial<Record<SourceId, TrackMeta>>>>({})

  // reseta selecao (tudo marcado), limpa o filtro e as candidatas quando o conjunto muda
  useEffect(() => {
    setSelected(new Set(tracks.map(keyOf)))
    setQuery('')
    setCandidates({})
  }, [tracks])

  // busca a versão extended de cada faixa nos motores configurados (concorrência limitada)
  async function findExtendedAll() {
    setExtBusy(true)
    setCandidates({})
    const list = tracks
    setExtProgress({ done: 0, total: list.length })
    let done = 0
    let next = 0
    async function worker() {
      while (next < list.length) {
        const t = list[next++]
        try {
          const found = await api.findExtended(t)
          if (found && Object.keys(found).length > 0) {
            setCandidates((prev) => ({ ...prev, [keyOf(t)]: found }))
          }
        } catch {
          /* falha por faixa é ignorada (mantém original) */
        }
        setExtProgress({ done: ++done, total: list.length })
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, list.length) }, worker))
    setExtBusy(false)
    setExtProgress(null)
  }

  function swap(original: TrackMeta, replacement: TrackMeta) {
    onReplace?.(original, replacement)
    setCandidates((prev) => {
      const n = { ...prev }
      delete n[keyOf(original)]
      return n
    })
  }

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
    await api.enqueue(visibleSelected, outputDir)
    onEnqueued?.()
  }

  return (
    <div>
      {/* controles fixos no topo ao rolar listas longas */}
      <div className="sticky top-0 z-10 bg-neutral-900 pb-2">
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
        {onReplace && (
          <button
            onClick={findExtendedAll}
            disabled={extBusy || tracks.length === 0}
            title="Procurar a versão extended de cada faixa nos motores configurados"
            className="whitespace-nowrap rounded bg-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-600 disabled:opacity-40"
          >
            {extBusy && extProgress ? `Buscando extended ${extProgress.done}/${extProgress.total}…` : '⏱ Buscar versões extended'}
          </button>
        )}
        <button
          onClick={enqueueSelected}
          disabled={visibleSelected.length === 0}
          className="whitespace-nowrap rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          Enfileirar selecionados ({visibleSelected.length})
        </button>
      </div>

      <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-neutral-400">
        <input type="checkbox" checked={allVisibleChecked} onChange={toggleAllVisible} />
        {allVisibleChecked ? 'Desmarcar todas' : 'Marcar todas'}
        {query && <span className="text-neutral-500">(visíveis: {visible.length})</span>}
      </label>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhuma faixa corresponde ao filtro.</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((t) => (
            <li key={keyOf(t)} className="rounded bg-neutral-800 p-3">
              <div className="flex items-center gap-3">
                <input type="checkbox" checked={selected.has(keyOf(t))} onChange={() => toggle(t)} />
                <span className="flex-1 text-sm">
                  {t.artists.join(', ')}
                  {t.artists.length ? ' — ' : ''}
                  {t.title}
                </span>
                {isDownloaded?.(t) && (
                  <span
                    title="Você já baixou esta música um dia"
                    className="whitespace-nowrap rounded bg-emerald-900/60 px-2 py-0.5 text-xs text-emerald-300"
                  >
                    ✓ Baixado
                  </span>
                )}
                <button
                  onClick={() => t.sourceUrl && api.openExternal(t.sourceUrl)}
                  disabled={!t.sourceUrl}
                  title="Ouvir na plataforma de origem"
                  className="rounded px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100 disabled:opacity-30"
                >
                  ↗
                </button>
              </div>

              {onReplace && candidates[keyOf(t)] && (
                <div className="mt-2 space-y-1 border-l-2 border-emerald-800/70 pl-3">
                  <p className="text-xs text-neutral-500">Versões extended encontradas — escolha para trocar:</p>
                  {(Object.entries(candidates[keyOf(t)]) as [SourceId, TrackMeta][]).map(([src, cand]) => (
                    <div key={src} className="flex items-center gap-2 text-xs">
                      <span className="shrink-0 rounded bg-neutral-700 px-1.5 py-0.5 text-neutral-300">{SRC_LABEL[src]}</span>
                      <span className="min-w-0 flex-1 truncate text-neutral-300">
                        {cand.title}{cand.durationSec ? ` · ${fmtDur(cand.durationSec)}` : ''}
                      </span>
                      <button
                        onClick={() => cand.sourceUrl && api.openExternal(cand.sourceUrl)}
                        disabled={!cand.sourceUrl}
                        title="Ouvir esta versão"
                        className="shrink-0 rounded px-1.5 py-0.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100 disabled:opacity-30"
                      >
                        ↗
                      </button>
                      <button
                        onClick={() => swap(t, cand)}
                        className="shrink-0 rounded bg-emerald-600 px-2 py-0.5 hover:bg-emerald-500"
                      >
                        Trocar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
