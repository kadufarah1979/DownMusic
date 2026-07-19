import { join } from 'node:path'
import type { FfmpegEngine } from '../engines/ffmpeg'
import type { AudioResult, FetchOptions, TrackMeta } from '../../shared/types'

/**
 * Converte o audio bruto para o formato-alvo, embute tags/capa
 * e grava no caminho final derivado do template de nome.
 */
export class Tagger {
  constructor(private readonly ffmpeg: FfmpegEngine) {}

  async finalize(meta: TrackMeta, raw: AudioResult, opts: FetchOptions): Promise<string> {
    const rel = renderTemplate(opts.nameTemplate, meta)
    const ext = opts.format === 'best' ? 'm4a' : opts.format
    const outPath = join(opts.outputDir, `${rel}.${ext}`)
    // TODO: criar diretorios intermediarios antes de gravar.
    await this.ffmpeg.convertAndTag(raw.rawPath, outPath, opts.format, opts.quality, meta)
    return outPath
  }
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
