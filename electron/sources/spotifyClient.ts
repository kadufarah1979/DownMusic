import type { TrackMeta } from '../../shared/types'

/** Cliente HTTP injetavel — permite testar sem rede. */
export interface HttpClient {
  getJson(url: string, headers: Record<string, string>): Promise<any>
  postForm(url: string, form: Record<string, string>, headers: Record<string, string>): Promise<any>
}

/** Le o corpo da resposta e monta uma mensagem de erro util (com o motivo do Spotify). */
async function httpError(method: string, url: string, res: Response): Promise<Error> {
  let detail = ''
  try {
    const body = await res.text()
    // Spotify devolve JSON: {"error":"invalid_client"} ou {"error":{"message":"..."}}
    try {
      const j = JSON.parse(body)
      detail = typeof j.error === 'string' ? j.error : j.error?.message ?? body
    } catch {
      detail = body
    }
  } catch {
    /* sem corpo */
  }
  return new Error(`${method} ${url} -> HTTP ${res.status}${detail ? ` (${detail})` : ''}`)
}

/** Implementacao padrao sobre o fetch global (Node 18+). */
export class FetchHttpClient implements HttpClient {
  async getJson(url: string, headers: Record<string, string>) {
    const res = await fetch(url, { headers })
    if (!res.ok) throw await httpError('GET', url, res)
    return res.json()
  }

  async postForm(url: string, form: Record<string, string>, headers: Record<string, string>) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
      body: new URLSearchParams(form).toString()
    })
    if (!res.ok) throw await httpError('POST', url, res)
    return res.json()
  }
}

export type SpotifyUrlType = 'track' | 'album' | 'playlist'

/** Extrai {type, id} de uma URL/URI do Spotify, ou null. */
export function parseSpotifyUrl(url: string): { type: SpotifyUrlType; id: string } | null {
  const web = /open\.spotify\.com\/(track|album|playlist)\/([A-Za-z0-9]+)/.exec(url)
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
    const headers = await this.authHeaders()

    if (parsed.type === 'track') {
      const t = await this.http.getJson(`${API}/v1/tracks/${parsed.id}`, headers)
      return [spotifyTrackToMeta(t)]
    }

    if (parsed.type === 'album') {
      const album = await this.http.getJson(`${API}/v1/albums/${parsed.id}`, headers)
      // faixas de album vem sem o objeto album; enxertamos nome/capa do album.
      return (album.tracks?.items ?? []).map((t: SpotifyTrack) =>
        spotifyTrackToMeta({ ...t, album: { name: album.name, images: album.images } })
      )
    }

    // playlist: items[].track sao track objects completos
    const playlist = await this.http.getJson(`${API}/v1/playlists/${parsed.id}`, headers)
    return (playlist.tracks?.items ?? [])
      .map((it: { track: SpotifyTrack | null }) => it.track)
      .filter((t: SpotifyTrack | null): t is SpotifyTrack => !!t)
      .map(spotifyTrackToMeta)
  }
}
