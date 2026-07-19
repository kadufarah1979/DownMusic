import type { TrackMeta } from '../../shared/types'
import { FetchHttpClient, type HttpClient } from '../net/http'

const API = 'https://api.deezer.com'

export type DeezerUrlType = 'track' | 'album' | 'playlist'

/** Extrai {type, id} de uma URL do Deezer (aceita segmento de locale), ou null. */
export function parseDeezerUrl(url: string): { type: DeezerUrlType; id: string } | null {
  const m = /deezer\.com\/(?:[a-z]{2}\/)?(track|album|playlist)\/(\d+)/.exec(url)
  return m ? { type: m[1] as DeezerUrlType, id: m[2] } : null
}

/** Objeto de faixa da API do Deezer (subconjunto usado). */
interface DeezerTrack {
  id: number | string
  title: string
  link?: string
  duration?: number // JA em segundos
  isrc?: string
  artist?: { name?: string }
  album?: { title?: string; cover_big?: string; cover_medium?: string; cover?: string }
}

/** Mapeia uma faixa do Deezer para TrackMeta. Duracao ja vem em segundos. */
export function deezerTrackToMeta(t: DeezerTrack): TrackMeta {
  const id = String(t.id)
  return {
    id,
    title: t.title,
    artists: t.artist?.name ? [t.artist.name] : [],
    album: t.album?.title,
    coverUrl: t.album?.cover_big ?? t.album?.cover_medium ?? t.album?.cover,
    isrc: t.isrc,
    durationSec: typeof t.duration === 'number' ? t.duration : undefined,
    sourceId: 'deezer',
    sourceUrl: t.link ?? `https://www.deezer.com/track/${id}`
  }
}

/**
 * Cliente da API PUBLICA do Deezer (sem autenticacao).
 * Usado como fonte de METADADOS; o audio vem do yt-dlp (fonte DeezerSource).
 */
export class DeezerClient {
  constructor(private readonly http: HttpClient = new FetchHttpClient()) {}

  /** Busca faixas por texto. */
  async search(query: string, limit = 8): Promise<TrackMeta[]> {
    const res = await this.http.getJson(`${API}/search?q=${encodeURIComponent(query)}&limit=${limit}`)
    return (res.data ?? []).map(deezerTrackToMeta)
  }

  /** Resolve uma URL (track/album/playlist) em 1..N faixas. */
  async resolveUrl(url: string): Promise<TrackMeta[]> {
    const parsed = parseDeezerUrl(url)
    if (!parsed) throw new Error(`URL do Deezer invalida: ${url}`)

    if (parsed.type === 'track') {
      const t = await this.http.getJson(`${API}/track/${parsed.id}`)
      return [deezerTrackToMeta(t)]
    }

    const entity = await this.http.getJson(`${API}/${parsed.type}/${parsed.id}`)
    const first = entity.tracks ?? {}
    const rest = first.next ? await this.getAllData(first.next) : []
    const items: DeezerTrack[] = [...(first.data ?? []), ...rest]

    if (parsed.type === 'album') {
      // faixas de album vem sem o objeto album; enxertamos titulo/capa do album.
      return items.map((t) =>
        deezerTrackToMeta({ ...t, album: { title: entity.title, cover_big: entity.cover_big } })
      )
    }
    // playlist: cada item ja traz seu proprio album
    return items.map(deezerTrackToMeta)
  }

  /** Segue a paginacao do Deezer (campo `next`) acumulando todos os `data`. */
  private async getAllData(firstUrl: string): Promise<DeezerTrack[]> {
    const items: DeezerTrack[] = []
    let url: string | null = firstUrl
    while (url) {
      const page: { data?: DeezerTrack[]; next?: string | null } = await this.http.getJson(url)
      items.push(...(page.data ?? []))
      url = page.next ?? null
    }
    return items
  }
}
