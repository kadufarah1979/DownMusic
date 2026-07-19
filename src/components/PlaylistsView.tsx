import { useEffect, useState } from 'react'
import { api } from '../ipc'
import { PlaylistTracks } from './PlaylistTracks'
import { useDownloadedChecker } from '../lib/downloaded'
import { useQueueStatus } from '../lib/queueStatus'
import type { PlaylistCompletion, PlaylistSubscription, SourceId, TrackMeta } from '@shared/types'

const LABEL: Record<SourceId, string> = {
  spotify: 'Spotify',
  deezer: 'Deezer',
  youtube: 'YouTube',
  soundcloud: 'SoundCloud',
  bandcamp: 'Bandcamp'
}

type TracksState = 'loading' | TrackMeta[] | { error: string }

/** Aba Playlists: cadastra, sincroniza e expande para ver o status de cada faixa. */
export function PlaylistsView() {
  const [subs, setSubs] = useState<PlaylistSubscription[]>([])
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [tracks, setTracks] = useState<Record<string, TracksState>>({})
  const [completions, setCompletions] = useState<Record<string, 'searching' | PlaylistCompletion[]>>({})

  const isDownloaded = useDownloadedChecker()
  const queueStateOf = useQueueStatus()

  const reload = () => api.getPlaylists().then(setSubs)
  useEffect(() => {
    reload()
  }, [])

  async function toggle(sub: PlaylistSubscription) {
    if (expanded === sub.url) {
      setExpanded(null)
      return
    }
    setExpanded(sub.url)
    if (!tracks[sub.url] || 'error' in (tracks[sub.url] as any)) {
      setTracks((p) => ({ ...p, [sub.url]: 'loading' }))
      try {
        const list = await api.resolve(sub.url)
        setTracks((p) => ({ ...p, [sub.url]: list }))
      } catch (e) {
        setTracks((p) => ({ ...p, [sub.url]: { error: e instanceof Error ? e.message : String(e) } }))
      }
    }
  }

  async function add() {
    if (!url.trim()) return
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      const sub = await api.addPlaylist(url.trim())
      setUrl('')
      setMsg(`Playlist "${sub.name}" cadastrada (${sub.trackCount} faixas).`)
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function sync(sub: PlaylistSubscription) {
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      const r = await api.syncPlaylist(sub.url)
      setMsg(`"${sub.name}": ${r.added} nova(s) enfileirada(s) de ${r.total}.`)
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function syncAll() {
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      const r = await api.syncAllPlaylists()
      setMsg(`${r.added} nova(s) enfileirada(s) no total.`)
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove(sub: PlaylistSubscription) {
    await api.removePlaylist(sub.url)
    reload()
  }

  // procura playlists equivalentes em outras plataformas (com autorizacao do usuario)
  async function procurar(sub: PlaylistSubscription) {
    setCompletions((p) => ({ ...p, [sub.url]: 'searching' }))
    try {
      const res = await api.findCompletions(sub.url)
      setCompletions((p) => ({ ...p, [sub.url]: res }))
    } catch {
      setCompletions((p) => ({ ...p, [sub.url]: [] }))
    }
  }

  // importa as faixas extras da candidata escolhida (merge client-side)
  function importar(sub: PlaylistSubscription, comp: PlaylistCompletion) {
    const base = tracks[sub.url]
    if (!Array.isArray(base)) return
    setTracks((p) => ({ ...p, [sub.url]: [...base, ...comp.extras] }))
    setCompletions((p) => ({ ...p, [sub.url]: [] })) // esconde o painel apos importar
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-neutral-800 p-4">
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Colar link da playlist (Spotify, Deezer, YouTube, SoundCloud)"
            className="flex-1 rounded bg-neutral-800 px-3 py-2 text-sm outline-none placeholder:text-neutral-500"
          />
          <button onClick={add} disabled={busy} className="rounded bg-emerald-600 px-4 py-2 text-sm disabled:opacity-50">
            {busy ? '...' : 'Adicionar'}
          </button>
        </div>
        <div className="mt-2 flex items-center gap-3">
          {subs.length > 0 && (
            <button
              onClick={syncAll}
              disabled={busy}
              className="rounded bg-neutral-700 px-3 py-1 text-xs hover:bg-neutral-600 disabled:opacity-50"
            >
              ↻ Sincronizar todas
            </button>
          )}
          {msg && <span className="text-xs text-emerald-400">{msg}</span>}
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {subs.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhuma playlist cadastrada. Cole um link acima.</p>
        ) : (
          <ul className="space-y-2">
            {subs.map((s) => {
              const open = expanded === s.url
              const st = tracks[s.url]
              return (
                <li key={s.url} className="rounded bg-neutral-800">
                  <div className="flex items-center justify-between gap-3 p-3">
                    <button onClick={() => toggle(s)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <span className="text-neutral-500">{open ? '▾' : '▸'}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{s.name}</span>
                        <span className="mt-1 block text-xs text-neutral-500">
                          {LABEL[s.sourceId] ?? s.sourceId} · {s.trackCount} faixas
                          {s.lastSyncedAt ? ` · sync ${formatDate(s.lastSyncedAt)}` : ' · nunca sincronizada'}
                        </span>
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => sync(s)}
                        disabled={busy}
                        className="rounded bg-emerald-700 px-3 py-1 text-xs hover:bg-emerald-600 disabled:opacity-50"
                      >
                        ↻ Sincronizar
                      </button>
                      <button
                        onClick={() => remove(s)}
                        className="rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-700 hover:text-red-300"
                      >
                        remover
                      </button>
                    </div>
                  </div>

                  {open && (
                    <div className="border-t border-neutral-700 p-3">
                      {st === 'loading' || st === undefined ? (
                        <p className="text-sm text-neutral-500">Carregando faixas...</p>
                      ) : 'error' in st ? (
                        <p className="text-sm text-red-400">{st.error}</p>
                      ) : (
                        <>
                          {s.sourceId === 'spotify' && st.length >= 100 && (
                            <CompletionPanel
                              state={completions[s.url]}
                              onSearch={() => procurar(s)}
                              onImport={(c) => importar(s, c)}
                            />
                          )}
                          <PlaylistTracks
                            tracks={st}
                            isDownloaded={isDownloaded}
                            queueStateOf={queueStateOf}
                            playlistSourceId={s.sourceId}
                          />
                        </>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR')
}

/** Aviso de truncamento + busca/importacao de playlist equivalente (com consentimento). */
function CompletionPanel({
  state,
  onSearch,
  onImport
}: {
  state: 'searching' | PlaylistCompletion[] | undefined
  onSearch: () => void
  onImport: (c: PlaylistCompletion) => void
}) {
  return (
    <div className="mb-3 rounded border border-amber-900/50 bg-amber-950/30 p-3">
      <p className="text-xs text-amber-300">
        ⚠ O Spotify limita esta playlist a 100 faixas. Posso procurar a mesma playlist em outra plataforma para
        completar.
      </p>

      {state === undefined && (
        <button
          onClick={onSearch}
          className="mt-2 rounded bg-neutral-700 px-3 py-1 text-xs hover:bg-neutral-600"
        >
          🔎 Procurar em outras plataformas
        </button>
      )}

      {state === 'searching' && <p className="mt-2 text-xs text-neutral-400">Procurando (Deezer e YouTube)...</p>}

      {Array.isArray(state) &&
        (state.length === 0 ? (
          <p className="mt-2 text-xs text-neutral-400">Nenhuma playlist equivalente encontrada em outra plataforma.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {state.map((c) => (
              <CandidateRow key={c.url} c={c} onImport={() => onImport(c)} />
            ))}
          </ul>
        ))}
    </div>
  )
}

const PLAT: Record<SourceId, string> = {
  spotify: 'Spotify',
  deezer: 'Deezer',
  youtube: 'YouTube',
  soundcloud: 'SoundCloud',
  bandcamp: 'Bandcamp'
}

function CandidateRow({ c, onImport }: { c: PlaylistCompletion; onImport: () => void }) {
  const [showTracks, setShowTracks] = useState(false)
  return (
    <li className="rounded bg-neutral-900 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs">
          <strong>{PLAT[c.platform] ?? c.platform}</strong> · {c.name} ·{' '}
          <span className="text-emerald-400">{c.overlapPct}% de correspondencia</span> ·{' '}
          <span className="text-neutral-400">+{c.addedCount} faixas</span>
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => setShowTracks((v) => !v)} className="rounded px-2 py-0.5 text-xs text-neutral-400 hover:text-neutral-100">
            {showTracks ? 'ocultar' : 'ver musicas'}
          </button>
          <button onClick={onImport} className="rounded bg-emerald-700 px-3 py-1 text-xs hover:bg-emerald-600">
            Importar
          </button>
        </div>
      </div>
      {showTracks && (
        <ul className="mt-2 max-h-40 overflow-y-auto space-y-1 border-t border-neutral-800 pt-2">
          {c.extras.map((t) => (
            <li key={`${t.sourceId}:${t.id}`} className="truncate text-xs text-neutral-400">
              {t.artists.join(', ')}
              {t.artists.length ? ' — ' : ''}
              {t.title}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
