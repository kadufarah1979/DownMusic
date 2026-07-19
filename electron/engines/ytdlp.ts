import { execa } from 'execa'
import type { ProgressFn } from '../sources/types'

/**
 * Wrapper sobre o binario externo `yt-dlp`.
 * Motor compartilhado injetado nas fontes YouTube/Bandcamp/SoundCloud
 * e usado pela fonte Spotify para baixar o audio correspondente.
 */
export class YtDlpEngine {
  constructor(private readonly bin = 'yt-dlp') {}

  /** Verifica se o binario esta disponivel no PATH. */
  async available(): Promise<boolean> {
    try {
      await execa(this.bin, ['--version'])
      return true
    } catch {
      return false
    }
  }

  /**
   * Baixa o melhor audio de uma URL para `outPath` (sem extensao final garantida).
   * TODO: parsear stdout para reportar progresso real via onProgress.
   */
  async downloadAudio(url: string, outPath: string, onProgress: ProgressFn): Promise<string> {
    // TODO: mapear format/quality; usar --extract-audio + --audio-format quando aplicavel.
    const args = ['-f', 'bestaudio', '-o', outPath, '--newline', url]
    const proc = execa(this.bin, args)
    proc.stdout?.on('data', (buf: Buffer) => {
      const m = /(\d+(?:\.\d+)?)%/.exec(buf.toString())
      if (m) onProgress(parseFloat(m[1]))
    })
    await proc
    return outPath
  }

  /**
   * Procura no YouTube por uma query (ex: "ISRC" ou "artista - titulo")
   * e retorna a URL do melhor resultado. Usado pela fonte Spotify.
   * TODO: usar `ytsearch1:<query>` + --print para extrair a URL.
   */
  async searchBest(query: string): Promise<string | null> {
    // TODO: implementar via `yt-dlp "ytsearch1:<query>" --print webpage_url`.
    void query
    return null
  }
}
