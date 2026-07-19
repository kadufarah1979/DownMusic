import type { Source, ProgressFn } from './types'
import type { TrackMeta, FetchOptions, AudioResult } from '../../shared/types'
import type { YtDlpEngine } from '../engines/ytdlp'
import { join } from 'node:path'

/**
 * Fonte Spotify (modelo spotDL):
 * - search/resolve usam a Web API OFICIAL do Spotify apenas para METADADOS.
 * - fetchAudio NAO baixa do Spotify: procura a mesma faixa no YouTube (por ISRC
 *   ou "artista - titulo") e baixa o audio publico via yt-dlp.
 * Este e o caminho defensavel; nao ha captura de stream com DRM.
 */
export class SpotifySource implements Source {
  readonly id = 'spotify' as const

  constructor(
    private readonly ytdlp: YtDlpEngine,
    private readonly creds: { clientId?: string; clientSecret?: string }
  ) {}

  matches(url: string): boolean {
    return /open\.spotify\.com\/(track|album|playlist)/i.test(url)
  }

  private ensureCreds(): void {
    if (!this.creds.clientId || !this.creds.clientSecret) {
      throw new Error('Credenciais do Spotify ausentes. Configure Client ID/Secret nas Configuracoes.')
    }
  }

  async search(query: string): Promise<TrackMeta[]> {
    this.ensureCreds()
    // TODO: autenticar (client credentials) e chamar /v1/search.
    void query
    return []
  }

  async resolve(url: string): Promise<TrackMeta[]> {
    this.ensureCreds()
    // TODO: extrair id/tipo da URL e chamar /v1/tracks|albums|playlists (expandir).
    void url
    return []
  }

  async fetchAudio(track: TrackMeta, opts: FetchOptions, onProgress: ProgressFn): Promise<AudioResult> {
    // Casa metadados do Spotify com o YouTube e baixa de la.
    const query = track.isrc ?? `${track.artists.join(' ')} ${track.title}`
    const ytUrl = await this.ytdlp.searchBest(query)
    if (!ytUrl) throw new Error(`Nenhum resultado no YouTube para: ${query}`)
    const raw = join(opts.outputDir, `${track.id}.raw`)
    const path = await this.ytdlp.downloadAudio(ytUrl, raw, onProgress)
    return { rawPath: path }
  }
}
