import { useEffect, useState } from 'react'
import { api } from '../ipc'
import type { PlaylistSubscription, SourceId } from '@shared/types'

const LABEL: Record<SourceId, string> = {
  spotify: 'Spotify',
  deezer: 'Deezer',
  youtube: 'YouTube',
  soundcloud: 'SoundCloud',
  bandcamp: 'Bandcamp'
}

/** Aba Playlists: cadastra playlists e sincroniza (baixa so as faixas novas). */
export function PlaylistsView() {
  const [subs, setSubs] = useState<PlaylistSubscription[]>([])
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = () => api.getPlaylists().then(setSubs)
  useEffect(() => {
    reload()
  }, [])

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
            {subs.map((s) => (
              <li key={s.url} className="flex items-center justify-between gap-3 rounded bg-neutral-800 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm">{s.name}</div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {LABEL[s.sourceId] ?? s.sourceId} · {s.trackCount} faixas
                    {s.lastSyncedAt ? ` · sync ${formatDate(s.lastSyncedAt)}` : ' · nunca sincronizada'}
                  </div>
                </div>
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
              </li>
            ))}
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
