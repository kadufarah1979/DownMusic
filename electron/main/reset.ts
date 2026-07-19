import { readdir, rm } from 'node:fs/promises'
import { join, normalize } from 'node:path'

/**
 * Diz se e seguro apagar o CONTEUDO de `dir`. Bloqueia caminhos vazios/perigosos
 * (raiz, /home, /usr, a propria home do usuario) para evitar estrago acidental.
 */
export function isSafeToClear(dir: string, home: string): boolean {
  if (!dir || !dir.trim()) return false
  const d = normalize(dir).replace(/\/+$/, '') || '/'
  if (d === '/' || d === '.' ) return false
  const blocked = new Set([normalize(home).replace(/\/+$/, ''), '/home', '/root', '/usr', '/etc', '/var', '/boot', '/bin', '/lib'])
  if (blocked.has(d)) return false
  // precisa ter pelo menos 2 niveis abaixo da raiz (ex: /home/user/x)
  if (d.split('/').filter(Boolean).length < 2) return false
  return true
}

/** Apaga o conteudo de `dir` (arquivos e subpastas), mantendo a pasta. Retorna quantos itens. */
export async function clearDir(dir: string): Promise<number> {
  const entries = await readdir(dir)
  for (const name of entries) {
    await rm(join(dir, name), { recursive: true, force: true })
  }
  return entries.length
}
