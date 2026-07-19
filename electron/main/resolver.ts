import type { Source } from '../sources/types'
import type { TrackMeta } from '../../shared/types'

/**
 * Roteia URLs para a fonte correta e centraliza a busca por texto.
 * Nao conhece detalhes de nenhuma fonte — so a interface Source.
 */
export class Resolver {
  constructor(private readonly sources: Source[]) {}

  /** Encontra a fonte que reconhece a URL. */
  private sourceFor(url: string): Source | undefined {
    return this.sources.find((s) => s.matches(url))
  }

  /** URL -> 1..N faixas (playlist/album expandem). */
  async resolve(url: string): Promise<TrackMeta[]> {
    const source = this.sourceFor(url)
    if (!source) throw new Error(`Nenhuma fonte reconhece esta URL: ${url}`)
    return source.resolve(url)
  }

  /** Busca por texto em uma fonte especifica (default: spotify). */
  async search(query: string, sourceId = 'spotify'): Promise<TrackMeta[]> {
    const source = this.sources.find((s) => s.id === sourceId)
    if (!source) throw new Error(`Fonte desconhecida: ${sourceId}`)
    return source.search(query)
  }

  getSource(id: string): Source | undefined {
    return this.sources.find((s) => s.id === id)
  }
}
