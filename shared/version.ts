// Logica pura de versao/atualizacao — compartilhada entre main e renderer.

export interface ReleaseAsset {
  name: string
  url: string
}

/** Resultado da checagem de atualizacao (montado no main, consumido no renderer). */
export interface UpdateInfo {
  current: string
  latest: string | null
  isNewer: boolean
  /** URL do instalador do SO/arquitetura atual (ou a pagina do release como fallback). */
  downloadUrl: string | null
  notesUrl: string | null
  error?: string
}

/** "v1.2.3" | "1.2.3" -> [1,2,3]. Componentes nao numericos viram 0. */
export function parseVersion(v: string): number[] {
  return v.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
}

/** True se `latest` for uma versao maior que `current` (comparacao semver simples). */
export function isNewer(current: string, latest: string): boolean {
  const c = parseVersion(current)
  const l = parseVersion(latest)
  for (let i = 0; i < Math.max(c.length, l.length); i++) {
    const a = l[i] ?? 0
    const b = c[i] ?? 0
    if (a > b) return true
    if (a < b) return false
  }
  return false
}

/**
 * Escolhe o asset do release correspondente ao SO/arquitetura atual.
 * Convencao de nomes: Windows `.exe`, macOS `-arm64.dmg`/`-x64.dmg`, Linux `.AppImage`.
 */
export function assetForPlatform(
  platform: string,
  arch: string,
  assets: ReleaseAsset[]
): ReleaseAsset | undefined {
  const find = (pred: (n: string) => boolean) => assets.find((a) => pred(a.name.toLowerCase()))
  if (platform === 'win32') return find((n) => n.endsWith('.exe'))
  if (platform === 'darwin') {
    const wantArm = arch === 'arm64'
    return (
      find((n) => n.endsWith('.dmg') && n.includes(wantArm ? 'arm64' : 'x64')) ??
      find((n) => n.endsWith('.dmg'))
    )
  }
  if (platform === 'linux') return find((n) => n.endsWith('.appimage'))
  return undefined
}
