import { readdir, rm } from 'node:fs/promises'
import path, { join, type PlatformPath } from 'node:path'

/**
 * Arvores de sistema: bloqueadas junto com tudo abaixo delas — `/usr/share` e
 * `C:\Windows\System32` sao tao ruins de esvaziar quanto os pais.
 */
const SYSTEM_TREES_POSIX = ['/usr', '/etc', '/var', '/boot', '/bin', '/lib']
const SYSTEM_TREES_WIN32 = [
  'C:\\Windows',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\ProgramData'
]

/**
 * Pastas que guardam as homes: bloqueadas so exatamente. O que esta abaixo e
 * pasta de usuario — `/home/joao/Musica` e um destino legitimo de download.
 */
const HOME_PARENTS_POSIX = ['/home', '/root']
const HOME_PARENTS_WIN32 = ['C:\\Users']

/** Tira barras sobrando do fim, sem comer a raiz (`/`, `C:\`). */
function trimEnd(p: string, rootLen: number): string {
  return p.length > rootLen ? p.replace(/[\\/]+$/, '') : p
}

/**
 * Diz se e seguro apagar o CONTEUDO de `dir`. Bloqueia caminhos vazios, a raiz,
 * pastas de sistema e a propria home do usuario, e exige pelo menos dois niveis
 * abaixo da raiz.
 *
 * `flavor` existe para o teste exercitar as duas formas de caminho em qualquer
 * host — a versao anterior contava niveis com `split('/')` e, no Windows,
 * reprovava QUALQUER caminho: o "limpar pasta" e a aba Organizar (que usa esta
 * funcao como guarda) simplesmente nao funcionavam la.
 */
export function isSafeToClear(dir: string, home: string, flavor: PlatformPath = path): boolean {
  if (!dir || !dir.trim()) return false

  const isWindows = flavor.sep === '\\'
  const norm = (p: string) => {
    const n = flavor.normalize(p)
    return isWindows ? n.toLowerCase() : n
  }

  const d = norm(dir)
  // UNC (\\servidor\share): a "raiz" e o proprio share e nao da para exigir dois
  // niveis com o mesmo sentido. Recusar e o padrao seguro.
  if (isWindows && d.startsWith('\\\\')) return false

  const { root } = flavor.parse(d)
  const clean = trimEnd(d, root.length)

  if (!root) return false // relativo (`.`, `musicas`): nao da para julgar
  if (clean === trimEnd(root, 0)) return false // a propria raiz
  if (clean === trimEnd(norm(home), 0)) return false // a propria home

  const parents = isWindows ? HOME_PARENTS_WIN32 : HOME_PARENTS_POSIX
  if (parents.some((b) => clean === norm(b))) return false

  const trees = isWindows ? SYSTEM_TREES_WIN32 : SYSTEM_TREES_POSIX
  if (trees.some((b) => clean === norm(b) || clean.startsWith(norm(b) + flavor.sep))) return false

  // pelo menos 2 niveis abaixo da raiz (ex: /home/user/x, C:\Users\x\Music)
  return clean.slice(root.length).split(/[\\/]/).filter(Boolean).length >= 2
}

/** Apaga o conteudo de `dir` (arquivos e subpastas), mantendo a pasta. Retorna quantos itens. */
export async function clearDir(dir: string): Promise<number> {
  const entries = await readdir(dir)
  for (const name of entries) {
    await rm(join(dir, name), { recursive: true, force: true })
  }
  return entries.length
}
