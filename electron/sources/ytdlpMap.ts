import type { TrackMeta, SourceId } from '../../shared/types'

/** Info bruta retornada pelo `yt-dlp --dump-json` (subconjunto que usamos). */
export interface YtDlpInfo {
  id?: unknown
  title?: unknown
  track?: unknown
  artist?: unknown
  artists?: unknown
  uploader?: unknown
  album?: unknown
  thumbnail?: unknown
  duration?: unknown
  webpage_url?: unknown
  original_url?: unknown
}

/** Converte a info do yt-dlp em TrackMeta, com fallbacks por tipo de fonte. */
export function ytdlpInfoToTrack(info: YtDlpInfo, sourceId: SourceId): TrackMeta {
  const title = str(info.track) ?? str(info.title) ?? 'Desconhecido'
  return {
    id: String(info.id ?? title),
    title,
    artists: resolveArtists(info),
    album: str(info.album),
    coverUrl: str(info.thumbnail),
    durationSec: typeof info.duration === 'number' ? info.duration : undefined,
    sourceId,
    sourceUrl: str(info.webpage_url) ?? str(info.original_url) ?? ''
  }
}

/** artists[] > artist (string, separada por virgula) > uploader > []. */
function resolveArtists(info: YtDlpInfo): string[] {
  if (Array.isArray(info.artists)) {
    return info.artists.map((a) => String(a).trim()).filter(Boolean)
  }
  const artist = str(info.artist)
  if (artist) return artist.split(',').map((a) => a.trim()).filter(Boolean)
  const uploader = str(info.uploader)
  return uploader ? [uploader] : []
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}
