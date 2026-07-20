# Análise e organização de diretório para o Rekordbox

## Objetivo

Permitir que o usuário informe um diretório existente e o DownMusic:

1. **Varra** recursivamente os arquivos de áudio e **leia as tags** e a qualidade de cada um.
2. **Analise** o acervo, destacando problemas (tags faltando, duplicados, baixa qualidade, nomes/tags inconsistentes).
3. **Enriqueça** as tags faltando via Deezer (preenchendo só os buracos).
4. **Sugira e aplique** uma reorganização por template (`%genre%/%artist% - %title%` por padrão), com prévia e aprovação, para melhor leitura no Rekordbox.

Nada é alterado no disco sem aprovação explícita do usuário.

## Decisões de produto (validadas)

- **Fluxo**: analisar → revisar → gerar plano → revisar prévia → aplicar (read-only até "Aplicar").
- **Enriquecimento**: sim, via Deezer (reusa `MetadataEnricher`); preenche apenas campos faltando, preserva o que já existe.
- **Estrutura**: configurável por template; padrão `%genre%/%artist% - %title%`.
- **Detecções**: (a) tags faltando, (b) duplicados, (c) qualidade do áudio, (d) nomes/tags inconsistentes.
- **Leitura de tags**: biblioteca `music-metadata` (JS pura, sem binário novo).
- **Organização**: in-place (subpastas de gênero criadas na própria pasta escolhida).
- **Duplicados**: movidos para quarentena `_Duplicados/` (reversível), nunca apagados; mantém-se o de maior qualidade.
- **Retag**: ffmpeg com `-c copy` (remux sem reencode = sem perda de qualidade).

## Arquitetura

Nova aba **"Organizar"** no renderer. Backend em componentes isolados:

### `LibraryScanner` (electron/main/libraryScanner.ts)

Varre a pasta recursivamente, seleciona extensões de áudio (`mp3, flac, m4a, aac, wav, ogg, opus`) e lê cada arquivo com `music-metadata`. Produz `ScannedTrack[]`.

```ts
interface ScannedTrack {
  path: string            // caminho absoluto atual
  // tags existentes (undefined quando ausente)
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
  // qualidade
  format: string          // 'MP3' | 'FLAC' | 'AAC' | ...
  bitrate?: number        // kbps (undefined p/ lossless sem bitrate reportado)
  lossless: boolean
  durationSec?: number
  fileSize: number        // bytes
}
```

Injeta um leitor (`TagReader`) para permitir teste sem I/O real:
`interface TagReader { read(path: string): Promise<Omit<ScannedTrack,'path'>> }`. Implementação padrão sobre `music-metadata`.

### `LibraryAnalyzer` (shared/libraryAnalysis.ts — lógica pura, TDD)

Recebe `ScannedTrack[]` e devolve `AnalysisReport`:

```ts
interface TrackIssue {
  path: string
  missing: string[]          // ['genre','year','cover',...] — campos que o Rekordbox usa
  lowQuality?: boolean       // bitrate < LOW_KBPS (256) e não-lossless
  inconsistent?: boolean     // nome do arquivo não bate com tags, ou faixa não identificável
}
interface DuplicateGroup {
  key: string                // isrc: | nameKey
  keeper: string             // path da melhor (maior bitrate/lossless)
  others: string[]           // paths a quarentenar
}
interface AnalysisReport {
  total: number
  genres: { genre: string; count: number }[]   // reusa groupByGenre por gênero normalizado
  missingGenre: number
  missingCover: number
  lowQuality: number
  duplicates: DuplicateGroup[]
  issues: TrackIssue[]
}
```

- **Duplicados**: agrupa por `isrc:<isrc>` quando houver; senão por `nameKey` (artista+título normalizado, reusando `shared/history.ts`). `keeper` = maior qualidade (lossless > bitrate maior; empate → menor caminho).
- **Inconsistente**: sem título/artista identificável, ou o basename do arquivo não contém o título das tags (heurística simples e conservadora).
- Constantes: `LOW_KBPS = 256`. Campos considerados p/ Rekordbox: `genre, year, label, trackNumber, cover`.

### Enriquecimento (reusa `MetadataEnricher`)

Para cada `ScannedTrack` com `missing` não vazio, roda `enricher.enrich(meta)` (Deezer via ISRC ou artista+título) e faz merge preenchendo **apenas** os campos faltando. Best-effort: falha/sem match não altera o arquivo. Cache por álbum já existe no enricher. Roda entre a análise e a geração do plano.

### `OrganizationPlanner` (shared/organizationPlan.ts — lógica pura, TDD)

Entradas: tracks (scan + tags enriquecidas), `template`, `rootDir`, `duplicates`. Reusa `renderTemplate` (já existe em `tagger.ts`). Saída:

```ts
interface PlanEntry {
  from: string
  to: string                 // rootDir/<template>.<ext> (ext preservada)
  needsRetag: boolean        // true se enriqueceu alguma tag/capa
  tags?: Partial<TrackMeta>  // tags a gravar quando needsRetag
  duplicate?: boolean        // true → destino em rootDir/_Duplicados/
}
interface OrganizationPlan {
  entries: PlanEntry[]
  collisions: string[]       // destinos que colidiriam (marcados, não movidos)
}
```

- Sem gênero → o `renderTemplate` já descarta o segmento vazio, então o arquivo cai na raiz `rootDir/` (sem pasta de gênero). Mantém exatamente o comportamento do download: pasta de gênero só quando conhecido.
- Colisão: dois arquivos mapeando para o mesmo destino → mantém o primeiro, marca os demais em `collisions` (não move).
- Duplicados (`others`) → `to = rootDir/_Duplicados/<basename>`.

### `OrganizationExecutor` (electron/main/organizationExecutor.ts)

Aplica um `OrganizationPlan` aprovado, emitindo eventos de progresso (`{done, total, current}`), no mesmo padrão de eventos da fila.

- `needsRetag=false` → `fs.rename` (ou copy+unlink entre volumes) direto para `to`.
- `needsRetag=true` → ffmpeg `-i <from> -map 0 -c copy -map_metadata 0` + `-metadata` novas + (capa via segundo input, como o `Tagger` já faz) → grava em `to`, apaga o original. Sem reencode.
- Cria diretórios necessários. Erro por-arquivo → registra em `failed[]` e segue.
- Retorna `{ moved, retagged, quarantined, failed }`.

### Segurança

- Toda operação restrita a `rootDir`.
- Reusa `isSafeToClear(rootDir)` (bloqueia `/`, home, `/usr`, caminhos com < 2 níveis).
- Duplicados vão para `_Duplicados/` (nunca delete).
- `confirm()` nativo no renderer antes de disparar "Aplicar".

## IPC / UI

Canais novos (preload + ipc):

- `library:scan(dir) → ScannedTrack[]`
- `library:analyze(tracks) → AnalysisReport` (ou combinado: `library:scanAndAnalyze(dir)`)
- `library:plan({dir, template, enrich}) → OrganizationPlan` (roda enriquecimento + planner)
- `library:apply(plan) → {moved,retagged,quarantined,failed}` (eventos `library:progress`)
- Reusa `dialog:pickFolder` e `shell:openFolder`.

**Aba "Organizar"** (renderer): seletor de pasta + botão Analisar → cartões de resumo (total, gêneros, sem gênero, sem capa, baixa qualidade, duplicados) + listas expansíveis por problema → campo de template (default das Configurações) → "Gerar plano" → tabela de prévia (de → para, tags a preencher, duplicado) com destaque de colisões → "Aplicar" (após `confirm`) com barra de progresso → resumo final.

## Tratamento de erros

- Arquivo ilegível/corrompido → `TagReader` lança; scanner captura, marca como não identificado, pula dos moves.
- Deezer indisponível/sem match → tag continua vazia; arquivo organizado sem aquela tag (ex.: `Sem gênero/`).
- Colisão de destino → sinalizada na prévia; executor pula e reporta.
- Falha de move/retag → registrada em `failed[]`, não interrompe o lote.

## Testes

- **Puro (TDD)**: `LibraryAnalyzer` (missing/lowQuality/inconsistent), detecção de duplicados (ISRC e nameKey, escolha do keeper), `OrganizationPlanner` (destinos, sem gênero, colisões, duplicados → `_Duplicados/`), extensões do `renderTemplate`.
- **Integração**: `LibraryScanner` lendo 1–2 fixtures reais (mp3/flac pequenos) via `music-metadata`; `OrganizationExecutor` em pasta temporária com ffmpeg falso (padrão do `tagger.test`) conferindo rename vs retag vs quarentena e criação de pastas.
- **Validação real**: apontar para uma cópia de `~/Música/Downloads`, analisar, revisar prévia, aplicar e conferir tags/estrutura com `ffprobe` do sistema.

## Fora de escopo (YAGNI)

- Análise de BPM/key (o Rekordbox faz isso na importação).
- Edição manual de tags campo a campo na UI (só enriquecimento automático).
- Watch/monitoramento contínuo de pasta.
- Undo automático (a quarentena `_Duplicados/` já dá reversibilidade ao caso destrutivo).

## Dependência nova

- `music-metadata` (leitura de tags/qualidade). Fixar versão que empacota bem no bundle SSR do electron-vite.
```
