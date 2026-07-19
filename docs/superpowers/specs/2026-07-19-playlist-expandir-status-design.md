# Expandir playlist com status por faixa — Design + Plano

- **Data:** 2026-07-19
- **Objetivo:** clicar num card da playlist expande/colapsa e lista as faixas com status (baixado / não baixado / erro / na fila) e a ação certa por faixa (Baixar / Baixar de novo / Tentar novamente).

## Interação
- Card da playlist vira um cabeçalho clicável (expand/collapse).
- Ao expandir: `api.resolve(url)` (com "carregando..."); lista as faixas.

## Status por faixa (precedência) e ação
1. `error` (fila da sessão) → "↻ Tentar novamente"
2. `running` / `queued` (fila da sessão) → em progresso, sem botão
3. `downloaded` (histórico) → "Baixar de novo"
4. `new` (nada) → "Baixar"

Toda ação enfileira a faixa (`api.enqueue([track])`). Status atualiza em tempo real (histórico via hook + eventos da fila).

## Caveat (acordado)
- "Baixado" vem do **histórico** (persistente). "Erro/na fila/baixando" vêm da **fila da sessão** — não persistem entre reinícios. Sem persistir erros (YAGNI).

## Arquitetura
- **Pura/testável** — `shared/trackStatus.ts`: `trackStatus(track, { downloaded, queueState }) : 'error'|'running'|'queued'|'downloaded'|'new'`.
- `src/lib/queueStatus.ts` — hook `useQueueStatus()` que mantém um mapa `nameKey → estado` a partir de `queueList` + `onQueueUpdate`.
- `PlaylistsView`: card clicável; ao expandir resolve a playlist; passa faixas + verificadores para o novo `PlaylistTracks`.
- `PlaylistTracks`: lista as faixas com badge de status + botão de ação (usa `trackStatus`).
- Reusa: `api.resolve`, `useDownloadedChecker` (tempo real), fila/enqueue. Sem backend novo.

## Plano (TDD onde há lógica pura)
1. `shared/trackStatus.ts` + teste: precedência error > running > queued > downloaded > new. (RED→GREEN)
2. `src/lib/queueStatus.ts` — hook do mapa de estados da fila (por nameKey).
3. `PlaylistTracks` (lista status+ação) + `PlaylistsView` (expand/collapse + resolve on expand).
4. Verificação (typecheck/tests/build) + validação ao vivo: expandir → faixas com status; baixar uma → vira "baixado" em tempo real; forçar erro → "tentar novamente".

## Testes
- Unit: `trackStatus`.
- UI/integração: validação ao vivo (driver + screenshots).
