import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../ipc'
import { trackMatchesQuery } from '@shared/trackFilter'
import { isDurationVerified } from '@shared/extended'
import {
  isDifferentList,
  pruneCandidates,
  pruneSelection,
  remapKey
} from '@shared/trackListState'
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
  const [candidates, setCandidates] = useState<Record<string, Partial<Record<SourceId, TrackMeta>>>>({})
  /** Resultado da busca por faixa: em andamento, sem candidata, ou falha. */
  const [extPerTrack, setExtPerTrack] = useState<Record<string, 'pending' | 'empty' | 'error'>>({})
  const prevKeys = useRef<string[]>([])

  // O array de `tracks` tambem muda de identidade quando UMA faixa e trocada
  // pela versao extended. Nesse caso o estado das demais tem que sobreviver —
  // so uma lista de verdade nova (nenhuma faixa em comum) justifica zerar tudo.
  useEffect(() => {
    const keys = tracks.map(keyOf)
    if (isDifferentList(prevKeys.current, keys)) {
      setSelected(new Set(keys))
      setQuery('')
      setCandidates({})
      setExtPerTrack({})
    } else {
      setSelected((prev) => pruneSelection(prev, keys))
      setCandidates((prev) => pruneCandidates(prev, keys))
      setExtPerTrack((prev) => pruneCandidates(prev, keys))
    }
    prevKeys.current = keys
  }, [tracks])

  /** Busca a extended de UMA faixa e mescla o resultado, sem tocar nas demais. */
  async function findExtendedOne(t: TrackMeta) {
    const k = keyOf(t)
    setExtPerTrack((p) => ({ ...p, [k]: 'pending' }))
    try {
      const found = await api.findExtended(t)
      if (found && Object.keys(found).length > 0) {
        setCandidates((prev) => ({ ...prev, [k]: found }))
        setExtPerTrack((p) => {
          const n = { ...p }
          delete n[k]
          return n
        })
      } else {
        setExtPerTrack((p) => ({ ...p, [k]: 'empty' }))
      }
    } catch {
      setExtPerTrack((p) => ({ ...p, [k]: 'error' }))
    }
  }

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
        await findExtendedOne(list[next++])
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
    setCandidates((prev) => {
      const n = { ...prev }
      delete n[from]
      return n
    })
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
                  <button
                    onClick={() => findExtendedOne(t)}
                    disabled={extPerTrack[keyOf(t)] === 'pending' || extBusy}
                    title="Procurar a versão extended desta faixa"
                    className="rounded px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100 disabled:opacity-30"
                  >
                    {extPerTrack[keyOf(t)] === 'pending' ? '…' : '⏱'}
                  </button>
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

              {extPerTrack[keyOf(t)] === 'empty' && (
                <p className="mt-2 pl-8 text-xs text-neutral-500">
                  Nenhuma versão extended encontrada — versões pouco mais longas que a original
                  ou desproporcionalmente longas (DJ sets, megamixes) são descartadas.
                </p>
              )}
              {extPerTrack[keyOf(t)] === 'error' && (
                <p className="mt-2 pl-8 text-xs text-red-400">
                  Falha ao buscar a versão extended desta faixa.
                </p>
              )}

              {onReplace && candidates[keyOf(t)] && (
                <div className="mt-2 space-y-1 border-l-2 border-emerald-800/70 pl-3">
                  <p className="text-xs text-neutral-500">Versões extended encontradas — escolha para trocar:</p>
                  {(Object.entries(candidates[keyOf(t)]) as [SourceId, TrackMeta][]).map(([src, cand]) => (
                    <div key={src} className="flex items-center gap-2 text-xs">
                      <span className="shrink-0 rounded bg-neutral-700 px-1.5 py-0.5 text-neutral-300">{SRC_LABEL[src]}</span>
                      <span className="min-w-0 flex-1 truncate text-neutral-300">
                        {cand.title}{cand.durationSec ? ` · ${fmtDur(cand.durationSec)}` : ''}
                      </span>
                      {!isDurationVerified({ originalTitle: t.title, originalDurationSec: t.durationSec }, cand) && (
                        <span
                          title={
                            t.durationSec
                              ? 'Esta versão não informa a duração — só o nome foi conferido.'
                              : 'A faixa original não informa a duração — só o nome foi conferido.'
                          }
                          className="shrink-0 rounded bg-amber-900/60 px-1.5 py-0.5 text-amber-300"
                        >
                          ⚠ tempo não conferido
                        </span>
                      )}
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
