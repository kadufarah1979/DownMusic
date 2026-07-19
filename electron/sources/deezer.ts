import type { Source, ProgressFn } from './types'
import type { TrackMeta, FetchOptions, AudioResult } from '../../shared/types'
import type { YtDlpEngine } from '../engines/ytdlp'
import { parseDeezerUrl, type DeezerClient } from './deezerClient'
import { join } from 'node:path'

/**
 * Fonte Deezer (metadados -> audio do YouTube):
 * - search/resolve usam a API PUBLICA do Deezer (sem login), via DeezerClient.
 * - fetchAudio casa a faixa no YouTube (por ISRC ou "artista titulo") e baixa
 *   o audio publico via yt-dlp — mesma estrategia do Spotify.
 * O download nativo (ARL + decrypt FLAC) permanece como possivel fase 2.
 */
export class DeezerSource implements Source {
  readonly id = 'deezer' as const

  constructor(
    private readonly ytdlp: YtDlpEngine,
    private readonly client: DeezerClient
  ) {}

  matches(url: string): boolean {
    return parseDeezerUrl(url) !== null
  }

  async search(query: string): Promise<TrackMeta[]> {
    return this.client.search(query)
  }

  async resolve(url: string): Promise<TrackMeta[]> {
    return this.client.resolveUrl(url)
  }

  async fetchAudio(track: TrackMeta, opts: FetchOptions, onProgress: ProgressFn): Promise<AudioResult> {
    const query = track.isrc ?? `${track.artists.join(' ')} ${track.title}`
    const ytUrl = await this.ytdlp.searchBest(query)
    if (!ytUrl) throw new Error(`Nenhum resultado no YouTube para: ${query}`)
    const outTemplate = join(opts.outputDir, `${track.id}.%(ext)s`)
    const path = await this.ytdlp.downloadAudio(ytUrl, outTemplate, onProgress)
    return { rawPath: path }
  }
}
