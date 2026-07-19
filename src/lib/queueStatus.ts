import { useEffect, useState } from 'react'
import { api } from '../ipc'
import { nameKey } from '@shared/history'
import type { QueueItemState, TrackMeta } from '@shared/types'

/**
 * Mantem um mapa "nameKey da faixa -> estado na fila" a partir da fila atual e
 * dos eventos em tempo real. Usado para mostrar status por faixa nas playlists.
 * Retorna uma funcao (track) => estado da fila (ou undefined).
 */
export function useQueueStatus(): (t: TrackMeta) => QueueItemState | undefined {
  const [map, setMap] = useState<Record<string, QueueItemState>>({})

  useEffect(() => {
    let alive = true
    api.queueList().then((list) => {
      if (!alive) return
      setMap(Object.fromEntries(list.map((i) => [nameKey(i.meta), i.state])))
    })
    const off = api.onQueueUpdate((item) => {
      setMap((prev) => ({ ...prev, [nameKey(item.meta)]: item.state }))
    })
    return () => {
      alive = false
      off()
    }
  }, [])

  return (t: TrackMeta) => map[nameKey(t)]
}
