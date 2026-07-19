import type { TrackMeta } from './types'
import { nameKey, isDownloaded, type DownloadedIndex } from './history'

/** Indice (isrc + nameKey) a partir de uma lista de faixas, para casar musicas. */
function indexOf(tracks: TrackMeta[]): DownloadedIndex {
  const isrcs = new Set<string>()
  const names = new Set<string>()
  for (const t of tracks) {
    if (t.isrc) isrcs.add(t.isrc)
    names.add(nameKey(t))
  }
  return { isrcs, names }
}

/** Fracao (0..1) das faixas de `base` que existem em `candidate` (por ISRC/nome). */
export function overlapFraction(base: TrackMeta[], candidate: TrackMeta[]): number {
  if (base.length === 0) return 0
  const idx = indexOf(candidate)
  const matched = base.filter((t) => isDownloaded(t, idx)).length
  return matched / base.length
}

/** Faixas de `candidate` que NAO estao em `base` (as que seriam importadas). */
export function newTracksFrom(base: TrackMeta[], candidate: TrackMeta[]): TrackMeta[] {
  const idx = indexOf(base)
  return candidate.filter((t) => !isDownloaded(t, idx))
}

/** `base` + as faixas novas de `candidate` (uniao, sem duplicar). */
export function mergeCompleting(base: TrackMeta[], candidate: TrackMeta[]): TrackMeta[] {
  return [...base, ...newTracksFrom(base, candidate)]
}
