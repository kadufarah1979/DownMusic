# Histórico de downloads — Design + Plano

- **Data:** 2026-07-19
- **Objetivo:** registro persistente de tudo que já foi baixado ("baixei essa música um dia?"), **independente de o arquivo ainda existir** (pode estar em pendrive/HD). Aba "Histórico" + selo "✓ Baixado" nas listagens. Reconhecimento **multiplataforma** (ISRC ou artista+título). Mostrar a **plataforma** de origem no histórico.

## Persistência

- `HistoryStore` (electron-store, arquivo `history.json`, separado da config).
- `HistoryEntry`: `{ title, artists[], isrc?, nameKey, sourceId, downloadedAt (ISO), outputPath }`.
- `nameKey` = normalização (sem acento/maiúscula) de "artistas + título".
- **Dedup:** ao gravar, se já existe entrada com mesmo ISRC (ambos presentes) OU mesmo `nameKey`, não duplica (mantém a primeira).

## Gravação

- Quando um item da fila chega a `done`, o composition root chama `history.add(item.meta, item.outputPath)`.

## Reconhecimento "já baixado" (puro, testável — `shared/history.ts`)

- `buildDownloadedIndex(entries)` → `{ isrcs: Set, names: Set }`.
- `isDownloaded(track, index)` = `(track.isrc && isrcs.has(track.isrc)) || names.has(nameKey(track))`.

## UI

- **Aba "Histórico"**: lista (título — artistas · **plataforma** · data), contador, botão **"Limpar histórico"** (com confirmação). Read-only (sem "abrir", pois o arquivo pode não existir). Ordem: mais recentes primeiro.
- **Selo "✓ Baixado"** por linha no `TrackSelectList` (Busca + Download). Cada view (Busca/Download) carrega o histórico uma vez, monta o índice e passa um verificador `isDownloaded` para as listas (sem consulta por faixa).

## Fronteiras

- `shared/text.ts` — `normalizeText` (extraído do filtro; reusado por filtro e histórico).
- `shared/history.ts` — tipos + `nameKey`, `entryFromTrack`, `addToHistory`, `buildDownloadedIndex`, `isDownloaded` (puros).
- `electron/main/history.ts` — `HistoryStore` (electron-store): `list`, `add`, `clear`.
- IPC: `history:list`, `history:clear`; preload `getHistory`/`clearHistory`.
- `src/components/HistoryView.tsx` — aba; `src/lib/downloaded.ts` — carrega índice e devolve o verificador.
- `TrackSelectList` ganha prop opcional `isDownloaded?: (t) => boolean` (selo).

## Plano (TDD onde há lógica pura)

1. `shared/text.ts` (`normalizeText`) + refatorar `trackFilter` para usá-lo (suíte segue verde).
2. `shared/history.ts` + testes: `nameKey`, `addToHistory` (dedup por isrc/nome), `isDownloaded`. (RED→GREEN)
3. `electron/main/history.ts` (`HistoryStore`) + gravar no `done` (composition root) + IPC + preload.
4. Renderer: aba `HistoryView` (com plataforma), `src/lib/downloaded.ts`, selo no `TrackSelectList`, Busca/Download passam o verificador.
5. Verificação (typecheck/tests/build) + validação ao vivo: baixar → aparece no Histórico (plataforma+data); mesma faixa em nova busca mostra "✓ Baixado"; limpar histórico.

## Caveat (YAGNI)

- O selo reflete o histórico **no momento em que a lista carregou**; atualização em tempo real na mesma lista fica para depois.
