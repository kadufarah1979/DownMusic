/** Cliente HTTP injetavel — permite testar sem rede. Compartilhado por Spotify e Deezer. */
export interface HttpClient {
  getJson(url: string, headers?: Record<string, string>): Promise<any>
  postForm(url: string, form: Record<string, string>, headers: Record<string, string>): Promise<any>
  /** GET que retorna texto cru (ex: pagina embed do Spotify). */
  getText?(url: string, headers?: Record<string, string>): Promise<string>
}

/** Le o corpo da resposta e monta uma mensagem de erro util (com o motivo da API). */
export async function httpError(method: string, url: string, res: Response): Promise<Error> {
  let detail = ''
  try {
    const body = await res.text()
    // APIs devolvem JSON: {"error":"invalid_client"} ou {"error":{"message":"..."}}
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
  async getJson(url: string, headers: Record<string, string> = {}) {
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

  async getText(url: string, headers: Record<string, string> = {}) {
    // User-Agent de navegador evita bloqueio de bot em paginas publicas
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', ...headers } })
    if (!res.ok) throw await httpError('GET', url, res)
    return res.text()
  }
}
