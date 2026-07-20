import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile, mkdir, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Tagger, renderTemplate } from './tagger'
import type { FetchOptions, TrackMeta } from '../../shared/types'

const exists = (p: string) =>
  access(p).then(
    () => true,
    () => false
  )

describe('Tagger.finalize', () => {
  it('gera o arquivo final e APAGA o bruto (evita acumulo de .webm)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tagger-'))
    const raw = join(dir, 'abc.webm')
    await writeFile(raw, 'raw-bytes')

    // ffmpeg falso: "converte" criando o arquivo de saida
    const ffmpeg = {
      async convertAndTag(_in: string, outPath: string) {
        await mkdir(join(outPath, '..'), { recursive: true })
        await writeFile(outPath, 'mp3-bytes')
        return outPath
      }
    } as any

    const meta: TrackMeta = { id: 'abc', title: 'Song', artists: ['A'], sourceId: 'youtube', sourceUrl: '' }
    const opts: FetchOptions = { format: 'mp3', quality: '320', outputDir: dir, nameTemplate: '%artist% - %title%' }

    const out = await new Tagger(ffmpeg).finalize(meta, { rawPath: raw }, opts)

    expect(out).toBe(join(dir, 'A - Song.mp3'))
    expect(await exists(out)).toBe(true) // final existe
    expect(await exists(raw)).toBe(false) // bruto apagado
  })

  it('organiza sob a pasta do genero quando disponivel (p/ Rekordbox)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tagger-'))
    const raw = join(dir, 'abc.webm')
    await writeFile(raw, 'raw-bytes')
    const ffmpeg = {
      async convertAndTag(_in: string, outPath: string) {
        await mkdir(join(outPath, '..'), { recursive: true })
        await writeFile(outPath, 'mp3-bytes')
        return outPath
      }
    } as any
    const meta: TrackMeta = { id: 'a', title: 'Song', artists: ['A'], genre: 'Drum & Bass', sourceId: 'youtube', sourceUrl: '' }
    const opts: FetchOptions = { format: 'mp3', quality: '320', outputDir: dir, nameTemplate: '%artist% - %title%' }
    const out = await new Tagger(ffmpeg).finalize(meta, { rawPath: raw }, opts)
    expect(out).toBe(join(dir, 'Drum & Bass', 'A - Song.mp3'))
  })
})

describe('renderTemplate', () => {
  const base: TrackMeta = { id: '1', title: 'Titulo', artists: ['Artista'], album: 'Album', sourceId: 'youtube', sourceUrl: '' }

  it('preenche %track% com o numero da faixa (2 digitos)', () => {
    expect(renderTemplate('%track% - %title%', { ...base, trackNumber: 5 })).toBe('05 - Titulo')
  })

  it('omite o segmento vazio quando nao ha numero de faixa', () => {
    expect(renderTemplate('%artist%/%track% - %title%', base)).toBe('Artista/Titulo')
  })

  it('descarta pasta de album ausente (sem "Unknown")', () => {
    expect(renderTemplate('%artist%/%album%/%title%', { ...base, album: undefined })).toBe('Artista/Titulo')
  })
})
