# Análise e organização de diretório para o Rekordbox — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma aba "Organizar" que varre um diretório, lê tags/qualidade, analisa problemas (tags faltando, duplicados, qualidade, não identificados), enriquece buracos via Deezer e reorganiza os arquivos por template — com prévia e aprovação.

**Architecture:** Componentes puros em `shared/` (análise, plano) testados por TDD; I/O em `electron/main/` (scanner com `music-metadata`, executor com ffmpeg `-c copy`); UI em `src/components/OrganizeView.tsx`. Reaproveita `MetadataEnricher` (Deezer), `renderTemplate`, `nameKey`, `isSafeToClear`.

**Tech Stack:** Electron 29, TypeScript, React 18, Vitest, `music-metadata@7.14.0` (leitura de tags — CJS), ffmpeg embarcado, p-queue (throttle de enriquecimento).

---

## Estrutura de arquivos

- Create `shared/library.ts` — tipos (`ScannedTrack`, `TrackIssue`, `DuplicateGroup`, `AnalysisReport`, `PlanEntry`, `OrganizationPlan`, `PlannedInput`) + `qualityRank` + constantes.
- Create `shared/libraryAnalysis.ts` — `findDuplicates`, `analyzeLibrary` (puro).
- Create `electron/main/organizationPlan.ts` — `buildPlan` (puro, mas mora no main por reusar `renderTemplate` do tagger; tipos ficam em `shared/library.ts`).
- Create `electron/main/cover.ts` — `downloadCover` (extraído do Tagger).
- Modify `electron/main/tagger.ts` — passa a importar `downloadCover` de `cover.ts`.
- Modify `electron/engines/ffmpeg.ts` — adiciona `buildRetagArgs` (remux `-c copy`).
- Create `electron/main/libraryScanner.ts` — `TagReader`, `MusicMetadataReader`, `LibraryScanner`.
- Create `electron/main/organizationExecutor.ts` — `OrganizationExecutor` (aplica plano, eventos de progresso).
- Create `electron/main/library.ts` — `LibraryService` (orquestra scan→analyze→enrich→plan→apply; throttle) + `mergeMissing`.
- Modify `electron/main/ipc.ts` + `electron/preload/index.ts` — canais `library:*`.
- Modify `electron/main/index.ts` — instancia `LibraryService`, registra IPC.
- Create `src/components/OrganizeView.tsx` — UI da aba.
- Modify `src/App.tsx` — aba "Organizar".

---

## Task 0: Spike — de-risco do `music-metadata`

**Files:** none (validação de bundling).

- [ ] **Step 1: Instalar a dependência (versão CJS)**

Run:
```bash
npm install music-metadata@7.14.0
```

- [ ] **Step 2: Ler um arquivo real no processo Node**

Gere um mp3 mínimo com tags e leia:
```bash
BIN=resources/bin/ffmpeg
"$BIN" -y -f lavfi -i anullsrc=r=44100:cl=mono -t 1 -metadata title=Teste -metadata artist=Fulano -metadata genre=House /tmp/mm-spike.mp3
node -e "require('music-metadata').parseFile('/tmp/mm-spike.mp3').then(m=>console.log(m.common.title,m.common.artists,m.common.genre,m.format.container,m.format.bitrate))"
```
Expected: imprime `Teste [ 'Fulano' ] [ 'House' ] MPEG <número>`.

- [ ] **Step 3: Confirmar bundling no build do main**

Run:
```bash
npm run build 2>&1 | tail -5 && node -e "require('./out/main/index.js')" 2>&1 | head -3 || true
```
Expected: `npm run build` conclui sem erro de resolução de `music-metadata`. (O `require` do main pode falhar por falta de ambiente Electron — o que importa é o build passar.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: adiciona music-metadata para leitura de tags"
```

---

## Task 1: Tipos + `qualityRank`

**Files:**
- Create: `shared/library.ts`
- Test: `shared/library.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// shared/library.test.ts
import { describe, it, expect } from 'vitest'
import { qualityRank, type ScannedTrack } from './library'

const t = (over: Partial<ScannedTrack>): ScannedTrack => ({
  path: '/a.mp3', artists: [], hasCover: false, format: 'MP3', lossless: false, fileSize: 1, ...over
})

describe('qualityRank', () => {
  it('lossless supera qualquer lossy', () => {
    expect(qualityRank(t({ lossless: true, bitrate: 900 }))).toBeGreaterThan(qualityRank(t({ bitrate: 320 })))
  })
  it('entre lossy, maior bitrate vence', () => {
    expect(qualityRank(t({ bitrate: 320 }))).toBeGreaterThan(qualityRank(t({ bitrate: 128 })))
  })
  it('sem bitrate vale 0', () => {
    expect(qualityRank(t({}))).toBe(0)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run shared/library.test.ts`
Expected: FAIL — `qualityRank` não existe.

- [ ] **Step 3: Implementar**

```ts
// shared/library.ts
import type { TrackMeta } from './types'

/** Uma faixa lida do disco (tags existentes + qualidade). */
export interface ScannedTrack {
  path: string
  title?: string
  artists: string[]
  album?: string
  genre?: string
  year?: string
  label?: string
  trackNumber?: number
  discNumber?: number
  isrc?: string
  hasCover: boolean
  format: string
  bitrate?: number // kbps
  lossless: boolean
  durationSec?: number
  fileSize: number
}

export interface TrackIssue {
  path: string
  missing: string[] // subconjunto de ['genre','year','label','track','cover']
  lowQuality?: boolean
  unidentified?: boolean // sem título ou sem artista nas tags
}

export interface DuplicateGroup {
  key: string
  keeper: string
  others: string[]
}

export interface AnalysisReport {
  total: number
  genres: { genre: string; count: number }[]
  missingGenre: number
  missingCover: number
  lowQuality: number
  unidentified: number
  duplicates: DuplicateGroup[]
  issues: TrackIssue[]
}

/** Faixa já enriquecida: `filled` são as tags que estavam faltando e foram preenchidas. */
export interface PlannedInput {
  track: ScannedTrack
  filled: Partial<TrackMeta>
}

export interface PlanEntry {
  from: string
  to: string
  needsRetag: boolean
  tags?: Partial<TrackMeta>
  duplicate?: boolean
}

export interface OrganizationPlan {
  rootDir: string
  entries: PlanEntry[]
  collisions: string[]
}

/** Abaixo disto (e não-lossless) é considerado baixa qualidade. */
export const LOW_KBPS = 256
/** Campos que o Rekordbox usa e que valem enriquecer. */
export const REKORDBOX_FIELDS = ['genre', 'year', 'label', 'track', 'cover'] as const
/** Pasta de quarentena para duplicados. */
export const DUP_DIR = '_Duplicados'

/** Ranqueia qualidade: lossless domina; senão, maior bitrate. */
export function qualityRank(t: ScannedTrack): number {
  if (t.lossless) return 1_000_000 + (t.bitrate ?? 0)
  return t.bitrate ?? 0
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run shared/library.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add shared/library.ts shared/library.test.ts
git commit -m "feat: tipos da biblioteca + qualityRank"
```

---

## Task 2: `findDuplicates` + `analyzeLibrary`

**Files:**
- Create: `shared/libraryAnalysis.ts`
- Test: `shared/libraryAnalysis.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// shared/libraryAnalysis.test.ts
import { describe, it, expect } from 'vitest'
import { findDuplicates, analyzeLibrary } from './libraryAnalysis'
import type { ScannedTrack } from './library'

const t = (over: Partial<ScannedTrack>): ScannedTrack => ({
  path: '/a.mp3', title: 'Song', artists: ['A'], hasCover: true, format: 'MP3', lossless: false, bitrate: 320, fileSize: 1, ...over
})

describe('findDuplicates', () => {
  it('agrupa por ISRC e mantém a de maior qualidade', () => {
    const g = findDuplicates([
      t({ path: '/lo.mp3', isrc: 'X', bitrate: 128 }),
      t({ path: '/hi.mp3', isrc: 'X', bitrate: 320 })
    ])
    expect(g).toHaveLength(1)
    expect(g[0].keeper).toBe('/hi.mp3')
    expect(g[0].others).toEqual(['/lo.mp3'])
  })
  it('sem ISRC, agrupa por artista+título normalizado', () => {
    const g = findDuplicates([
      t({ path: '/1.mp3', title: 'One More Time', artists: ['Daft Punk'] }),
      t({ path: '/2.mp3', title: 'one more time', artists: ['daft punk'], bitrate: 128 })
    ])
    expect(g).toHaveLength(1)
    expect(g[0].keeper).toBe('/1.mp3')
  })
  it('não agrupa faixas não identificadas (sem título)', () => {
    expect(findDuplicates([t({ path: '/1', title: undefined }), t({ path: '/2', title: undefined })])).toEqual([])
  })
})

describe('analyzeLibrary', () => {
  it('conta faltantes, baixa qualidade, não identificados e gêneros', () => {
    const r = analyzeLibrary([
      t({ path: '/1.mp3', genre: 'House', hasCover: true, bitrate: 320 }),
      t({ path: '/2.mp3', genre: undefined, hasCover: false, bitrate: 128 }),
      t({ path: '/3.mp3', title: undefined, artists: [] })
    ])
    expect(r.total).toBe(3)
    expect(r.missingGenre).toBe(2) // /2 e /3
    expect(r.missingCover).toBe(1) // /2
    expect(r.lowQuality).toBe(1) // /2 (128 < 256)
    expect(r.unidentified).toBe(1) // /3
    expect(r.genres.find((g) => g.genre === 'House')?.count).toBe(1)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run shared/libraryAnalysis.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
// shared/libraryAnalysis.ts
import { nameKey } from './history'
import { qualityRank, LOW_KBPS, type ScannedTrack, type DuplicateGroup, type TrackIssue, type AnalysisReport } from './library'

const NO_GENRE = 'Sem genero'

/** Agrupa duplicados por ISRC (senão por artista+título) e elege a de maior qualidade. */
export function findDuplicates(tracks: ScannedTrack[]): DuplicateGroup[] {
  const map = new Map<string, ScannedTrack[]>()
  for (const t of tracks) {
    if (!t.title || t.artists.length === 0) continue // não identificado não entra em grupo
    const key = t.isrc ? `isrc:${t.isrc.toLowerCase()}` : `name:${nameKey({ title: t.title, artists: t.artists })}`
    const arr = map.get(key)
    if (arr) arr.push(t)
    else map.set(key, [t])
  }
  const groups: DuplicateGroup[] = []
  for (const [key, arr] of map) {
    if (arr.length < 2) continue
    const sorted = [...arr].sort((a, b) => qualityRank(b) - qualityRank(a) || a.path.localeCompare(b.path))
    groups.push({ key, keeper: sorted[0].path, others: sorted.slice(1).map((t) => t.path) })
  }
  return groups
}

/** Analisa o acervo: faltantes, qualidade, não identificados, duplicados, gêneros. */
export function analyzeLibrary(tracks: ScannedTrack[]): AnalysisReport {
  const issues: TrackIssue[] = []
  const genreCount = new Map<string, number>()
  let missingGenre = 0
  let missingCover = 0
  let lowQuality = 0
  let unidentified = 0

  for (const t of tracks) {
    const g = t.genre?.trim() || NO_GENRE
    genreCount.set(g, (genreCount.get(g) ?? 0) + 1)

    const missing: string[] = []
    if (!t.genre) missing.push('genre')
    if (!t.year) missing.push('year')
    if (!t.label) missing.push('label')
    if (t.trackNumber == null) missing.push('track')
    if (!t.hasCover) missing.push('cover')

    const low = !t.lossless && t.bitrate != null && t.bitrate < LOW_KBPS
    const unid = !t.title || t.artists.length === 0

    if (!t.genre) missingGenre++
    if (!t.hasCover) missingCover++
    if (low) lowQuality++
    if (unid) unidentified++

    if (missing.length || low || unid) {
      issues.push({ path: t.path, missing, ...(low && { lowQuality: true }), ...(unid && { unidentified: true }) })
    }
  }

  const genres = [...genreCount.entries()]
    .sort(([a], [b]) => (a === NO_GENRE ? 1 : b === NO_GENRE ? -1 : a.localeCompare(b, 'pt-BR')))
    .map(([genre, count]) => ({ genre, count }))

  return { total: tracks.length, genres, missingGenre, missingCover, lowQuality, unidentified, duplicates: findDuplicates(tracks), issues }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run shared/libraryAnalysis.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/libraryAnalysis.ts shared/libraryAnalysis.test.ts
git commit -m "feat: análise da biblioteca (duplicados, faltantes, qualidade)"
```

---

## Task 3: `buildPlan`

**Files:**
- Create: `electron/main/organizationPlan.ts`
- Test: `electron/main/organizationPlan.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// electron/main/organizationPlan.test.ts
import { describe, it, expect } from 'vitest'
import { buildPlan } from './organizationPlan'
import type { PlannedInput, ScannedTrack } from '../../shared/library'

const st = (over: Partial<ScannedTrack>): ScannedTrack => ({
  path: '/in/x.mp3', title: 'Song', artists: ['A'], hasCover: true, format: 'MP3', lossless: false, bitrate: 320, fileSize: 1, ...over
})
const inp = (track: ScannedTrack, filled = {}): PlannedInput => ({ track, filled })
const TPL = '%genre%/%artist% - %title%'

describe('buildPlan', () => {
  it('monta destino pelo template, preservando a extensão', () => {
    const p = buildPlan({ rootDir: '/root', template: TPL, inputs: [inp(st({ path: '/in/x.mp3', genre: 'House' }))], duplicates: [] })
    expect(p.entries[0].to).toBe('/root/House/A - Song.mp3')
    expect(p.entries[0].needsRetag).toBe(false)
  })

  it('marca needsRetag e carrega as tags quando houve enriquecimento', () => {
    const p = buildPlan({ rootDir: '/root', template: TPL, inputs: [inp(st({ genre: 'House' }), { year: '2020' })], duplicates: [] })
    expect(p.entries[0].needsRetag).toBe(true)
    expect(p.entries[0].tags).toEqual({ year: '2020' })
  })

  it('sem gênero cai na raiz (sem pasta de gênero)', () => {
    const p = buildPlan({ rootDir: '/root', template: TPL, inputs: [inp(st({ genre: undefined }))], duplicates: [] })
    expect(p.entries[0].to).toBe('/root/A - Song.mp3')
  })

  it('duplicado vai para _Duplicados/ com o basename original', () => {
    const p = buildPlan({ rootDir: '/root', template: TPL, inputs: [inp(st({ path: '/in/lo.mp3', genre: 'House' }))], duplicates: ['/in/lo.mp3'] })
    expect(p.entries[0].to).toBe('/root/_Duplicados/lo.mp3')
    expect(p.entries[0].duplicate).toBe(true)
  })

  it('pula quando já está no destino (idempotente)', () => {
    const p = buildPlan({ rootDir: '/root', template: TPL, inputs: [inp(st({ path: '/root/House/A - Song.mp3', genre: 'House' }))], duplicates: [] })
    expect(p.entries).toHaveLength(0)
  })

  it('colisão: mantém o primeiro, sinaliza os demais', () => {
    const p = buildPlan({
      rootDir: '/root', template: TPL, duplicates: [],
      inputs: [inp(st({ path: '/in/1.mp3', genre: 'House' })), inp(st({ path: '/in/2.mp3', genre: 'House' }))]
    })
    expect(p.entries).toHaveLength(1)
    expect(p.collisions).toEqual(['/in/2.mp3'])
  })

  it('sem título nem artista usa o basename original como nome', () => {
    const p = buildPlan({ rootDir: '/root', template: TPL, inputs: [inp(st({ path: '/in/faixa123.mp3', title: undefined, artists: [], genre: undefined }))], duplicates: [] })
    expect(p.entries[0].to).toBe('/root/faixa123.mp3')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run electron/main/organizationPlan.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
// electron/main/organizationPlan.ts
import { join, extname, basename } from 'node:path'
import { renderTemplate } from './tagger'
import { DUP_DIR, type PlannedInput, type PlanEntry, type OrganizationPlan, type ScannedTrack } from '../../shared/library'
import type { TrackMeta } from '../../shared/types'

interface BuildArgs {
  rootDir: string
  template: string
  inputs: PlannedInput[]
  duplicates: string[] // paths a quarentenar (others de todos os grupos)
}

/** Adapta uma faixa lida para o formato que o renderTemplate espera. */
function metaForTemplate(t: ScannedTrack): TrackMeta {
  return { id: t.path, title: t.title ?? '', artists: t.artists, album: t.album, trackNumber: t.trackNumber, sourceId: 'youtube', sourceUrl: '' }
}

/** Calcula os movimentos/renomeações a partir do template. Não toca no disco. */
export function buildPlan({ rootDir, template, inputs, duplicates }: BuildArgs): OrganizationPlan {
  const dup = new Set(duplicates)
  const entries: PlanEntry[] = []
  const collisions: string[] = []
  const takenDest = new Set<string>()

  for (const { track, filled } of inputs) {
    const ext = extname(track.path)
    if (dup.has(track.path)) {
      entries.push({ from: track.path, to: join(rootDir, DUP_DIR, basename(track.path)), needsRetag: false, duplicate: true })
      continue
    }
    const rel = renderTemplate(template, metaForTemplate(track))
    const name = rel || basename(track.path, ext) // fallback quando o template renderiza vazio
    const to = join(rootDir, `${name}${ext}`)
    const needsRetag = Object.keys(filled).length > 0

    if (to === track.path && !needsRetag) continue // já organizado
    if (takenDest.has(to) && to !== track.path) {
      collisions.push(track.path)
      continue
    }
    takenDest.add(to)
    entries.push({ from: track.path, to, needsRetag, ...(needsRetag && { tags: filled }) })
  }

  return { rootDir, entries, collisions }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run electron/main/organizationPlan.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add electron/main/organizationPlan.ts electron/main/organizationPlan.test.ts
git commit -m "feat: planejador de reorganização por template"
```

---

## Task 4: Extrair `downloadCover` para `cover.ts`

**Files:**
- Create: `electron/main/cover.ts`
- Modify: `electron/main/tagger.ts` (remove a função local, importa de `cover.ts`)

- [ ] **Step 1: Criar o helper**

```ts
// electron/main/cover.ts
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

/** Baixa a capa (http/https) para um arquivo temporário; retorna undefined se falhar. */
export async function downloadCover(url?: string): Promise<string | undefined> {
  if (!url || !/^https?:\/\//i.test(url)) return undefined
  try {
    const res = await fetch(url)
    if (!res.ok) return undefined
    const buf = Buffer.from(await res.arrayBuffer())
    const file = join(tmpdir(), `downmusic-cover-${randomUUID()}.jpg`)
    await writeFile(file, buf)
    return file
  } catch {
    return undefined
  }
}
```

- [ ] **Step 2: Atualizar o Tagger para usar o helper**

Em `electron/main/tagger.ts`: remova a função local `downloadCover` (linhas ~34-47) e o import agora desnecessário de `tmpdir`/`randomUUID`/`writeFile` se não usados em outro ponto. Adicione no topo:
```ts
import { downloadCover } from './cover'
```
O restante (`await downloadCover(meta.coverUrl)` dentro de `finalize`) permanece igual.

- [ ] **Step 3: Rodar os testes existentes (sem regressão)**

Run: `npx vitest run electron/main/tagger.test.ts`
Expected: PASS (5 testes) — comportamento inalterado.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: sem erros (confirma que os imports removidos do tagger não são mais referenciados).

- [ ] **Step 5: Commit**

```bash
git add electron/main/cover.ts electron/main/tagger.ts
git commit -m "refactor: extrai downloadCover para cover.ts (reuso pelo executor)"
```

---

## Task 5: `buildRetagArgs` (remux sem perda)

**Files:**
- Modify: `electron/engines/ffmpeg.ts`
- Test: `electron/engines/ffmpeg.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Adicione ao final de `electron/engines/ffmpeg.test.ts` (antes do último `})` do arquivo, como novo `describe`):
```ts
import { buildRetagArgs } from './ffmpeg'

describe('buildRetagArgs', () => {
  it('remux sem reencode (-c copy) e grava tags novas', () => {
    const args = buildRetagArgs('/in.mp3', '/out.mp3', { genre: 'House', year: '2020', label: 'Selo' })
    expect(args).toContain('-c')
    expect(args[args.indexOf('-c') + 1]).toBe('copy')
    expect(args).toContain('genre=House')
    expect(args).toContain('date=2020')
    expect(args).toContain('publisher=Selo')
    expect(args).not.toContain('libmp3lame') // não reencoda
    expect(args[args.length - 1]).toBe('/out.mp3')
  })

  it('embute capa local mantendo o áudio com -c:a copy', () => {
    const args = buildRetagArgs('/in.mp3', '/out.mp3', { genre: 'House' }, '/tmp/c.jpg')
    expect(args.filter((a) => a === '-i')).toHaveLength(2)
    expect(args).toContain('attached_pic')
    expect(args[args.indexOf('-c:a') + 1]).toBe('copy')
    expect(args).toContain('mjpeg')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run electron/engines/ffmpeg.test.ts`
Expected: FAIL — `buildRetagArgs` não existe.

- [ ] **Step 3: Implementar**

Em `electron/engines/ffmpeg.ts`, adicione (usa o mesmo mapeamento de tags do `buildConvertArgs`):
```ts
/** Escreve tags/capa num arquivo existente SEM reencodar o áudio (-c copy). */
export function buildRetagArgs(
  inPath: string,
  outPath: string,
  tags: Partial<TrackMeta>,
  coverPath?: string
): string[] {
  const args: string[] = ['-y', '-i', inPath]
  if (coverPath) args.push('-i', coverPath)

  if (coverPath) {
    args.push('-map', '0:a', '-map', '1:v', '-c:a', 'copy', '-c:v', 'mjpeg', '-disposition:v', 'attached_pic')
  } else {
    args.push('-map', '0', '-c', 'copy')
  }

  const tag = (k: string, v?: string | number) => {
    if (v !== undefined && v !== null && `${v}` !== '') args.push('-metadata', `${k}=${v}`)
  }
  tag('title', tags.title)
  tag('artist', tags.artists?.join(', '))
  tag('album_artist', tags.artists?.[0])
  tag('album', tags.album)
  tag('genre', tags.genre)
  tag('date', tags.year)
  tag('track', tags.trackNumber)
  tag('disc', tags.discNumber)
  tag('publisher', tags.label)

  args.push(outPath)
  return args
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run electron/engines/ffmpeg.test.ts`
Expected: PASS (13 testes).

- [ ] **Step 5: Commit**

```bash
git add electron/engines/ffmpeg.ts electron/engines/ffmpeg.test.ts
git commit -m "feat: buildRetagArgs (remux -c copy para tagueamento sem perda)"
```

---

## Task 6: `LibraryScanner`

**Files:**
- Create: `electron/main/libraryScanner.ts`
- Test: `electron/main/libraryScanner.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// electron/main/libraryScanner.test.ts
import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LibraryScanner, type TagReader } from './libraryScanner'
import type { ScannedTrack } from '../../shared/library'

// leitor falso: deriva tags triviais do nome do arquivo
const fakeReader: TagReader = {
  async read(path) {
    if (path.includes('corrupt')) throw new Error('ilegível')
    return { artists: ['A'], title: 'T', hasCover: true, format: 'MP3', lossless: false, bitrate: 320, fileSize: 10 } as Omit<ScannedTrack, 'path'>
  }
}

describe('LibraryScanner.scan', () => {
  it('varre recursivamente só áudio, pula _Duplicados/ e coleta ilegíveis', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'scan-'))
    await writeFile(join(dir, 'a.mp3'), 'x')
    await writeFile(join(dir, 'nota.txt'), 'x') // ignorado
    await mkdir(join(dir, 'sub'))
    await writeFile(join(dir, 'sub', 'b.flac'), 'x')
    await writeFile(join(dir, 'corrupt.mp3'), 'x')
    await mkdir(join(dir, '_Duplicados'))
    await writeFile(join(dir, '_Duplicados', 'old.mp3'), 'x') // ignorado

    const scanner = new LibraryScanner(fakeReader)
    const { tracks, unreadable } = await scanner.scan(dir)

    const names = tracks.map((t) => t.path.replace(dir, '')).sort()
    expect(names).toEqual(['/a.mp3', '/sub/b.flac'])
    expect(unreadable).toEqual([join(dir, 'corrupt.mp3')])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run electron/main/libraryScanner.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
// electron/main/libraryScanner.ts
import { readdir } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { parseFile } from 'music-metadata'
import { DUP_DIR, type ScannedTrack } from '../../shared/library'

const AUDIO_EXT = new Set(['.mp3', '.flac', '.m4a', '.aac', '.wav', '.ogg', '.opus'])

/** Lê as tags/qualidade de um arquivo. Injetável para teste. */
export interface TagReader {
  read(path: string): Promise<Omit<ScannedTrack, 'path'>>
}

/** Leitor real sobre music-metadata. */
export class MusicMetadataReader implements TagReader {
  async read(path: string): Promise<Omit<ScannedTrack, 'path'>> {
    const { common, format } = await parseFile(path, { duration: false })
    return {
      title: common.title,
      artists: common.artists?.length ? common.artists : common.artist ? [common.artist] : [],
      album: common.album,
      genre: common.genre?.[0],
      year: common.year != null ? String(common.year) : common.date,
      label: common.label?.[0],
      trackNumber: common.track?.no ?? undefined,
      discNumber: common.disk?.no ?? undefined,
      isrc: common.isrc?.[0],
      hasCover: (common.picture?.length ?? 0) > 0,
      format: (format.container ?? extname(path).slice(1)).toUpperCase(),
      bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : undefined,
      lossless: format.lossless ?? false,
      durationSec: format.duration,
      fileSize: 0
    }
  }
}

/** Varre um diretório e lê as tags de cada arquivo de áudio. */
export class LibraryScanner {
  constructor(private readonly reader: TagReader) {}

  async scan(rootDir: string): Promise<{ tracks: ScannedTrack[]; unreadable: string[] }> {
    const paths: string[] = []
    await this.walk(rootDir, paths)

    const tracks: ScannedTrack[] = []
    const unreadable: string[] = []
    for (const path of paths) {
      try {
        tracks.push({ path, ...(await this.reader.read(path)) })
      } catch {
        unreadable.push(path)
      }
    }
    return { tracks, unreadable }
  }

  private async walk(dir: string, out: string[]): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === DUP_DIR) continue // não reprocessa a quarentena
        await this.walk(join(dir, entry.name), out)
      } else if (AUDIO_EXT.has(extname(entry.name).toLowerCase())) {
        out.push(join(dir, entry.name))
      }
    }
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run electron/main/libraryScanner.test.ts`
Expected: PASS.

- [ ] **Step 5: Teste de integração com arquivo real (music-metadata)**

Adicione ao mesmo arquivo de teste:
```ts
import { spawn } from 'node:child_process'
import { MusicMetadataReader } from './libraryScanner'

const genMp3 = (out: string) =>
  new Promise<void>((res, rej) => {
    const p = spawn('resources/bin/ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '1',
      '-metadata', 'title=Teste', '-metadata', 'artist=Fulano', '-metadata', 'genre=House', out])
    p.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c))))
  })

describe('MusicMetadataReader (real)', () => {
  it('lê título/artista/gênero e bitrate de um mp3 real', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mm-'))
    const f = join(dir, 'x.mp3')
    await genMp3(f)
    const t = await new MusicMetadataReader().read(f)
    expect(t.title).toBe('Teste')
    expect(t.artists).toEqual(['Fulano'])
    expect(t.genre).toBe('House')
    expect(t.bitrate).toBeGreaterThan(0)
  })
})
```

Run: `npx vitest run electron/main/libraryScanner.test.ts`
Expected: PASS (2 testes). Se o ffmpeg embarcado não existir no ambiente, o teste real falha com mensagem clara — rode `bash scripts/fetch-binaries.sh` antes.

- [ ] **Step 6: Commit**

```bash
git add electron/main/libraryScanner.ts electron/main/libraryScanner.test.ts
git commit -m "feat: LibraryScanner (varredura + leitura via music-metadata)"
```

---

## Task 7: `OrganizationExecutor`

**Files:**
- Create: `electron/main/organizationExecutor.ts`
- Test: `electron/main/organizationExecutor.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// electron/main/organizationExecutor.test.ts
import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile, access, readdir } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { OrganizationExecutor } from './organizationExecutor'
import type { OrganizationPlan } from '../../shared/library'

const exists = (p: string) => access(p).then(() => true, () => false)

// ffmpeg falso: "retag" cria o arquivo de saída
const fakeFfmpeg = { async retag(_in: string, out: string) { await writeFile(out, 'retagged') } } as any

describe('OrganizationExecutor.apply', () => {
  it('move por rename, retagueia quando preciso e quarentena duplicados', async () => {
    const root = await mkdtemp(join(tmpdir(), 'org-'))
    await writeFile(join(root, 'a.mp3'), 'aaa')
    await writeFile(join(root, 'b.mp3'), 'bbb')
    await writeFile(join(root, 'dup.mp3'), 'ddd')

    const plan: OrganizationPlan = {
      rootDir: root,
      collisions: [],
      entries: [
        { from: join(root, 'a.mp3'), to: join(root, 'House', 'A - Song.mp3'), needsRetag: false },
        { from: join(root, 'b.mp3'), to: join(root, 'Techno', 'B - Song.mp3'), needsRetag: true, tags: { genre: 'Techno' } },
        { from: join(root, 'dup.mp3'), to: join(root, '_Duplicados', 'dup.mp3'), needsRetag: false, duplicate: true }
      ]
    }

    const res = await new OrganizationExecutor(fakeFfmpeg).apply(plan, homedir())

    expect(await exists(join(root, 'House', 'A - Song.mp3'))).toBe(true)
    expect(await exists(join(root, 'a.mp3'))).toBe(false)
    expect(await exists(join(root, 'Techno', 'B - Song.mp3'))).toBe(true)
    expect(await exists(join(root, '_Duplicados', 'dup.mp3'))).toBe(true)
    expect(res).toMatchObject({ moved: 1, retagged: 1, quarantined: 1, failed: [] })
  })

  it('recusa raiz insegura', async () => {
    const plan: OrganizationPlan = { rootDir: homedir(), collisions: [], entries: [] }
    await expect(new OrganizationExecutor(fakeFfmpeg).apply(plan, homedir())).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run electron/main/organizationExecutor.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
// electron/main/organizationExecutor.ts
import { EventEmitter } from 'node:events'
import { rename, mkdir, copyFile, rm } from 'node:fs/promises'
import { dirname, resolve, sep, extname } from 'node:path'
import { isSafeToClear } from './reset'
import { downloadCover } from './cover'
import { buildRetagArgs } from '../engines/ffmpeg'
import type { FfmpegEngine } from '../engines/ffmpeg'
import type { OrganizationPlan, PlanEntry } from '../../shared/library'

/** Interface mínima do ffmpeg usada aqui (facilita o teste). */
export interface Retagger {
  retag(inPath: string, outPath: string, coverPath?: string, args?: string[]): Promise<void>
}

const COVER_OK = new Set(['.mp3', '.flac', '.m4a', '.aac'])

/** Move/renomeia e retagueia arquivos segundo um plano aprovado. */
export class OrganizationExecutor extends EventEmitter {
  constructor(private readonly ffmpeg: Retagger | FfmpegEngine) {}

  async apply(plan: OrganizationPlan, home: string): Promise<{ moved: number; retagged: number; quarantined: number; failed: { path: string; error: string }[] }> {
    const root = resolve(plan.rootDir)
    if (!isSafeToClear(root, home)) throw new Error(`Diretório inseguro para reorganizar: ${root}`)

    let moved = 0, retagged = 0, quarantined = 0
    const failed: { path: string; error: string }[] = []
    let done = 0

    for (const e of plan.entries) {
      try {
        if (resolve(e.to) !== e.to || !resolve(e.to).startsWith(root + sep)) {
          throw new Error('destino fora da raiz')
        }
        await mkdir(dirname(e.to), { recursive: true })
        if (e.needsRetag) {
          await this.retag(e)
          retagged++
        } else {
          await move(e.from, e.to)
          if (e.duplicate) quarantined++
          else moved++
        }
      } catch (err) {
        failed.push({ path: e.from, error: err instanceof Error ? err.message : String(err) })
      }
      this.emit('progress', { done: ++done, total: plan.entries.length, current: e.from })
    }
    return { moved, retagged, quarantined, failed }
  }

  private async retag(e: PlanEntry): Promise<void> {
    const wantCover = e.tags?.coverUrl && COVER_OK.has(extname(e.to).toLowerCase())
    const coverPath = wantCover ? await downloadCover(e.tags!.coverUrl) : undefined
    try {
      const args = buildRetagArgs(e.from, e.to, e.tags ?? {}, coverPath)
      await (this.ffmpeg as any).retag(e.from, e.to, coverPath, args)
      await rm(e.from, { force: true })
    } finally {
      if (coverPath) await rm(coverPath, { force: true }).catch(() => {})
    }
  }
}

/** rename com fallback copy+unlink (EXDEV entre volumes). */
async function move(from: string, to: string): Promise<void> {
  try {
    await rename(from, to)
  } catch (err: any) {
    if (err?.code !== 'EXDEV') throw err
    await copyFile(from, to)
    await rm(from, { force: true })
  }
}
```

Nota: o `FfmpegEngine` real ganhará um método `retag(inPath, outPath, coverPath?, args?)` na Task 8 (executa o binário com os `args` fornecidos). O teste usa um `Retagger` falso.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run electron/main/organizationExecutor.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add electron/main/organizationExecutor.ts electron/main/organizationExecutor.test.ts
git commit -m "feat: OrganizationExecutor (move/retag/quarentena com guardas)"
```

---

## Task 8: `FfmpegEngine.retag` + `LibraryService` (orquestra + throttle)

**Files:**
- Modify: `electron/engines/ffmpeg.ts` (método `retag`)
- Create: `electron/main/library.ts`
- Test: `electron/main/library.test.ts`

- [ ] **Step 1: Adicionar `retag` ao FfmpegEngine**

Em `electron/engines/ffmpeg.ts`, dentro da classe `FfmpegEngine` (ao lado de `convertAndTag`; os campos são `private readonly bin` e `private readonly runner`):
```ts
  /** Executa o remux/retag com os args já montados (buildRetagArgs). */
  async retag(_inPath: string, _outPath: string, _coverPath: string | undefined, args: string[]): Promise<void> {
    await this.runner.run(this.bin, args)
  }
```

- [ ] **Step 2: Escrever o teste que falha (mergeMissing + enrichInputs)**

```ts
// electron/main/library.test.ts
import { describe, it, expect } from 'vitest'
import { mergeMissing, LibraryService } from './library'
import type { ScannedTrack } from '../../shared/library'

const st = (over: Partial<ScannedTrack>): ScannedTrack => ({
  path: '/a.mp3', title: 'Song', artists: ['A'], hasCover: false, format: 'MP3', lossless: false, bitrate: 320, fileSize: 1, ...over
})

describe('mergeMissing', () => {
  it('preenche só os campos faltando, preservando os existentes', () => {
    const track = st({ genre: 'House', year: undefined, hasCover: false })
    const filled = mergeMissing(track, { genre: 'Techno', year: '2020', coverUrl: 'u' })
    expect(filled).toEqual({ year: '2020', coverUrl: 'u' }) // genre já existia → ignora; year e cover entram
  })
})

describe('LibraryService.enrichInputs', () => {
  it('só chama o enricher para faixas com buracos e mescla o que faltava', async () => {
    let calls = 0
    const enricher = { enrich: async () => { calls++; return { genre: 'House', year: '2020' } } } as any
    const svc = new LibraryService({} as any, {} as any, enricher, {} as any)
    const inputs = await svc.enrichInputs([
      st({ path: '/full.mp3', genre: 'Pop', year: '1999', label: 'L', trackNumber: 1, hasCover: true }), // sem buracos
      st({ path: '/gap.mp3', genre: undefined, hasCover: true, year: undefined, label: 'L', trackNumber: 1 })
    ])
    expect(calls).toBe(1) // só /gap.mp3
    const gap = inputs.find((i) => i.track.path === '/gap.mp3')!
    expect(gap.filled).toEqual({ genre: 'House', year: '2020' })
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run electron/main/library.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 4: Implementar**

```ts
// electron/main/library.ts
import PQueue from 'p-queue'
import { REKORDBOX_FIELDS, type ScannedTrack, type PlannedInput, type AnalysisReport, type OrganizationPlan } from '../../shared/library'
import { analyzeLibrary } from '../../shared/libraryAnalysis'
import { buildPlan } from '../../shared/organizationPlan'
import type { LibraryScanner } from './libraryScanner'
import type { OrganizationExecutor } from './organizationExecutor'
import type { MetadataEnricher } from './metadataEnricher'
import type { TrackMeta } from '../../shared/types'

/** Retorna só as tags que estavam faltando na faixa (não sobrescreve o que existe). */
export function mergeMissing(track: ScannedTrack, tags: Partial<TrackMeta>): Partial<TrackMeta> {
  const out: Partial<TrackMeta> = {}
  if (!track.genre && tags.genre) out.genre = tags.genre
  if (!track.year && tags.year) out.year = tags.year
  if (!track.label && tags.label) out.label = tags.label
  if (track.trackNumber == null && tags.trackNumber != null) out.trackNumber = tags.trackNumber
  if (track.discNumber == null && tags.discNumber != null) out.discNumber = tags.discNumber
  if (!track.hasCover && tags.coverUrl) out.coverUrl = tags.coverUrl
  return out
}

/** True se a faixa tem algum campo relevante do Rekordbox faltando. */
function hasGaps(t: ScannedTrack): boolean {
  return REKORDBOX_FIELDS.some((f) =>
    (f === 'genre' && !t.genre) || (f === 'year' && !t.year) || (f === 'label' && !t.label) ||
    (f === 'track' && t.trackNumber == null) || (f === 'cover' && !t.hasCover)
  )
}

/** Orquestra scan → analyze → enrich → plan → apply. */
export class LibraryService {
  constructor(
    private readonly scanner: LibraryScanner,
    private readonly _executor: OrganizationExecutor,
    private readonly enricher: MetadataEnricher,
    private readonly deps: { home: string }
  ) {}

  /** Exposto para o IPC encaminhar os eventos de progresso ao renderer. */
  get executor(): OrganizationExecutor {
    return this._executor
  }

  private lastTracks: ScannedTrack[] = []

  async scanAndAnalyze(dir: string): Promise<{ report: AnalysisReport; unreadable: string[] }> {
    const { tracks, unreadable } = await this.scanner.scan(dir)
    this.lastTracks = tracks
    return { report: analyzeLibrary(tracks), unreadable }
  }

  /** Enriquece (Deezer) as faixas com buracos, com concorrência limitada. */
  async enrichInputs(tracks: ScannedTrack[]): Promise<PlannedInput[]> {
    const q = new PQueue({ concurrency: 4 })
    const inputs: PlannedInput[] = tracks.map((track) => ({ track, filled: {} }))
    await Promise.all(
      inputs.map((input) =>
        hasGaps(input.track)
          ? q.add(async () => {
              const meta = { id: input.track.path, title: input.track.title ?? '', artists: input.track.artists, isrc: input.track.isrc, sourceId: 'youtube', sourceUrl: '' } as TrackMeta
              const tags = await this.enricher.enrich(meta)
              input.filled = mergeMissing(input.track, tags)
            })
          : Promise.resolve()
      )
    )
    return inputs
  }

  async plan(dir: string, template: string): Promise<OrganizationPlan> {
    const inputs = await this.enrichInputs(this.lastTracks)
    const duplicates = analyzeLibrary(this.lastTracks).duplicates.flatMap((g) => g.others)
    return buildPlan({ rootDir: dir, template, inputs, duplicates })
  }

  apply(plan: OrganizationPlan): Promise<{ moved: number; retagged: number; quarantined: number; failed: { path: string; error: string }[] }> {
    return this.executor.apply(plan, this.deps.home)
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run electron/main/library.test.ts electron/engines/ffmpeg.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/engines/ffmpeg.ts electron/main/library.ts electron/main/library.test.ts
git commit -m "feat: LibraryService (orquestra + throttle) e FfmpegEngine.retag"
```

---

## Task 9: IPC + preload

**Files:**
- Modify: `electron/main/ipc.ts`
- Modify: `electron/preload/index.ts`
- Modify: `electron/main/index.ts`

- [ ] **Step 1: Instanciar o LibraryService no composition root**

Em `electron/main/index.ts`, após criar `enricher` e `ffmpeg`, adicione:
```ts
import { LibraryScanner, MusicMetadataReader } from './libraryScanner'
import { OrganizationExecutor } from './organizationExecutor'
import { LibraryService } from './library'
import { homedir } from 'node:os'
```
e na função `buildCore`:
```ts
  const library = new LibraryService(
    new LibraryScanner(new MusicMetadataReader()),
    new OrganizationExecutor(ffmpeg),
    enricher,
    { home: homedir() }
  )
```
Inclua `library` no objeto retornado por `buildCore` e no `deps` passado ao `registerIpc`.

- [ ] **Step 2: Adicionar canais no main/ipc.ts**

No objeto `CH`, adicione:
```ts
  libraryScanAnalyze: 'library:scanAnalyze',
  libraryPlan: 'library:plan',
  libraryApply: 'library:apply',
  libraryProgress: 'library:progress',
```
No `deps` de `registerIpc` adicione `library: LibraryService` (importe o tipo). Registre os handlers:
```ts
  ipcMain.handle(CH.libraryScanAnalyze, (_e, dir: string) => library.scanAndAnalyze(dir))
  ipcMain.handle(CH.libraryPlan, (_e, dir: string, template: string) => library.plan(dir, template))
  ipcMain.handle(CH.libraryApply, (_e, plan) => library.apply(plan))
  library.executor.on('progress', (p: unknown) => {
    if (!win.isDestroyed()) win.webContents.send(CH.libraryProgress, p)
  })
```
(usa o getter `library.executor` adicionado na Task 8.)

- [ ] **Step 3: Espelhar no preload**

Em `electron/preload/index.ts`, importe os tipos e adicione ao `CH` os mesmos 4 canais. Os retornos DEVEM ser explicitamente tipados (o tipo `DownMusicApi` exportado pelo preload é a fonte de verdade do renderer):
```ts
import type { AnalysisReport, OrganizationPlan } from '../../shared/library'
type ApplyResult = { moved: number; retagged: number; quarantined: number; failed: { path: string; error: string }[] }
```
No `api`:
```ts
  libraryScanAnalyze: (dir: string): Promise<{ report: AnalysisReport; unreadable: string[] }> =>
    ipcRenderer.invoke(CH.libraryScanAnalyze, dir),
  libraryPlan: (dir: string, template: string): Promise<OrganizationPlan> =>
    ipcRenderer.invoke(CH.libraryPlan, dir, template),
  libraryApply: (plan: OrganizationPlan): Promise<ApplyResult> => ipcRenderer.invoke(CH.libraryApply, plan),
  onLibraryProgress: (cb: (p: { done: number; total: number; current: string }) => void): (() => void) => {
    const listener = (_e: unknown, p: { done: number; total: number; current: string }) => cb(p)
    ipcRenderer.on(CH.libraryProgress, listener)
    return () => ipcRenderer.removeListener(CH.libraryProgress, listener)
  },
```
Confirme que o preload exporta `export type DownMusicApi = typeof api` (já é o padrão do arquivo) — assim o renderer recebe os tipos automaticamente.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add electron/main/ipc.ts electron/preload/index.ts electron/main/index.ts
git commit -m "feat: canais IPC library:* (scan/analyze/plan/apply/progress)"
```

---

## Task 10: UI — aba "Organizar"

**Files:**
- Create: `src/components/OrganizeView.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
// src/components/OrganizeView.tsx
import { useEffect, useState } from 'react'
import { api } from '../ipc'
import type { AnalysisReport, OrganizationPlan } from '@shared/library'

const DEFAULT_TPL = '%genre%/%artist% - %title%'

export function OrganizeView() {
  const [dir, setDir] = useState('')
  const [report, setReport] = useState<AnalysisReport | null>(null)
  const [unreadable, setUnreadable] = useState<string[]>([])
  const [template, setTemplate] = useState(DEFAULT_TPL)
  const [plan, setPlan] = useState<OrganizationPlan | null>(null)
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<string>('')

  useEffect(() => api.onLibraryProgress((p) => setProgress(p)), [])

  async function pick() {
    const d = await api.pickFolder()
    if (d) { setDir(d); setReport(null); setPlan(null); setResult('') }
  }
  async function analyze() {
    setBusy('Analisando...'); setPlan(null); setResult('')
    const { report, unreadable } = await api.libraryScanAnalyze(dir)
    setReport(report); setUnreadable(unreadable); setBusy('')
  }
  async function makePlan() {
    setBusy('Enriquecendo e planejando...')
    setPlan(await api.libraryPlan(dir, template)); setBusy('')
  }
  async function apply() {
    if (!plan) return
    if (!confirm(`Aplicar reorganização em ${plan.entries.length} arquivo(s)? Duplicados vão para _Duplicados/.`)) return
    setBusy('Aplicando...'); setProgress({ done: 0, total: plan.entries.length })
    const r = await api.libraryApply(plan)
    setResult(`Movidos: ${r.moved} · Retagueados: ${r.retagged} · Duplicados: ${r.quarantined} · Falhas: ${r.failed.length}`)
    setBusy(''); setProgress(null); setPlan(null); setReport(null)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-neutral-800 p-4">
        <button onClick={pick} className="rounded bg-neutral-700 px-3 py-1 text-xs hover:bg-neutral-600">Escolher pasta</button>
        <span className="flex-1 truncate text-xs text-neutral-400">{dir || 'Nenhuma pasta selecionada'}</span>
        <button onClick={analyze} disabled={!dir || !!busy} className="rounded bg-emerald-600 px-3 py-1 text-xs hover:bg-emerald-500 disabled:opacity-40">Analisar</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {busy && <p className="text-sm text-emerald-400">{busy}</p>}

        {report && (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Card label="Faixas" value={report.total} />
            <Card label="Gêneros" value={report.genres.length} />
            <Card label="Sem gênero" value={report.missingGenre} />
            <Card label="Sem capa" value={report.missingCover} />
            <Card label="Baixa qualidade" value={report.lowQuality} />
            <Card label="Duplicados" value={report.duplicates.length} />
            <Card label="Não identificados" value={report.unidentified} />
            <Card label="Ilegíveis" value={unreadable.length} />
          </div>
        )}

        {report && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-400">Template:</label>
            <input value={template} onChange={(e) => setTemplate(e.target.value)}
              className="flex-1 rounded bg-neutral-800 px-2 py-1 text-xs" />
            <button onClick={makePlan} disabled={!!busy} className="rounded bg-emerald-600 px-3 py-1 text-xs hover:bg-emerald-500 disabled:opacity-40">Gerar plano</button>
          </div>
        )}

        {plan && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-neutral-400">{plan.entries.length} mudança(s){plan.collisions.length ? ` · ${plan.collisions.length} colisão(ões) ignorada(s)` : ''}</span>
              <button onClick={apply} disabled={!!busy} className="rounded bg-emerald-600 px-3 py-1 text-xs hover:bg-emerald-500 disabled:opacity-40">Aplicar</button>
            </div>
            <ul className="space-y-1 text-xs">
              {plan.entries.slice(0, 200).map((e, i) => (
                <li key={i} className="rounded bg-neutral-800 p-2">
                  <div className="truncate text-neutral-400">{e.from}</div>
                  <div className="truncate text-emerald-300">→ {e.to} {e.needsRetag ? '· (tags)' : ''} {e.duplicate ? '· (duplicado)' : ''}</div>
                </li>
              ))}
              {plan.entries.length > 200 && <li className="text-neutral-500">…e mais {plan.entries.length - 200}</li>}
            </ul>
          </div>
        )}

        {progress && <p className="text-sm text-emerald-400">Aplicando {progress.done}/{progress.total}…</p>}
        {result && <p className="text-sm text-emerald-300">{result}</p>}
      </div>
    </div>
  )
}

function Card({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-neutral-800 p-3">
      <div className="text-lg font-semibold text-neutral-100">{value}</div>
      <div className="text-neutral-500">{label}</div>
    </div>
  )
}
```

- [ ] **Step 2: Adicionar a aba no App.tsx**

Em `src/App.tsx`:
- adicione `import { OrganizeView } from './components/OrganizeView'`
- amplie o tipo `Tab`: `type Tab = 'download' | 'search' | 'playlists' | 'history' | 'organize' | 'settings'`
- adicione o botão (após Historico): `<TabButton active={tab === 'organize'} onClick={() => setTab('organize')}>Organizar</TabButton>`
- adicione a renderização: `{tab === 'organize' && <OrganizeView />}`

- [ ] **Step 3: Confirmar o tipo da api no renderer**

Nada a editar em `src/ipc.ts`: ele deriva o tipo de `DownMusicApi = typeof api` exportado pelo preload. Como os métodos `library*` foram adicionados ao `api` com retornos tipados na Task 9, o renderer já os enxerga (`api.libraryScanAnalyze`, etc.). Basta o `OrganizeView.tsx` importar os tipos de `@shared/library` para as anotações locais.

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: sem erros.

- [ ] **Step 5: Validar a UI ao vivo (xvfb + Playwright)**

Rode o app headless e confirme que a aba "Organizar" abre, escolhe pasta, analisa e mostra os cartões. Padrão do projeto:
```bash
xvfb-run -a npm run dev -- --no-sandbox
```
Dirija com o driver `_electron` (padrão do skill `run`, exemplos/electron.md): abrir a aba Organizar, clicar Escolher pasta (aponte para uma cópia de teste), Analisar, conferir o resumo, Gerar plano, ver a prévia. Tire um screenshot e confira visualmente.

- [ ] **Step 6: Commit**

```bash
git add src/components/OrganizeView.tsx src/App.tsx
git commit -m "feat: aba Organizar (análise + prévia + aplicar)"
```

---

## Task 11: Validação real end-to-end + AppImage

**Files:** none (validação).

- [ ] **Step 1: Preparar uma cópia de teste**

```bash
rm -rf /tmp/rekordbox-test && mkdir -p /tmp/rekordbox-test
cp -r ~/Música/Downloads/* /tmp/rekordbox-test/ 2>/dev/null || true
find /tmp/rekordbox-test -type f | head
```

- [ ] **Step 2: Rodar o pipeline real via script tsx**

Escreva um script no scratchpad que instancie `LibraryScanner(new MusicMetadataReader())`, `MetadataEnricher`, `OrganizationExecutor(new FfmpegEngine(resources/bin/ffmpeg))` e `LibraryService`, rode `scanAndAnalyze('/tmp/rekordbox-test')`, imprima o relatório, rode `plan(...)`, imprima a prévia, rode `apply(plan)`. Depois confira a estrutura e as tags:
```bash
find /tmp/rekordbox-test -type f
ffprobe -v error -show_entries format_tags -of default=noprint_wrappers=1 "$(find /tmp/rekordbox-test -name '*.mp3' | head -1)"
```
Expected: arquivos reorganizados em `Gênero/Artista - Título.mp3`, tags preenchidas, duplicados em `_Duplicados/`.

- [ ] **Step 3: Suíte completa + typecheck**

Run: `npm run typecheck && npx vitest run`
Expected: tudo verde.

- [ ] **Step 4: Reconstruir e reinstalar o AppImage**

```bash
npm run dist && cp -f dist/DownMusic-0.1.0.AppImage ~/Applications/DownMusic.AppImage
```
Expected: AppImage gerado e reinstalado no local do ícone.

- [ ] **Step 5: Commit final (se houver ajustes)**

```bash
git add -A && git commit -m "chore: validação end-to-end da organização de diretório" || true
```

---

## Notas de execução

- **Kanbania:** não há seção `Board Task Mapping` neste plano — sincronização de board não se aplica.
- **PT-BR:** toda saída (UI, comentários, commits) em PT-BR com acentuação.
- **Ordem:** Task 0 é gate — só prosseguir se o `music-metadata` empacotar. Tasks 1→3 (puro) podem ir antes das de I/O; 4 e 5 são pré-requisito de 7; 8 depende de 5–7; 9 depende de 6–8; 10 depende de 9; 11 fecha.
