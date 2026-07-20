import { execa } from 'execa'
import type { AudioFormat, AudioQuality, TrackMeta } from '../../shared/types'

/** Executor de processo injetavel — permite testar sem spawnar o ffmpeg. */
export interface ProcRunner {
  run(bin: string, args: string[]): Promise<{ exitCode: number }>
}

/** Runner padrao baseado em execa. */
export class ExecaRunner implements ProcRunner {
  async run(bin: string, args: string[]) {
    const res = await execa(bin, args)
    return { exitCode: res.exitCode ?? 0 }
  }
}

/** Qualidade -> bitrate de destino, ou null para formatos sem bitrate (lossless/copy). */
export function qualityToBitrate(quality: AudioQuality): string | null {
  switch (quality) {
    case '128':
    case '192':
    case '256':
    case '320':
      return `${quality}k`
    default:
      return null // lossless | best
  }
}

/** Args de codec de audio por formato. */
function audioCodecArgs(format: AudioFormat, quality: AudioQuality): string[] {
  if (format === 'best') return ['-c:a', 'copy']
  if (format === 'flac') return ['-c:a', 'flac']

  const codec: Record<Exclude<AudioFormat, 'best' | 'flac'>, string> = {
    mp3: 'libmp3lame',
    m4a: 'aac',
    opus: 'libopus'
  }
  const args = ['-c:a', codec[format]]
  const bitrate = qualityToBitrate(quality)
  if (bitrate) args.push('-b:a', bitrate)
  return args
}

/** Capa embutida via attached_pic e suportada em mp3/m4a/flac (nao em opus/best). */
function supportsCover(format: AudioFormat): boolean {
  return format === 'mp3' || format === 'm4a' || format === 'flac'
}

/**
 * Monta os argumentos do ffmpeg para converter + gravar tags (+ capa quando aplicavel).
 * ffmpeg le a capa direto da URL http(s) como segundo input.
 */
export function buildConvertArgs(
  inPath: string,
  outPath: string,
  format: AudioFormat,
  quality: AudioQuality,
  meta: TrackMeta,
  coverPath?: string
): string[] {
  // capa vem de um ARQUIVO LOCAL (baixado antes) — nunca uma URL, para nao
  // depender da stack de rede/TLS do ffmpeg (alguns builds estaticos travam).
  const withCover = supportsCover(format) && !!coverPath

  const args: string[] = ['-y', '-i', inPath]
  if (withCover) args.push('-i', coverPath!)

  if (withCover) {
    args.push('-map', '0:a', '-map', '1:v', '-c:v', 'mjpeg', '-disposition:v', 'attached_pic')
  }
  args.push(...audioCodecArgs(format, quality))

  // tags ID3 (o Rekordbox le na importacao). So escreve o que existe.
  const tag = (k: string, v?: string | number) => {
    if (v !== undefined && v !== null && `${v}` !== '') args.push('-metadata', `${k}=${v}`)
  }
  tag('title', meta.title)
  tag('artist', meta.artists.join(', '))
  tag('album_artist', meta.artists[0])
  tag('album', meta.album)
  tag('genre', meta.genre)
  tag('date', meta.year)
  tag('track', meta.trackNumber)
  tag('disc', meta.discNumber)
  tag('publisher', meta.label) // -> TPUB (campo "Label" no Rekordbox)

  args.push(outPath)
  return args
}

/**
 * Wrapper sobre o binario externo `ffmpeg`.
 * Converte para o formato-alvo e embute tags + capa.
 */
export class FfmpegEngine {
  constructor(
    private readonly bin = 'ffmpeg',
    private readonly runner: ProcRunner = new ExecaRunner()
  ) {}

  async available(): Promise<boolean> {
    try {
      await this.runner.run(this.bin, ['-version'])
      return true
    } catch {
      return false
    }
  }

  async convertAndTag(
    inPath: string,
    outPath: string,
    format: AudioFormat,
    quality: AudioQuality,
    meta: TrackMeta,
    coverPath?: string
  ): Promise<string> {
    await this.runner.run(this.bin, buildConvertArgs(inPath, outPath, format, quality, meta, coverPath))
    return outPath
  }
}
