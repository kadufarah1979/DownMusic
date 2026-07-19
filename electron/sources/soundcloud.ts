import type { Source, ProgressFn } from './types'
import type { TrackMeta, FetchOptions, AudioResult } from '../../shared/types'
import type { YtDlpEngine } from '../engines/ytdlp'
import { ytdlpInfoToTrack } from './ytdlpMap'
import { join } from 'node:path'

/** Fonte SoundCloud: resolve e baixa via yt-dlp (suporte nativo do yt-dlp). */
export class SoundCloudSource implements Source {
  readonly id = 'soundcloud' as const
  constructor(private readonly ytdlp: YtDlpEngine) {}

  matches(url: string): boolean {
    return /soundcloud\.com/i.test(url)
  }

  async search(query: string): Promise<TrackMeta[]> {
    const infos = await this.ytdlp.searchList(query, 'scsearch', 8)
    return infos.map((info) => {
      const t = ytdlpInfoToTrack(info, this.id)
      // prefere a URL publica do SoundCloud (webpage_url), com fallback p/ url
      const url = (info.webpage_url as string) ?? (info.url as string) ?? t.sourceUrl
      return { ...t, sourceUrl: url }
    })
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
