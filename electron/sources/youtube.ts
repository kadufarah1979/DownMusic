import type { Source, ProgressFn } from './types'
import type { TrackMeta, FetchOptions, AudioResult } from '../../shared/types'
import type { YtDlpEngine } from '../engines/ytdlp'
import { join } from 'node:path'

/** Fonte YouTube / YouTube Music: resolve e baixa direto via yt-dlp. */
export class YouTubeSource implements Source {
  readonly id = 'youtube' as const
  constructor(private readonly ytdlp: YtDlpEngine) {}

  matches(url: string): boolean {
    return /(?:youtube\.com|youtu\.be|music\.youtube\.com)/i.test(url)
  }

  async search(query: string): Promise<TrackMeta[]> {
    // TODO: usar ytsearch para retornar candidatos.
    void query
    return []
  }

  async resolve(url: string): Promise<TrackMeta[]> {
    // TODO: usar `yt-dlp --dump-json` para extrair metadados (e expandir playlist).
    return [
      {
        id: url,
        title: 'TODO',
        artists: [],
        sourceId: this.id,
        sourceUrl: url
      }
    ]
  }

  async fetchAudio(track: TrackMeta, opts: FetchOptions, onProgress: ProgressFn): Promise<AudioResult> {
    const outTemplate = join(opts.outputDir, `${track.id}.%(ext)s`)
    const path = await this.ytdlp.downloadAudio(track.sourceUrl, outTemplate, onProgress)
    return { rawPath: path }
  }
}
