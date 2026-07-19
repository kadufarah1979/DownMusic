# Playlists cadastradas (sincronizáveis) + origem no histórico — Design + Plano

- **Data:** 2026-07-19
- **Objetivo:** cadastrar playlists e sincronizá-las manualmente, baixando só as faixas **novas** (que ainda não estão no histórico). Registrar no histórico **de qual playlist** a faixa veio (a plataforma já é registrada). Card da playlist mostra a **contagem de faixas**.

## Decisões (já acordadas)
- Sincronização **manual** (botão por playlist + "sincronizar todas").
- "Novo" = faixas da playlist **fora do histórico** (reusa `buildDownloadedIndex`/`isDownloaded`).

## 1. Origem na faixa (`TrackMeta.playlist`)
- `TrackMeta` ganha `playlist?: string`. Ao **resolver uma playlist**, cada faixa é carimbada com o nome da playlist:
  - Deezer: `title` de `/playlist/{id}`.
  - Spotify: `name` de `/v1/playlists/{id}` (playlist editorial: título do embed).
  - YouTube/SoundCloud: campo `playlist` das entradas do `yt-dlp`.
- **Busca não carimba** playlist (só o resolve de playlist).
- `HistoryEntry` ganha `playlist?`; `entryFromTrack` copia de `track.playlist`.

## 2. Assinaturas (`PlaylistStore`)
- Arquivo `playlists.json`. `PlaylistSubscription = { url, name, sourceId, addedAt, lastSyncedAt?, trackCount }`.
- `list`, `add`, `remove`, `update`.

## 3. Serviço de sincronização (`PlaylistService`, main)
- `add(url)`: resolve → deriva `name` (carimbo `playlist` da 1ª faixa) e `sourceId` (da 1ª faixa) → `trackCount` = total → salva.
- `sync(url)`: resolve → `pickNewTracks(tracks, índiceHistórico)` → enfileira as novas → atualiza `lastSyncedAt` e `trackCount` → retorna `{ added, total }`.
- `syncAll()`: soma de todos.
- **Puro/testável:** `pickNewTracks(tracks, index)` em `shared/playlist.ts`.

## 4. IPC / preload
- `playlist:list|add|remove|sync|syncAll`; preload `getPlaylists/addPlaylist/removePlaylist/syncPlaylist/syncAllPlaylists`.

## 5. UI
- Nova aba **"Playlists"**: campo "colar link" + **Adicionar**; lista com **nome · plataforma · N faixas · última sync**, botão **[Sincronizar]** e [remover]; **[Sincronizar todas]**; após sync mostra *"N novas enfileiradas"*.
- **Histórico**: quando houver, exibe **Playlist · Plataforma · data**.

## Fronteiras
- `shared/types.ts` (+`playlist` em TrackMeta, +`PlaylistSubscription`), `shared/playlist.ts` (`pickNewTracks`), `shared/history.ts` (+`playlist` na entrada).
- Mapeadores: `ytdlpMap` (+`playlist`), `deezerClient`/`spotifyClient` (carimbo no resolve de playlist; embed retorna título).
- `electron/main/playlists.ts` (`PlaylistStore` + `PlaylistService`), `ipc.ts`, `preload`.
- `src/components/PlaylistsView.tsx`, `HistoryView.tsx` (origem), `App.tsx` (aba).

## Plano (fases, TDD onde há lógica)
1. **shared:** `TrackMeta.playlist`, `HistoryEntry.playlist` (+`entryFromTrack`), `PlaylistSubscription`, `pickNewTracks` (+testes).
2. **carimbo `playlist`:** `ytdlpInfoToTrack` (+ limpar em search), Deezer/Spotify resolve de playlist (+ título do embed) (+testes).
3. **main:** `PlaylistStore` + `PlaylistService` (add/list/remove/sync/syncAll) + composição + IPC + preload.
4. **UI:** aba `PlaylistsView` (contagem incluída) + Histórico com origem.
5. **Verificação** (typecheck/tests/build) + **validação ao vivo**: cadastrar playlist → sincronizar (baixa só as novas; repetir não re-baixa) → histórico mostra a playlist.

## Testes
- Unit: `pickNewTracks`; carimbo `playlist` nos mapeadores; história com `playlist`.
- UI/integração: validação ao vivo (driver + screenshots).
