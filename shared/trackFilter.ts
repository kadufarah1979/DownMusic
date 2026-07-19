import type { TrackMeta } from './types'

/** Normaliza para comparacao: minusculas e sem acentos (NFD + remove marcas combinantes). */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // remove diacriticos (marcas combinantes)
    .toLowerCase()
}

/**
 * Verifica se a faixa corresponde ao filtro de texto (titulo + artistas),
 * case-insensitive e sem acento. Query vazia sempre casa.
 */
export function trackMatchesQuery(track: TrackMeta, query: string): boolean {
  const q = normalize(query.trim())
  if (!q) return true
  const haystack = normalize(`${track.title} ${track.artists.join(' ')}`)
  return haystack.includes(q)
}
