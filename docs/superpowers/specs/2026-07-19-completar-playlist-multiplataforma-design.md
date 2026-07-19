# Completar playlist do Spotify por outra plataforma (Deezer + YouTube) — Design + Plano

- **Data:** 2026-07-19
- **Problema:** o Spotify limita a leitura de muitas playlists a 100 faixas (API devolve `tracks:null`/403; embed expõe só 100). Playlists maiores ficam truncadas no app.
- **Objetivo:** com **autorização do usuário**, procurar a **playlist equivalente** no Deezer e no YouTube, mostrar o que foi encontrado e quais músicas entrariam, e **só importar após aprovação**. Faixas recuperadas são marcadas "via <plataforma>".

## Fluxo (2 passos de consentimento)
1. Ao expandir uma playlist do Spotify que veio com **100 faixas**, mostra as 100 + **aviso** de limite.
2. Botão **"Procurar em outras plataformas"** (autoriza a busca).
3. App busca playlist equivalente por nome no **Deezer** e no **YouTube**; para cada candidata mede a **sobreposição** com as 100 (trava **≥ 60%**).
4. Mostra candidatas (plataforma · nome · % · +N) e permite ver **as músicas que entrariam**.
5. **"Importar"** na candidata escolhida → mescla (base + extras) e marca extras "via X". Nada entra na fila/histórico sem aprovar.

## Não-metas
- Sync (baixar) continua só com o Spotify. SoundCloud fica de fora (sem busca de playlist comprovada), arquitetura extensível.

## Fronteiras
- **Puro/testável** `shared/playlistMerge.ts`:
  - `overlapFraction(base, candidate)` — fração das faixas de `base` presentes em `candidate` (por ISRC/nome).
  - `newTracksFrom(base, candidate)` — faixas de `candidate` que não estão em `base`.
  - `mergeCompleting(base, candidate)` = `base` + `newTracksFrom`.
- Busca de playlist por fonte:
  - `DeezerClient.searchPlaylists(name)` → `[{ url, title, trackCount }]` (`search/playlist`).
  - `YtDlpEngine.searchPlaylists(name)` (search-URL do YouTube filtrando playlists) → `[{ url, title }]`; `dumpFlat(url)` para resolver candidatas rápido (flat).
- `PlaylistCompleter.findCompletions(url)` → `PlaylistCompletion[]` (candidatas com overlap≥60% e addedCount>0, ordenadas por overlap). Reusa `resolver`/Deezer/yt-dlp.
- `PlaylistCompletion` (shared/types): `{ platform, url, name, trackCount, overlapPct, addedCount, extras }`.
- IPC `playlist:findCompletions` + preload `findCompletions`.
- UI (`PlaylistsView`/`PlaylistTracks`): aviso + botão Procurar + candidatas + "ver músicas" + Importar (merge client-side com as `extras`); selo "via X" quando `track.sourceId ≠ plataforma da playlist`.

## Nota de qualidade
- Candidatas do **Deezer** casam bem com o Spotify (artista+título+ISRC). Do **YouTube**, o `nameKey` (uploader+título) costuma casar pior, então raramente passam da trava de 60% — comportamento honesto; a trava evita importar lista errada.

## Plano (fases)
1. `shared/playlistMerge.ts` + testes (overlap/new/merge).
2. `DeezerClient.searchPlaylists` + `YtDlpEngine.searchPlaylists`/`dumpFlat` (+ builders puros) + testes.
3. `PlaylistCompleter` + composição + IPC + preload.
4. UI: aviso + Procurar + candidatas + Importar + selo "via X".
5. Verificação (typecheck/tests/build) + validação ao vivo com a playlist real do Spotify (100 → Deezer → importar → completa).
