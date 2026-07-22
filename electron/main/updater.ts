import { assetForPlatform, isNewer, type ReleaseAsset, type UpdateInfo } from '../../shared/version'

/** Repositorio de releases (owner/repo). */
export const REPO = 'kadufarah1979/DownMusic'

interface GitHubRelease {
  tag_name?: string
  html_url?: string
  assets?: { name: string; browser_download_url: string }[]
}

type FetchFn = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
}>

/**
 * Consulta o ultimo release no GitHub e monta o resultado da checagem.
 * Roda no MAIN (evita CORS/CSP no renderer). `fetchFn`/`platform`/`arch`
 * sao injetaveis para teste. Falha de rede vira `error` (nao lanca).
 */
export async function checkForUpdate(
  current: string,
  platform: string = process.platform,
  arch: string = process.arch,
  fetchFn: FetchFn = fetch as unknown as FetchFn
): Promise<UpdateInfo> {
  try {
    const res = await fetchFn(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { 'User-Agent': 'DownMusic', Accept: 'application/vnd.github+json' }
    })
    if (!res.ok) throw new Error(`GitHub API ${res.status}`)
    const data = (await res.json()) as GitHubRelease
    const latest = (data.tag_name ?? '').replace(/^v/i, '') || null
    const assets: ReleaseAsset[] = (data.assets ?? []).map((a) => ({
      name: a.name,
      url: a.browser_download_url
    }))
    const asset = assetForPlatform(platform, arch, assets)
    return {
      current,
      latest,
      isNewer: latest ? isNewer(current, latest) : false,
      downloadUrl: asset?.url ?? data.html_url ?? null,
      notesUrl: data.html_url ?? null
    }
  } catch (e) {
    return {
      current,
      latest: null,
      isNewer: false,
      downloadUrl: null,
      notesUrl: null,
      error: e instanceof Error ? e.message : String(e)
    }
  }
}
