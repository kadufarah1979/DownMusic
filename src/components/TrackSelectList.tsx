import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../ipc'
import { trackMatchesQuery } from '@shared/trackFilter'
import { isDifferentList, pruneSelection, remapKey } from '@shared/trackListState'
import { ExtendedButton, ExtendedCandidates } from './ExtendedCandidates'
import { keyOf, useExtendedSearch } from '../lib/useExtendedSearch'
import type { TrackMeta } from '@shared/types'

/**
 * Lista de faixas com checkbox por item (todas marcadas por padrao),
 * filtro de texto (por titulo/artista), "marcar/desmarcar todas" e
 * "Baixar selecionados (N)". Filtro e uma lente: as acoes (marcar todas,
 * baixar, contador) operam sobre as faixas VISIVEIS (filtradas).
 * Reutilizado nos grupos da Busca e nas faixas resolvidas da aba Download.
 * Enfileirar desmarca as faixas enviadas e MANTEM a lista na tela, para
 * baixar a mesma playlist em varias levas sem resolver o link de novo.
 */
export function TrackSelectList({
  tracks,
  isDownloaded,
  outputDir,
  onReplace
}: {
  tracks: TrackMeta[]
  isDownloaded?: (t: TrackMeta) => boolean
  outputDir?: string
  /** Quando fornecido, habilita "Buscar versões extended" e a troca por faixa. */
  onReplace?: (original: TrackMeta, replacement: TrackMeta) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(tracks.map(keyOf)))
  const [query, setQuery] = useState('')
  const [extBusy, setExtBusy] = useState(false)
  const [extProgress, setExtProgress] = useState<{ done: number; total: number } | null>(null)
  const ext = useExtendedSearch()
  const prevKeys = useRef<string[]>([])

  // O array de `tracks` tambem muda de identidade quando UMA faixa e trocada
  // pela versao extended. Nesse caso o estado das demais tem que sobreviver —
  // so uma lista de verdade nova (nenhuma faixa em comum) justifica zerar tudo.
  useEffect(() => {
    const keys = tracks.map(keyOf)
    if (isDifferentList(prevKeys.current, keys)) {
      setSelected(new Set(keys))
      setQuery('')
      ext.reset()
    } else {
      setSelected((prev) => pruneSelection(prev, keys))
      ext.prune(keys)
    }
    prevKeys.current = keys
  }, [tracks])

  // busca a versão extended de cada faixa nos motores configurados (concorrência limitada)
  async function findExtendedAll() {
    setExtBusy(true)
    const list = tracks
    setExtProgress({ done: 0, total: list.length })
    let done = 0
    let next = 0
    async function worker() {
      while (next < list.length) {
        // mescla (nao zera): o que ja foi achado por busca individual permanece
        await ext.find(list[next++])
        setExtProgress({ done: ++done, total: list.length })
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, list.length) }, worker))
    setExtBusy(false)
    setExtProgress(null)
  }

  function swap(original: TrackMeta, replacement: TrackMeta) {
    const from = keyOf(original)
    const to = keyOf(replacement)
    // a faixa nova herda o "marcado" da original, em vez de voltar ao default
    setSelected((prev) => remapKey(prev, from, to))
    ext.dropFor(original)
    onReplace?.(original, replacement)
  }

  const visible = useMemo(() => tracks.filter((t) => trackMatchesQuery(t, query)), [tracks, query])

  function toggle(t: TrackMeta) {
    const k = keyOf(t)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
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

  // desmarca so o que foi enfileirado: a lista continua na tela para a
  // proxima leva da mesma playlist, sem precisar resolver o link de novo
  async function enqueueSelected() {
    const enqueued = visibleSelected
    if (enqueued.length === 0) return
    await api.enqueue(enqueued, outputDir)
    setSelected((prev) => {
      const next = new Set(prev)
      enqueued.forEach((t) => next.delete(keyOf(t)))
      return next
    })
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
          Baixar selecionados ({visibleSelected.length})
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
                {onReplace && (
                  <ExtendedButton
                    pending={ext.status[keyOf(t)] === 'pending'}
                    disabled={extBusy}
                    onClick={() => ext.find(t)}
                  />
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

              {onReplace && (
                <ExtendedCandidates
                  track={t}
                  status={ext.status[keyOf(t)]}
                  candidates={ext.candidates[keyOf(t)]}
                  onSwap={swap}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
