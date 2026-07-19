import type { Source } from '../sources/types'
import type { TrackMeta, SearchGroup, SourceId } from '../../shared/types'

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

  /**
   * Busca por texto em varias fontes em paralelo, agrupando por plataforma.
   * Erro de uma fonte e isolado (allSettled): as demais continuam. Ordem = ordem pedida.
   */
  async searchMany(query: string, sourceIds: SourceId[]): Promise<SearchGroup[]> {
    const settled = await Promise.allSettled(
      sourceIds.map((id) => {
        const source = this.sources.find((s) => s.id === id)
        return source ? source.search(query) : Promise.reject(new Error(`Fonte desconhecida: ${id}`))
      })
    )
    return sourceIds.map((sourceId, i) => {
      const r = settled[i]
      if (r.status === 'fulfilled') return { sourceId, tracks: r.value }
      const error = r.reason instanceof Error ? r.reason.message : String(r.reason)
      return { sourceId, tracks: [], error }
    })
  }

  getSource(id: string): Source | undefined {
    return this.sources.find((s) => s.id === id)
  }
}
