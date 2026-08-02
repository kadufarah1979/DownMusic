import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Acha um ffmpeg utilizavel pelos testes que precisam gerar um arquivo de audio
 * de verdade. Nao e um `*.test.ts` — o vitest nao coleta este arquivo.
 *
 * A ordem espelha o resto do repo: `FFMPEG_BIN` (mesma variavel do smoke test),
 * depois o binario baixado por `scripts/fetch-binaries.sh`, depois o PATH — que
 * e o que a producao usa em desenvolvimento (`binPath` em `main/binaries.ts` so
 * aponta para `resources/bin` quando o app esta empacotado).
 *
 * So consulta o sistema de arquivos: nada de `spawn` de sonda. Um `spawn` que
 * falha por ENOENT emite `error`, nao `close` — foi assim que a ausencia do
 * binario virava timeout de 5s em vez de mensagem.
 */
export function findFfmpeg(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  cwd: string = process.cwd()
): string | null {
  const name = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'

  if (env.FFMPEG_BIN && existsSync(env.FFMPEG_BIN)) return env.FFMPEG_BIN

  const local = join(cwd, 'resources', 'bin', name)
  if (existsSync(local)) return local

  // delimitador por plataforma, nao `path.delimiter`: `platform` e parametro
  const dirs = (env.PATH ?? '').split(platform === 'win32' ? ';' : ':').filter(Boolean)
  for (const dir of dirs) {
    const candidate = join(dir, name)
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** Motivo do pulo, para o nome do bloco de teste dizer como habilitar. */
export const FFMPEG_HINT =
  'ffmpeg nao encontrado — rode `bash scripts/fetch-binaries.sh` ou deixe o ffmpeg no PATH'
