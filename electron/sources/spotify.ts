import type { Source, ProgressFn } from './types'
import type { TrackMeta, FetchOptions, AudioResult } from '../../shared/types'
import type { YtDlpEngine } from '../engines/ytdlp'
import type { SpotifyClient } from './spotifyClient'
import { join } from 'node:path'

/**
 * Fonte Spotify (modelo spotDL):
 * - search/resolve usam a Web API OFICIAL do Spotify apenas para METADADOS
 *   (delegado ao SpotifyClient).
 * - fetchAudio NAO baixa do Spotify: procura a mesma faixa no YouTube (por ISRC
 *   ou "artista - titulo") e baixa o audio publico via yt-dlp.
 * Este e o caminho defensavel; nao ha captura de stream com DRM.
 */
export class SpotifySource implements Source {
  readonly id = 'spotify' as const

  constructor(
    private readonly ytdlp: YtDlpEngine,
    private readonly client: SpotifyClient
  ) {}

  matches(url: string): boolean {
    return /open\.spotify\.com\/(track|album|playlist)/i.test(url) || /^spotify:(track|album|playlist):/i.test(url)
  }

  async search(query: string): Promise<TrackMeta[]> {
    return this.client.searchTracks(query)
  }

  async resolve(url: string): Promise<TrackMeta[]> {
    return this.client.resolveUrl(url)
  }

  async fetchAudio(track: TrackMeta, opts: FetchOptions, onProgress: ProgressFn): Promise<AudioResult> {
    // Casa metadados do Spotify com o YouTube e baixa de la.
    const query = track.isrc ?? `${track.artists.join(' ')} ${track.title}`
    const ytUrl = await this.ytdlp.searchBest(query)
    if (!ytUrl) throw new Error(`Nenhum resultado no YouTube para: ${query}`)
    const outTemplate = join(opts.outputDir, `${track.id}.%(ext)s`)
    const path = await this.ytdlp.downloadAudio(ytUrl, outTemplate, onProgress)
    return { rawPath: path }
  }
}
