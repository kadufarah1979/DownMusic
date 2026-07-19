import type { Source, ProgressFn } from './types'
import type { TrackMeta, FetchOptions, AudioResult } from '../../shared/types'
import type { YtDlpEngine } from '../engines/ytdlp'
import { ytdlpInfoToTrack } from './ytdlpMap'
import { join } from 'node:path'

/** Fonte YouTube / YouTube Music: resolve e baixa direto via yt-dlp. */
export class YouTubeSource implements Source {
  readonly id = 'youtube' as const
  constructor(private readonly ytdlp: YtDlpEngine) {}

  matches(url: string): boolean {
    return /(?:youtube\.com|youtu\.be|music\.youtube\.com)/i.test(url)
  }

  async search(query: string): Promise<TrackMeta[]> {
    const infos = await this.ytdlp.searchList(query, 'ytsearch', 8)
    return infos.map((info) => {
      const t = ytdlpInfoToTrack(info, this.id)
      // garante uma URL de video baixavel (entradas flat as vezes so tem o id);
      // busca nao carrega playlist (so o resolve de playlist carimba)
      return { ...t, sourceUrl: `https://www.youtube.com/watch?v=${t.id}`, playlist: undefined }
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
