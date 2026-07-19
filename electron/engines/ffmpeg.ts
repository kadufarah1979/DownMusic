import { execa } from 'execa'
import type { AudioFormat, AudioQuality, TrackMeta } from '../../shared/types'

/**
 * Wrapper sobre o binario externo `ffmpeg`.
 * Converte para o formato-alvo e embute tags + capa.
 */
export class FfmpegEngine {
  constructor(private readonly bin = 'ffmpeg') {}

  async available(): Promise<boolean> {
    try {
      await execa(this.bin, ['-version'])
      return true
    } catch {
      return false
    }
  }

  /**
   * Converte `inPath` para `outPath` no formato/qualidade dados, gravando tags.
   * TODO: montar args de codec por formato e mapear qualidade -> bitrate.
   * TODO: baixar/embutir capa (meta.coverUrl) como stream de video attached_pic.
   */
  async convertAndTag(
    inPath: string,
    outPath: string,
    format: AudioFormat,
    quality: AudioQuality,
    meta: TrackMeta
  ): Promise<string> {
    // TODO: implementar mapeamento real. Esqueleto minimo abaixo.
    const args = ['-y', '-i', inPath]
    args.push(
      '-metadata', `title=${meta.title}`,
      '-metadata', `artist=${meta.artists.join(', ')}`
    )
    if (meta.album) args.push('-metadata', `album=${meta.album}`)
    void format
    void quality
    args.push(outPath)
    await execa(this.bin, args)
    return outPath
  }
}
