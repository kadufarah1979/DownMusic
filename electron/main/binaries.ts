import { join } from 'node:path'

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
