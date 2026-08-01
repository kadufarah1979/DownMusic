import { join } from 'node:path'
import type { BinariesStatus } from '../../shared/types'

/** Engine capaz de dizer se o binario que ela envolve responde. */
interface Probe {
  available(): Promise<boolean>
}

/**
 * Verifica se yt-dlp e ffmpeg respondem. Roda uma vez na inicializacao: sem
 * eles o app abre normalmente mas nenhum download conclui, e o usuario so
 * descobria no primeiro erro da fila.
 */
export async function checkBinaries(ytdlp: Probe, ffmpeg: Probe): Promise<BinariesStatus> {
  const [ytdlpOk, ffmpegOk] = await Promise.all([
    ytdlp.available().catch(() => false),
    ffmpeg.available().catch(() => false)
  ])
  return { ytdlp: ytdlpOk, ffmpeg: ffmpegOk }
}

/**
 * Caminho do binario externo (yt-dlp/ffmpeg).
 * - Empacotado: usa o binario embarcado em `resources/bin/<name>` (`.exe` no Windows).
 * - Desenvolvimento: usa o nome puro (resolvido pelo PATH).
 */
export function binPath(
  name: 'yt-dlp' | 'ffmpeg',
  opts: { isPackaged: boolean; resourcesPath: string; platform?: NodeJS.Platform }
): string {
  const platform = opts.platform ?? process.platform
  const bin = platform === 'win32' ? `${name}.exe` : name
  return opts.isPackaged ? join(opts.resourcesPath, 'bin', bin) : bin
}
