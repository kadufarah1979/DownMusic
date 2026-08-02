import { describe, it, expect, vi, afterEach } from 'vitest'
import { FetchHttpClient, httpError } from './http'

/**
 * Resposta minima com a fatia de `Response` que o cliente usa. `payload` em vez
 * de `body` porque `Response.body` e um ReadableStream — reusar o nome faria o
 * objeto literal ser conferido contra o tipo errado.
 */
const res = (over: { ok?: boolean; status?: number; payload?: unknown; text?: () => Promise<string> }): Response =>
  ({
    ok: over.ok ?? true,
    status: over.status ?? 200,
    json: async () => over.payload,
    text:
      over.text ??
      (async () => (typeof over.payload === 'string' ? over.payload : JSON.stringify(over.payload)))
  }) as unknown as Response

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('httpError', () => {
  it('inclui metodo, URL e status na mensagem', async () => {
    const e = await httpError('GET', 'https://api/x', res({ ok: false, status: 404, payload: '' }))
    expect(e.message).toContain('GET')
    expect(e.message).toContain('https://api/x')
    expect(e.message).toContain('404')
  })

  it('extrai o motivo de {"error": "texto"}', async () => {
    const e = await httpError('POST', 'https://api/token', res({ ok: false, status: 401, payload: { error: 'invalid_client' } }))
    expect(e.message).toContain('invalid_client')
  })

  it('extrai o motivo de {"error": {"message": "..."}}', async () => {
    const e = await httpError('GET', 'https://api/x', res({ ok: false, status: 400, payload: { error: { message: 'Quota excedida' } } }))
    expect(e.message).toContain('Quota excedida')
  })

  it('corpo que nao e JSON entra cru na mensagem', async () => {
    const e = await httpError('GET', 'https://api/x', res({ ok: false, status: 502, text: async () => '<html>Bad gateway</html>' }))
    expect(e.message).toContain('<html>Bad gateway</html>')
  })

  it('corpo ilegivel nao quebra: sobra a mensagem com o status', async () => {
    const e = await httpError('GET', 'https://api/x', res({
      ok: false, status: 500,
      text: async () => { throw new Error('stream ja consumido') }
    }))
    expect(e.message).toContain('500')
    expect(e).toBeInstanceOf(Error)
  })
})

describe('FetchHttpClient.getJson', () => {
  it('devolve o JSON e repassa os headers', async () => {
    const seen: { url?: string; init?: RequestInit } = {}
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      Object.assign(seen, { url, init })
      return res({ payload: { id: 7 } })
    })

    const out = await new FetchHttpClient().getJson('https://api/x', { Authorization: 'Bearer t' })
    expect(out).toEqual({ id: 7 })
    expect(seen.url).toBe('https://api/x')
    expect((seen.init?.headers as Record<string, string>).Authorization).toBe('Bearer t')
  })

  it('resposta nao-2xx vira erro com o motivo da API', async () => {
    vi.stubGlobal('fetch', async () => res({ ok: false, status: 403, payload: { error: 'forbidden' } }))
    await expect(new FetchHttpClient().getJson('https://api/x')).rejects.toThrow(/403.*forbidden/)
  })
})

describe('FetchHttpClient.postForm', () => {
  it('envia form-urlencoded com o corpo codificado', async () => {
    const seen: { init?: RequestInit } = {}
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      seen.init = init
      return res({ payload: { access_token: 'abc' } })
    })

    const out = await new FetchHttpClient().postForm(
      'https://api/token',
      { grant_type: 'client_credentials', scope: 'a b' },
      { Authorization: 'Basic xyz' }
    )

    expect(out).toEqual({ access_token: 'abc' })
    expect(seen.init?.method).toBe('POST')
    const headers = seen.init?.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(headers.Authorization).toBe('Basic xyz')
    expect(seen.init?.body).toBe('grant_type=client_credentials&scope=a+b') // espaco codificado
  })

  it('nao-2xx vira erro', async () => {
    vi.stubGlobal('fetch', async () => res({ ok: false, status: 401, payload: { error: 'invalid_client' } }))
    await expect(new FetchHttpClient().postForm('https://api/token', {}, {})).rejects.toThrow(/401/)
  })
})

describe('FetchHttpClient.getText', () => {
  it('manda User-Agent de navegador (paginas publicas bloqueiam bot)', async () => {
    const seen: { init?: RequestInit } = {}
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      seen.init = init
      return res({ text: async () => '<html>ok</html>' })
    })

    const out = await new FetchHttpClient().getText('https://open.spotify.com/embed/x')
    expect(out).toBe('<html>ok</html>')
    expect((seen.init?.headers as Record<string, string>)['User-Agent']).toMatch(/Mozilla/)
  })

  it('header informado pelo chamador prevalece sobre o padrao', async () => {
    const seen: { init?: RequestInit } = {}
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      seen.init = init
      return res({ text: async () => '' })
    })

    await new FetchHttpClient().getText('https://x', { 'User-Agent': 'DownMusic/1.0' })
    expect((seen.init?.headers as Record<string, string>)['User-Agent']).toBe('DownMusic/1.0')
  })
})
