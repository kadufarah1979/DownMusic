import type { TrackMeta } from '../../shared/types'
import { FetchHttpClient, type HttpClient } from '../net/http'

export type { HttpClient }

export type SpotifyUrlType = 'track' | 'album' | 'playlist'

/** Extrai {type, id} de uma URL/URI do Spotify, ou null. */
export function parseSpotifyUrl(url: string): { type: SpotifyUrlType; id: string } | null {
  // aceita o segmento de localidade opcional, ex: /intl-pt/track/...
  const web = /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album|playlist)\/([A-Za-z0-9]+)/.exec(url)
  if (web) return { type: web[1] as SpotifyUrlType, id: web[2] }
  const uri = /^spotify:(track|album|playlist):([A-Za-z0-9]+)$/.exec(url)
  if (uri) return { type: uri[1] as SpotifyUrlType, id: uri[2] }
  return null
}

/** Objeto de faixa da API do Spotify (subconjunto usado). */
interface SpotifyTrack {
  id: string
  name: string
  artists?: { name: string }[]
  album?: { name?: string; images?: { url: string }[] }
  external_ids?: { isrc?: string }
  duration_ms?: number
  external_urls?: { spotify?: string }
}

/** Mapeia um track object do Spotify para TrackMeta. */
export function spotifyTrackToMeta(track: SpotifyTrack): TrackMeta {
  return {
    id: track.id,
    title: track.name,
    artists: (track.artists ?? []).map((a) => a.name),
    album: track.album?.name,
    coverUrl: track.album?.images?.[0]?.url,
    isrc: track.external_ids?.isrc,
    durationSec: typeof track.duration_ms === 'number' ? Math.round(track.duration_ms / 1000) : undefined,
    sourceId: 'spotify',
    sourceUrl: track.external_urls?.spotify ?? ''
  }
}

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const API = 'https://api.spotify.com'

/**
 * Extrai a lista de faixas da pagina EMBED do Spotify (__NEXT_DATA__).
 * Funciona sem credenciais e para playlists editoriais (que a Web API bloqueia).
 * Fornece titulo + artistas (subtitle) + duracao — suficiente para casar no YouTube.
 */
export function parseEmbedTracklist(html: string): TrackMeta[] {
  const m = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html)
  if (!m) throw new Error('Nao foi possivel ler a playlist (embed sem __NEXT_DATA__).')
  const data = JSON.parse(m[1])
  const list = data?.props?.pageProps?.state?.data?.entity?.trackList
  if (!Array.isArray(list)) throw new Error('Playlist vazia ou formato de embed inesperado.')
  return list.map((t: { uri?: string; title?: string; subtitle?: string; duration?: number }) => {
    const id = String(t.uri ?? '').split(':').pop() || String(t.uri ?? '')
    return {
      id,
      title: String(t.title ?? 'Desconhecido'),
      artists: String(t.subtitle ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      durationSec: typeof t.duration === 'number' ? Math.round(t.duration / 1000) : undefined,
      sourceId: 'spotify' as const,
      sourceUrl: `https://open.spotify.com/track/${id}`
    }
  })
}

/**
 * Cliente da Web API do Spotify (client-credentials).
 * Usa a API OFICIAL apenas para metadados; o audio vem do yt-dlp (fonte).
 */
export interface SpotifyCreds {
  clientId?: string
  clientSecret?: string
}

export class SpotifyClient {
  private token?: { value: string; expiresAt: number }

  /**
   * `creds` pode ser um objeto fixo OU um provider (funcao) — este ultimo
   * permite ler as credenciais atuais da config a cada chamada, refletindo
   * o que o usuario salvou em Configuracoes sem recriar o client.
   */
  constructor(
    private readonly creds: SpotifyCreds | (() => SpotifyCreds),
    private readonly http: HttpClient = new FetchHttpClient(),
    private readonly now: () => number = () => Date.now()
  ) {}

  private resolveCreds(): SpotifyCreds {
    return typeof this.creds === 'function' ? this.creds() : this.creds
  }

  /** Retorna um access token valido, buscando/renovando quando necessario. */
  async getToken(): Promise<string> {
    if (this.token && this.now() < this.token.expiresAt) return this.token.value
    const creds = this.resolveCreds()
    if (!creds.clientId || !creds.clientSecret) {
      throw new Error('Credenciais do Spotify ausentes. Configure Client ID/Secret nas Configuracoes.')
    }
    const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')
    const res = await this.http.postForm(
      TOKEN_URL,
      { grant_type: 'client_credentials' },
      { Authorization: `Basic ${basic}` }
    )
    // margem de 60s antes de expirar
    this.token = { value: res.access_token, expiresAt: this.now() + (res.expires_in ?? 3600) * 1000 - 60_000 }
    return this.token.value
  }

  private async authHeaders(): Promise<Record<string, string>> {
    return { Authorization: `Bearer ${await this.getToken()}` }
  }

  /** Busca faixas por texto. */
  async searchTracks(query: string, limit = 10): Promise<TrackMeta[]> {
    const url = `${API}/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`
    const res = await this.http.getJson(url, await this.authHeaders())
    return (res.tracks?.items ?? []).map(spotifyTrackToMeta)
  }

  /** Resolve uma URL (track/album/playlist) em 1..N faixas. */
  async resolveUrl(url: string): Promise<TrackMeta[]> {
    const parsed = parseSpotifyUrl(url)
    if (!parsed) throw new Error(`URL do Spotify invalida: ${url}`)

    if (parsed.type === 'track') {
      const t = await this.http.getJson(`${API}/v1/tracks/${parsed.id}`, await this.authHeaders())
      return [spotifyTrackToMeta(t)]
    }

    if (parsed.type === 'album') {
      const headers = await this.authHeaders()
      const album = await this.http.getJson(`${API}/v1/albums/${parsed.id}`, headers)
      // primeira pagina ja vem embutida; segue o `next` para pegar o resto.
      const first = album.tracks ?? {}
      const rest = first.next ? await this.getAllPages(first.next, headers) : []
      const items: SpotifyTrack[] = [...(first.items ?? []), ...rest]
      // faixas de album vem sem o objeto album; enxertamos nome/capa do album.
      return items.map((t) => spotifyTrackToMeta({ ...t, album: { name: album.name, images: album.images } }))
    }

    // playlist: tenta a Web API (rica, com ISRC); se falhar (403/404 de playlist
    // editorial, ou sem credenciais), cai para o embed publico.
    try {
      const headers = await this.authHeaders()
      const items = await this.getAllPages(`${API}/v1/playlists/${parsed.id}/tracks?limit=100`, headers)
      const tracks = items
        .map((it: { track?: SpotifyTrack | null }) => it.track)
        .filter((t): t is SpotifyTrack => !!t)
        .map(spotifyTrackToMeta)
      if (tracks.length > 0) return tracks
      // API respondeu vazio (playlist editorial as vezes retorna 200 sem faixas): tenta embed
      return await this.resolvePlaylistViaEmbed(parsed.id)
    } catch {
      return this.resolvePlaylistViaEmbed(parsed.id)
    }
  }

  /** Fallback publico: le a tracklist da pagina embed (sem credenciais). */
  private async resolvePlaylistViaEmbed(id: string): Promise<TrackMeta[]> {
    if (!this.http.getText) throw new Error('HttpClient sem suporte a getText para o fallback embed.')
    const html = await this.http.getText(`https://open.spotify.com/embed/playlist/${id}`)
    return parseEmbedTracklist(html)
  }

  /** Segue a paginacao do Spotify (campo `next`) acumulando todos os `items`. */
  private async getAllPages(firstUrl: string, headers: Record<string, string>): Promise<any[]> {
    const items: any[] = []
    let url: string | null = firstUrl
    while (url) {
      const page: { items?: any[]; next?: string | null } = await this.http.getJson(url, headers)
      items.push(...(page.items ?? []))
      url = page.next ?? null
    }
    return items
  }
}
