import { api } from '../ipc'
import { trackStatus, type TrackStatus } from '@shared/trackStatus'
import type { QueueItemState, TrackMeta } from '@shared/types'

const BADGE: Record<TrackStatus, { label: string; cls: string }> = {
  error: { label: 'erro', cls: 'bg-red-900/60 text-red-300' },
  running: { label: 'baixando', cls: 'bg-blue-900/60 text-blue-300' },
  queued: { label: 'na fila', cls: 'bg-neutral-700 text-neutral-300' },
  downloaded: { label: '✓ baixado', cls: 'bg-emerald-900/60 text-emerald-300' },
  new: { label: 'não baixado', cls: 'bg-neutral-700 text-neutral-400' }
}

const ACTION: Partial<Record<TrackStatus, string>> = {
  error: '↻ Tentar novamente',
  downloaded: 'Baixar de novo',
  new: 'Baixar'
}

/** Lista as faixas de uma playlist com status (historico + fila) e a acao certa. */
export function PlaylistTracks({
  tracks,
  isDownloaded,
  queueStateOf
}: {
  tracks: TrackMeta[]
  isDownloaded: (t: TrackMeta) => boolean
  queueStateOf: (t: TrackMeta) => QueueItemState | undefined
}) {
  return (
    <ul className="space-y-1.5">
      {tracks.map((t) => {
        const status = trackStatus({ downloaded: isDownloaded(t), queueState: queueStateOf(t) })
        const badge = BADGE[status]
        const action = ACTION[status]
        return (
          <li key={`${t.sourceId}:${t.id}`} className="flex items-center gap-3 rounded bg-neutral-900 px-3 py-2">
            <span className="flex-1 truncate text-sm">
              {t.artists.join(', ')}
              {t.artists.length ? ' — ' : ''}
              {t.title}
            </span>
            <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${badge.cls}`}>{badge.label}</span>
            {action && (
              <button
                onClick={() => api.enqueue([t])}
                className="whitespace-nowrap rounded bg-neutral-700 px-2 py-0.5 text-xs hover:bg-neutral-600"
              >
                {action}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
