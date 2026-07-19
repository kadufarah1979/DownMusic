import { execa } from 'execa'
import type { ProgressFn } from '../sources/types'

/** Executor de processo injetavel — permite testar sem spawnar processos reais. */
export interface ProcRunner {
  /** Roda `bin args`, chama onLine para cada linha (stdout+stderr), devolve stdout completo. */
  run(
    bin: string,
    args: string[],
    onLine: (line: string) => void
  ): Promise<{ stdout: string; exitCode: number }>
}

/** Runner padrao baseado em execa, com streaming linha a linha. */
export class ExecaRunner implements ProcRunner {
  async run(bin: string, args: string[], onLine: (line: string) => void) {
    const proc = execa(bin, args, { all: false })
    const stdoutLines: string[] = []

    const wire = (stream: NodeJS.ReadableStream | null, keep: boolean) => {
      let buf = ''
      stream?.on('data', (chunk: Buffer) => {
        buf += chunk.toString()
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl)
          buf = buf.slice(nl + 1)
          if (keep) stdoutLines.push(line)
          onLine(line)
        }
      })
    }
    wire(proc.stdout, true)
    wire(proc.stderr, false)

    const res = await proc
    return { stdout: stdoutLines.join('\n'), exitCode: res.exitCode ?? 0 }
  }
}

/** Extrai o percentual (0..100) de uma linha de progresso do yt-dlp, ou null. */
export function parseProgress(line: string): number | null {
  const m = /\[download\]\s+(\d+(?:\.\d+)?)%/.exec(line)
  return m ? parseFloat(m[1]) : null
}

/** Monta os argumentos para baixar o melhor audio de uma URL. */
export function buildDownloadArgs(url: string, outTemplate: string): string[] {
  return [
    '-f', 'bestaudio/best',
    '-o', outTemplate,
    '--no-playlist',
    '--newline',
    '--print', 'after_move:filepath',
    url
  ]
}

/** Monta os argumentos para achar o melhor resultado no YouTube sem baixar. */
export function buildSearchArgs(query: string): string[] {
  return [`ytsearch1:${query}`, '--no-download', '--print', 'webpage_url']
}

/** Retorna a ultima linha nao vazia (sem espacos) de uma saida, ou null. */
export function parseLastLine(stdout: string): string | null {
  const lines = stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  return lines.length ? lines[lines.length - 1] : null
}

/**
 * Wrapper sobre o binario externo `yt-dlp`.
 * Motor compartilhado usado pelas fontes YouTube/Bandcamp/SoundCloud
 * e pela fonte Spotify (para baixar o audio correspondente do YouTube).
 */
export class YtDlpEngine {
  constructor(
    private readonly bin = 'yt-dlp',
    private readonly runner: ProcRunner = new ExecaRunner()
  ) {}

  /** Verifica se o binario esta disponivel. */
  async available(): Promise<boolean> {
    try {
      await this.runner.run(this.bin, ['--version'], () => {})
      return true
    } catch {
      return false
    }
  }

  /**
   * Baixa o melhor audio de `url`. `outTemplate` deve conter %(ext)s.
   * Retorna o caminho final do arquivo (impresso pelo yt-dlp via after_move:filepath).
   */
  async downloadAudio(url: string, outTemplate: string, onProgress: ProgressFn): Promise<string> {
    const { stdout } = await this.runner.run(this.bin, buildDownloadArgs(url, outTemplate), (line) => {
      const pct = parseProgress(line)
      if (pct !== null) onProgress(pct)
    })
    const path = parseLastLine(stdout)
    if (!path) throw new Error('yt-dlp nao imprimiu o caminho final do arquivo baixado.')
    return path
  }

  /**
   * Procura no YouTube por uma query (ex: ISRC ou "artista titulo")
   * e retorna a URL do melhor resultado, ou null se nada for encontrado.
   */
  async searchBest(query: string): Promise<string | null> {
    const { stdout } = await this.runner.run(this.bin, buildSearchArgs(query), () => {})
    return parseLastLine(stdout)
  }
}
