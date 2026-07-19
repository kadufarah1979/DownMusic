import { join } from 'node:path'

/**
 * Caminho do binario externo (yt-dlp/ffmpeg).
 * - Empacotado (AppImage): usa o binario embarcado em `resources/bin/<name>`.
 * - Desenvolvimento: usa o nome puro (resolvido pelo PATH).
 */
export function binPath(
  name: 'yt-dlp' | 'ffmpeg',
  opts: { isPackaged: boolean; resourcesPath: string }
): string {
  return opts.isPackaged ? join(opts.resourcesPath, 'bin', name) : name
}
