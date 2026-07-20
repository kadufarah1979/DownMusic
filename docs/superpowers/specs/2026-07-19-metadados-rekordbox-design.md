# Enriquecimento de metadados p/ Rekordbox (gênero automático + tags ID3 ricas) — Design + Plano

- **Data:** 2026-07-19
- **Objetivo:** ao baixar, enriquecer automaticamente cada faixa com metadados do Deezer, gravar **tags ID3 ricas** (que o Rekordbox lê na importação) e organizar os arquivos em **pastas por gênero**. O gênero tambem alimenta o **Histórico agrupado por gênero**.

## Pesquisa (base das decisões)
- Rekordbox lê tags ID3 na importação e organiza por elas; **analisa BPM e tonalidade sozinho** (não fornecemos).
- Melhor pratica: taguear ANTES de importar. Campos uteis: Titulo, Artista, Album, **Genero**, **Ano**, **Gravadora (label)**, **nº faixa/disco**, **album_artist**, **capa**.
- Spotify `audio-features` (BPM/key) foi **descontinuado (nov/2024)** → 403. Deezer tem `bpm` mas quase sempre 0. → **não escrevemos BPM/key**; o Rekordbox calcula.

## Dados (Deezer, sem login) — confirmados
- Faixa (`/track/{id}` ou `/track/isrc:{isrc}`): `track_position`, `disk_number`, `bpm`, `release_date`, `isrc`, `album.id`.
- Album (`/album/{id}`): `genres[0]`, `label`, `release_date`, `cover_xl` (capa em alta).

## Modelo
- `TrackMeta` ganha opcionais: `genre?`, `year?`, `label?`, `trackNumber?`, `discNumber?`. (`coverUrl` sera atualizada para a alta resolucao.)
- `HistoryEntry` ganha `genre?`; `entryFromTrack` copia de `track.genre`.

## Enriquecimento (no download, automatico)
- `MetadataEnricher.enrich(track): Promise<Partial<TrackMeta>>`:
  1. acha a faixa no Deezer: **prefere ISRC** (`/track/isrc:{isrc}`); senao `/search?q=artista titulo`.
  2. le `track_position`, `disk_number`, `release_date` (ano) e `album.id`.
  3. `GET /album/{id}` → `genres[0]` (gênero), `label`, `cover_xl`.
  4. retorna `{ genre, year, label, trackNumber, discNumber, coverUrl: cover_xl }`. **Cache por album.id** (muitas faixas do mesmo album = 1 fetch de album).
  - Falha/sem match → retorna `{}` (download segue sem enriquecer; **nunca quebra**).
  - **Genero unico**: pega o primeiro. **BPM**: nao escrito (Deezer 0 e Rekordbox calcula).

## Tags gravadas (ffmpeg → ID3)
`buildConvertArgs` passa a escrever, quando disponiveis: `title`, `artist`, `album`, `album_artist` (artista principal), `genre` (TCON), `date`=ano (TDRC), `track` (TRCK), `disc` (TPOS), `publisher`=label (TPUB) + **capa embutida** (arquivo local, alta resolucao). Sem BPM, sem ISRC-no-comentario (deixa o campo Comment livre p/ o DJ).

## Pasta por gênero
- `Tagger.finalize`: se `meta.genre`, prefixa a pasta do gênero (sanitizada) na frente do resultado do template: `outputDir/Genero/<template>.ext`. Sem gênero → `outputDir/<template>.ext` (sem pasta vazia). Nao altera o template do usuario.

## Histórico agrupado por gênero
- `groupByGenre(entries)` (puro): agrupa por `genre` (sem gênero → "Sem gênero"), ordenado.
- `HistoryView`: toggle "Agrupar por gênero" → secoes por gênero (com contagem); desligado = lista por data (atual).

## Pipeline
- `QueueManager` recebe `enrich?` (funcao). Em `run()`, **1x por item** (guardado num set `enriched`), antes do `finalize`: `item.meta = { ...item.meta, ...await enrich(item.meta) }` (try/catch — ignora erro). Assim gênero/tags fluem para o arquivo e para o historico.
- Composition root: `MetadataEnricher(deezerClient)` → passa `enrich` ao QueueManager.

## Ultrathink — decisoes/riscos ja embutidos
- **BPM/tonalidade:** nao escrevemos (Rekordbox calcula; Spotify morto; Deezer 0). Evita conflito com a analise do Rekordbox.
- **Comment livre:** nao poluir com ISRC (DJs usam Comment para cues).
- **Genero unico** (primeiro) — folder + tag limpos.
- **Enriquecer 1x por item** (nao a cada retry) via set.
- **Falha de rede nunca quebra o download** (try/catch → segue sem tags extras).
- **Latencia:** ~1-2 chamadas por album novo (cacheado); 1a faixa de cada album paga.
- **Retroativo:** so downloads novos; antigos nao sao retagueados/movidos.
- **Capa cover_xl** (~1000px) — boa para Rekordbox.

## Plano (fases, TDD nas partes puras)
1. **shared:** campos em TrackMeta/HistoryEntry (+entryFromTrack); `shared/genreGroups.ts` `groupByGenre` + testes.
2. **Enriquecedor:** DeezerClient (`trackByIsrc`/reuso de search + album) → `MetadataEnricher` com cache por album + testes (HttpClient falso; conta chamadas p/ provar cache).
3. **ffmpeg/Tagger:** `buildConvertArgs` com os novos metadados + `Tagger` prefixa pasta do gênero + testes.
4. **Pipeline+UI:** hook `enrich` no QueueManager (1x/item) + composicao; `HistoryView` toggle agrupar por gênero.
5. **Verificacao:** typecheck/tests/build; **validacao ao vivo** (download → `ffprobe` confere genre/date/track/label + pasta por gênero + historico agrupado); reempacotar/reinstalar AppImage.

## Testes
- Unit: `groupByGenre`; mapeadores de tags do Deezer; `MetadataEnricher` (cache); `buildConvertArgs` (novos campos); pasta por gênero no Tagger.
- UI/integração: validacao ao vivo (ffprobe + screenshots).
