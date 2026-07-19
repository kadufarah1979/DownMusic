import type { TrackMeta } from './types'
import { normalizeText } from './text'

/**
 * Verifica se a faixa corresponde ao filtro de texto (titulo + artistas),
 * case-insensitive e sem acento. Query vazia sempre casa.
 */
export function trackMatchesQuery(track: TrackMeta, query: string): boolean {
  const q = normalizeText(query)
  if (!q) return true
  const haystack = normalizeText(`${track.title} ${track.artists.join(' ')}`)
  return haystack.includes(q)
}
