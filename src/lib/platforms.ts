import type { SourceId } from '@shared/types'

/** Plataformas pesquisáveis por texto (Bandcamp fica de fora — yt-dlp não busca nele). */
export const SEARCH_PLATFORMS: { id: SourceId; label: string }[] = [
  { id: 'spotify', label: 'Spotify' },
  { id: 'deezer', label: 'Deezer' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'soundcloud', label: 'SoundCloud' }
]

export function platformLabel(id: SourceId): string {
  return SEARCH_PLATFORMS.find((p) => p.id === id)?.label ?? id
}
