import { useEffect, useState } from 'react'
import { api } from '../ipc'
import { buildDownloadedIndex, isDownloaded } from '@shared/history'
import type { TrackMeta } from '@shared/types'

/** Carrega o historico e devolve um verificador "ja baixado?" para as listagens. */
export async function loadDownloadedChecker(): Promise<(t: TrackMeta) => boolean> {
  const entries = await api.getHistory()
  const index = buildDownloadedIndex(entries)
  return (t) => isDownloaded(t, index)
}

/**
 * Verificador "ja baixado?" que se atualiza em TEMPO REAL: recarrega o historico
 * a cada download concluido (evento `done` da fila), sem refazer a busca.
 */
export function useDownloadedChecker(): (t: TrackMeta) => boolean {
  const [checker, setChecker] = useState<(t: TrackMeta) => boolean>(() => () => false)

  useEffect(() => {
    let alive = true
    const reload = () => loadDownloadedChecker().then((fn) => alive && setChecker(() => fn))
    reload()
    const off = api.onQueueUpdate((item) => {
      if (item.state === 'done') reload()
    })
    return () => {
      alive = false
      off()
    }
  }, [])

  return checker
}
