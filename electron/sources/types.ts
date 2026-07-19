import type { TrackMeta, FetchOptions, AudioResult, SourceId } from '../../shared/types'

/** Callback de progresso reportado durante fetchAudio (0..100). */
export type ProgressFn = (percent: number) => void

/**
 * Interface unica que toda fonte de musica implementa.
 * E isto que torna cada fonte (inclusive Spotify) apenas mais um plugin,
 * permitindo adicionar/remover fontes sem tocar no resto do sistema.
 */
export interface Source {
  readonly id: SourceId

  /** Reconhece se esta fonte lida com a URL dada. */
  matches(url: string): boolean

  /** Busca por texto -> lista de faixas candidatas. */
  search(query: string): Promise<TrackMeta[]>

  /** Resolve um link em 1..N faixas (playlist/album expandem em varias). */
  resolve(url: string): Promise<TrackMeta[]>

  /** Baixa o audio bruto da faixa. Conversao/tagging final ficam no Tagger. */
  fetchAudio(track: TrackMeta, opts: FetchOptions, onProgress: ProgressFn): Promise<AudioResult>
}
