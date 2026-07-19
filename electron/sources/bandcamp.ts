import type { Source, ProgressFn } from './types'
import type { TrackMeta, FetchOptions, AudioResult } from '../../shared/types'
import type { YtDlpEngine } from '../engines/ytdlp'
import { join } from 'node:path'

/** Fonte Bandcamp: resolve e baixa via yt-dlp (suporte nativo do yt-dlp). */
export class BandcampSource implements Source {
  readonly id = 'bandcamp' as const
  constructor(private readonly ytdlp: YtDlpEngine) {}

  matches(url: string): boolean {
    return /bandcamp\.com/i.test(url)
  }

  async search(query: string): Promise<TrackMeta[]> {
    // Bandcamp nao tem busca via yt-dlp; fluxo e por URL.
    void query
    return []
  }

  async resolve(url: string): Promise<TrackMeta[]> {
    // TODO: `yt-dlp --dump-json` para metadados.
    return [{ id: url, title: 'TODO', artists: [], sourceId: this.id, sourceUrl: url }]
  }

  async fetchAudio(track: TrackMeta, opts: FetchOptions, onProgress: ProgressFn): Promise<AudioResult> {
    const raw = join(opts.outputDir, `${track.id}.raw`)
    const path = await this.ytdlp.downloadAudio(track.sourceUrl, raw, onProgress)
    return { rawPath: path }
  }
}
