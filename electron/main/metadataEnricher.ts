import { FetchHttpClient, type HttpClient } from '../net/http'
import type { TrackMeta } from '../../shared/types'

const API = 'https://api.deezer.com'

interface DeezerTrackRaw {
  id?: number
  error?: unknown
  album?: { id?: number }
  track_position?: number
  disk_number?: number
  release_date?: string
}
interface DeezerAlbumRaw {
  genres?: { data?: { name?: string }[] }
  label?: string
  release_date?: string
  cover_xl?: string
  cover_big?: string
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
const yearOf = (date?: string) => (date && /^\d{4}/.test(date) ? date.slice(0, 4) : undefined)

/** Extrai as tags (Rekordbox) de um par faixa+album do Deezer. Omite campos ausentes. */
export function tagsFromDeezer(track: DeezerTrackRaw, album: DeezerAlbumRaw): Partial<TrackMeta> {
  const out: Partial<TrackMeta> = {
    genre: str(album?.genres?.data?.[0]?.name),
    year: yearOf(album?.release_date ?? track?.release_date),
    label: str(album?.label),
    trackNumber: typeof track?.track_position === 'number' ? track.track_position : undefined,
    discNumber: typeof track?.disk_number === 'number' ? track.disk_number : undefined,
    coverUrl: str(album?.cover_xl) ?? str(album?.cover_big)
  }
  // remove chaves undefined para nao sobrescrever metadados existentes
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as Partial<TrackMeta>
}

/**
 * Enriquece uma faixa com metadados do Deezer (genero, ano, label, nº faixa/disco,
 * capa em alta) para tags ID3 / organizacao. Cache por album. Falha -> {}.
 */
export class MetadataEnricher {
  private albumCache = new Map<number, DeezerAlbumRaw>()

  constructor(private readonly http: HttpClient = new FetchHttpClient()) {}

  enrich = async (track: TrackMeta): Promise<Partial<TrackMeta>> => {
    try {
      const dz = await this.findTrack(track)
      if (!dz) return {}
      const albumId = dz.album?.id
      const album = albumId ? await this.getAlbum(albumId) : {}
      return tagsFromDeezer(dz, album)
    } catch {
      return {}
    }
  }

  private async findTrack(track: TrackMeta): Promise<DeezerTrackRaw | null> {
    if (track.isrc) {
      const t = (await this.http.getJson(`${API}/track/isrc:${encodeURIComponent(track.isrc)}`)) as DeezerTrackRaw
      if (t && !t.error && t.id) return t
    }
    const q = `${track.artists.join(' ')} ${track.title}`.trim()
    const res = await this.http.getJson(`${API}/search?q=${encodeURIComponent(q)}&limit=1`)
    return (res?.data?.[0] as DeezerTrackRaw) ?? null
  }

  private async getAlbum(id: number): Promise<DeezerAlbumRaw> {
    const cached = this.albumCache.get(id)
    if (cached) return cached
    const a = (await this.http.getJson(`${API}/album/${id}`)) as DeezerAlbumRaw
    this.albumCache.set(id, a)
    return a
  }
}
