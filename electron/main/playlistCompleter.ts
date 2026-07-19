import { overlapFraction, newTracksFrom } from '../../shared/playlistMerge'
import { ytdlpInfoToTrack } from '../sources/ytdlpMap'
import type { PlaylistCompletion, TrackMeta } from '../../shared/types'
import type { Resolver } from './resolver'
import type { DeezerClient } from '../sources/deezerClient'
import type { YtDlpEngine } from '../engines/ytdlp'

const MIN_OVERLAP = 0.6
const MAX_PER_SOURCE = 3

/**
 * Procura, em outras plataformas, a playlist equivalente a uma truncada (Spotify),
 * para completar as faixas que faltam. So aceita candidatas com alta sobreposicao.
 */
export class PlaylistCompleter {
  constructor(
    private readonly resolver: Resolver,
    private readonly deezer: DeezerClient,
    private readonly ytdlp: YtDlpEngine
  ) {}

  async findCompletions(url: string): Promise<PlaylistCompletion[]> {
    const base = await this.resolver.resolve(url)
    if (base.length === 0) return []
    const name = base[0].playlist
    if (!name) return []

    const candidates: { platform: 'deezer' | 'youtube'; url: string; title: string }[] = []
    try {
      for (const c of await this.deezer.searchPlaylists(name, MAX_PER_SOURCE))
        candidates.push({ platform: 'deezer', url: c.url, title: c.title })
    } catch {
      /* ignora falha de busca */
    }
    try {
      for (const c of await this.ytdlp.searchPlaylists(name, MAX_PER_SOURCE))
        candidates.push({ platform: 'youtube', url: c.url, title: c.title })
    } catch {
      /* ignora falha de busca */
    }

    const results: PlaylistCompletion[] = []
    for (const c of candidates) {
      try {
        const tracks = await this.resolveCandidate(c.platform, c.url)
        const overlap = overlapFraction(base, tracks)
        if (overlap < MIN_OVERLAP) continue // trava anti-erro
        const extras = newTracksFrom(base, tracks)
        if (extras.length === 0) continue
        results.push({
          platform: c.platform,
          url: c.url,
          name: c.title || name,
          trackCount: tracks.length,
          overlapPct: Math.round(overlap * 100),
          addedCount: extras.length,
          extras
        })
      } catch {
        /* candidata problematica: ignora */
      }
    }
    return results.sort((a, b) => b.overlapPct - a.overlapPct)
  }

  /** Deezer via API (completo); YouTube em modo flat (rapido). */
  private async resolveCandidate(platform: 'deezer' | 'youtube', url: string): Promise<TrackMeta[]> {
    if (platform === 'deezer') return this.deezer.resolveUrl(url)
    const infos = await this.ytdlp.dumpFlat(url)
    return infos.map((info) => {
      const t = ytdlpInfoToTrack(info, 'youtube')
      return { ...t, sourceUrl: `https://www.youtube.com/watch?v=${t.id}`, playlist: undefined }
    })
  }
}
