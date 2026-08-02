import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname } from 'node:path'
import { downloadCover } from './cover'

const okResponse = (bytes: Uint8Array) =>
  ({ ok: true, status: 200, arrayBuffer: async () => bytes.buffer }) as unknown as Response

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('downloadCover', () => {
  it('grava a imagem num arquivo temporario e devolve o caminho', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]) // cabecalho JPEG
    vi.stubGlobal('fetch', async () => okResponse(bytes))

    const file = await downloadCover('https://cdn/capa.jpg')

    expect(file).toBeDefined()
    expect(dirname(file!)).toBe(tmpdir())
    expect(extname(file!)).toBe('.jpg')
    expect(new Uint8Array(await readFile(file!))).toEqual(bytes)
    expect((await stat(file!)).size).toBe(bytes.length)
  })

  it('duas chamadas nao colidem no mesmo arquivo', async () => {
    vi.stubGlobal('fetch', async () => okResponse(new Uint8Array([1])))
    const [a, b] = [await downloadCover('https://cdn/a.jpg'), await downloadCover('https://cdn/b.jpg')]
    expect(a).not.toBe(b)
  })

  it('sem URL devolve undefined sem tocar na rede', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    expect(await downloadCover(undefined)).toBeUndefined()
    expect(await downloadCover('')).toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('esquema que nao e http(s) e recusado sem tocar na rede', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    expect(await downloadCover('file:///etc/passwd')).toBeUndefined()
    expect(await downloadCover('data:image/png;base64,AAAA')).toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('resposta nao-ok devolve undefined em vez de lancar', async () => {
    // o corpo funciona de proposito: assim o `undefined` so pode vir da checagem
    // de `res.ok`, e nao de uma excecao que o try/catch engoliria (a versao
    // anterior deste teste passava mesmo com a checagem removida)
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 404,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer
    }) as unknown as Response)

    await expect(downloadCover('https://cdn/sumiu.jpg')).resolves.toBeUndefined()
  })

  it('erro de rede devolve undefined: o Tagger conta com isso para nao perder o download', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('ENOTFOUND cdn')
    })
    await expect(downloadCover('https://cdn/capa.jpg')).resolves.toBeUndefined()
  })
})
