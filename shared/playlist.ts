import type { TrackMeta } from './types'
import { isDownloaded, type DownloadedIndex } from './history'

/** Filtra as faixas de uma playlist que ainda NAO estao no historico (as "novas"). */
export function pickNewTracks(tracks: TrackMeta[], index: DownloadedIndex): TrackMeta[] {
  return tracks.filter((t) => !isDownloaded(t, index))
}
