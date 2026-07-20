import { join, dirname, extname } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import type { FfmpegEngine } from '../engines/ffmpeg'
import type { AudioFormat, AudioResult, FetchOptions, TrackMeta } from '../../shared/types'

/**
 * Converte o audio bruto para o formato-alvo, embute tags/capa
 * e grava no caminho final derivado do template de nome.
 */
export class Tagger {
  constructor(private readonly ffmpeg: FfmpegEngine) {}

  async finalize(meta: TrackMeta, raw: AudioResult, opts: FetchOptions): Promise<string> {
    const rel = renderTemplate(opts.nameTemplate, meta)
    const ext = outputExtension(opts.format, raw.rawPath)
    // organiza sob a pasta do genero (Rekordbox) quando conhecido
    const genreDir = meta.genre?.trim() ? sanitize(meta.genre) : ''
    const outPath = join(opts.outputDir, genreDir, `${rel}.${ext}`)
    await mkdir(dirname(outPath), { recursive: true })

    // baixa a capa localmente (nunca deixa o ffmpeg buscar por HTTP/TLS)
    const coverPath = await downloadCover(meta.coverUrl)
    try {
      await this.ffmpeg.convertAndTag(raw.rawPath, outPath, opts.format, opts.quality, meta, coverPath)
    } finally {
      if (coverPath) await rm(coverPath, { force: true }).catch(() => {})
      // apaga o arquivo bruto baixado (evita acumulo de .webm/.raw ao lado dos mp3)
      if (raw.rawPath !== outPath) await rm(raw.rawPath, { force: true })
    }
    return outPath
  }
}

/** Baixa a capa (http/https) para um arquivo temporario; retorna undefined se falhar. */
async function downloadCover(url?: string): Promise<string | undefined> {
  if (!url || !/^https?:\/\//i.test(url)) return undefined
  try {
    const res = await fetch(url)
    if (!res.ok) return undefined
    const buf = Buffer.from(await res.arrayBuffer())
    const file = join(tmpdir(), `downmusic-cover-${randomUUID()}.jpg`)
    await writeFile(file, buf)
    return file
  } catch {
    return undefined
  }
}

/** Extensao do arquivo final: o formato escolhido, ou (para 'best') a de origem. */
export function outputExtension(format: AudioFormat, rawPath: string): string {
  if (format !== 'best') return format
  return extname(rawPath).replace(/^\./, '') || 'm4a'
}

/** Expande placeholders do template com dados da faixa. */
export function renderTemplate(template: string, meta: TrackMeta): string {
  // artista/album ausentes viram vazio (nao "Unknown") — a pasta correspondente
  // e omitida em vez de criar um diretorio "Unknown".
  const track = typeof meta.trackNumber === 'number' ? String(meta.trackNumber).padStart(2, '0') : ''
  const filled = template
    .replace(/%artist%/g, sanitize(meta.artists[0] ?? ''))
    .replace(/%album%/g, sanitize(meta.album ?? ''))
    .replace(/%title%/g, sanitize(meta.title))
    .replace(/%track%/g, track)

  // limpa separadores pendurados por segmento e DESCARTA segmentos vazios
  // (ex: album desconhecido nao vira pasta).
  return filled
    .split('/')
    .map((seg) => seg.replace(/^\s*-\s+/, '').replace(/\s+-\s+$/, '').replace(/\s{2,}/g, ' ').trim())
    .filter((seg) => seg.length > 0)
    .join('/')
}

function sanitize(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, '_').trim()
}
