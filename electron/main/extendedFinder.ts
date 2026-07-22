import type { Resolver } from './resolver'
import type { TrackMeta, SourceId } from '../../shared/types'
import { pickBestPerSource } from '../../shared/extended'

/** Motores de busca consultados para achar a versão extended (os mesmos da aba Busca). */
export const EXTENDED_SOURCES: SourceId[] = ['spotify', 'deezer', 'youtube', 'soundcloud']

/**
 * Busca a melhor versão extended de `track` em cada motor configurado.
 * Reusa `resolver.searchMany` (paralelo, erro isolado por fonte) e aplica a
 * heurística pura. Fontes sem candidata qualificada (ou indisponíveis) são omitidas.
 */
export async function findExtended(
  resolver: Resolver,
  track: TrackMeta
): Promise<Partial<Record<SourceId, TrackMeta>>> {
  const query = `${track.artists.join(' ')} ${track.title} extended mix`.trim()
  const groups = await resolver.searchMany(query, EXTENDED_SOURCES)
  return pickBestPerSource(
    { originalTitle: track.title, originalDurationSec: track.durationSec },
    groups
  )
}
