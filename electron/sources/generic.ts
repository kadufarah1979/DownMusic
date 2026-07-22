import type { Source, ProgressFn } from './types'
import type { TrackMeta, FetchOptions, AudioResult } from '../../shared/types'
import type { YtDlpEngine } from '../engines/ytdlp'
import { ytdlpInfoToTrack } from './ytdlpMap'
import { join } from 'node:path'

/**
 * Sites populares que o yt-dlp suporta e que queremos reconhecer explicitamente.
 * Nao e exaustivo: o yt-dlp cobre 1800+ sites e o `matches` abaixo aceita qualquer
 * URL http(s), entao esta lista serve so de documentacao/legibilidade.
 */
export const GENERIC_SITES = [
  'tiktok.com', 'vimeo.com', 'dailymotion.com', 'facebook.com', 'twitch.tv',
  'vk.com', 'reddit.com', 'vevo.com', 'instagram.com', 'twitter.com', 'x.com'
]

/**
 * Fonte generica: delega ao yt-dlp qualquer URL http(s) nao reconhecida por uma
 * fonte especifica. Como o yt-dlp suporta 1800+ sites, isto habilita TikTok, Vimeo,
 * Dailymotion, Facebook, Twitch etc. sem precisar de uma classe por site.
 *
 * DEVE ficar por ULTIMO na lista de fontes: o Resolver usa o primeiro `matches`.
 */
export class GenericYtDlpSource implements Source {
  readonly id = 'generic' as const
  constructor(private readonly ytdlp: YtDlpEngine) {}

  /** Aceita qualquer URL http(s) — cobertura maxima do yt-dlp. */
  matches(url: string): boolean {
    return /^https?:\/\/\S+$/i.test(url)
  }

  /** Sem busca por texto: esta fonte serve so para resolucao de URL colada. */
  async search(): Promise<TrackMeta[]> {
    return []
  }

  async resolve(url: string): Promise<TrackMeta[]> {
    const infos = await this.ytdlp.dumpJson(url)
    return infos.map((info) => ytdlpInfoToTrack(info, this.id))
  }

  async fetchAudio(track: TrackMeta, opts: FetchOptions, onProgress: ProgressFn): Promise<AudioResult> {
    const outTemplate = join(opts.outputDir, `${track.id}.%(ext)s`)
    const path = await this.ytdlp.downloadAudio(track.sourceUrl, outTemplate, onProgress)
    return { rawPath: path }
  }
}
