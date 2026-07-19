import { api } from '../ipc'
import { buildDownloadedIndex, isDownloaded } from '@shared/history'
import type { TrackMeta } from '@shared/types'

/** Carrega o historico e devolve um verificador "ja baixado?" para as listagens. */
export async function loadDownloadedChecker(): Promise<(t: TrackMeta) => boolean> {
  const entries = await api.getHistory()
  const index = buildDownloadedIndex(entries)
  return (t) => isDownloaded(t, index)
}
