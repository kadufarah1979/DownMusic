import type { Source, ProgressFn } from './types'
import type { TrackMeta, FetchOptions, AudioResult } from '../../shared/types'
import type { YtDlpEngine } from '../engines/ytdlp'
import { join } from 'node:path'

/** Fonte SoundCloud: resolve e baixa via yt-dlp (suporte nativo do yt-dlp). */
export class SoundCloudSource implements Source {
  readonly id = 'soundcloud' as const
  constructor(private readonly ytdlp: YtDlpEngine) {}

  matches(url: string): boolean {
    return /soundcloud\.com/i.test(url)
  }

  async search(query: string): Promise<TrackMeta[]> {
    // TODO: `scsearch` via yt-dlp.
    void query
    return []
  }

  async resolve(url: string): Promise<TrackMeta[]> {
    // TODO: `yt-dlp --dump-json` (expandir sets/playlists).
    return [{ id: url, title: 'TODO', artists: [], sourceId: this.id, sourceUrl: url }]
  }

  async fetchAudio(track: TrackMeta, opts: FetchOptions, onProgress: ProgressFn): Promise<AudioResult> {
    const outTemplate = join(opts.outputDir, `${track.id}.%(ext)s`)
    const path = await this.ytdlp.downloadAudio(track.sourceUrl, outTemplate, onProgress)
    return { rawPath: path }
  }
}
