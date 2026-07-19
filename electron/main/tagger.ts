import { join, dirname, extname } from 'node:path'
import { mkdir } from 'node:fs/promises'
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
    const outPath = join(opts.outputDir, `${rel}.${ext}`)
    await mkdir(dirname(outPath), { recursive: true })
    await this.ffmpeg.convertAndTag(raw.rawPath, outPath, opts.format, opts.quality, meta)
    return outPath
  }
}

/** Extensao do arquivo final: o formato escolhido, ou (para 'best') a de origem. */
export function outputExtension(format: AudioFormat, rawPath: string): string {
  if (format !== 'best') return format
  return extname(rawPath).replace(/^\./, '') || 'm4a'
}

/** Expande placeholders do template com dados da faixa. */
export function renderTemplate(template: string, meta: TrackMeta): string {
  return template
    .replace(/%artist%/g, sanitize(meta.artists[0] ?? 'Unknown'))
    .replace(/%album%/g, sanitize(meta.album ?? 'Unknown'))
    .replace(/%title%/g, sanitize(meta.title))
    .replace(/%track%/g, '') // TODO: numero da faixa quando disponivel
    .replace(/\s+-\s+$/g, '')
}

function sanitize(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, '_').trim()
}
