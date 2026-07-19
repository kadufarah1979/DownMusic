# Selo em tempo real + Retentar downloads com erro — Design + Plano

- **Data:** 2026-07-19
- **Objetivos:**
  1. O selo "✓ Baixado" atualiza em **tempo real** (quando um download conclui, aparece nas listas abertas sem refazer a busca).
  2. Faixas que **falharam** podem ser **listadas** (toggle "só com erro") e **retentadas** (por item e todas de uma vez).

## Feature 1 — Selo em tempo real

- Hook `useDownloadedChecker()` em `src/lib/downloaded.ts`:
  - carrega o índice do histórico no mount;
  - inscreve-se em `api.onQueueUpdate`; a cada item `done`, recarrega o índice e atualiza o verificador.
- `SearchView` e a lista resolvida do Download usam o hook (substitui o carregamento manual).
- Resultado: ao concluir um download, o selo reaparece nas listagens visíveis imediatamente.

## Feature 2 — Erros: listar + retentar

- **`QueueManager`:**
  - `retry(itemId)`: se o item está em `error`, re-executa (`run` reseta para `running`, tenta de novo; sucesso → `done` → histórico).
  - `retryFailed()`: retenta todos os itens em `error`.
- **IPC:** `queue:retry` (itemId), `queue:retryFailed`; preload `retry(itemId)` / `retryFailed()`.
- **UI (`QueueList`):**
  - Cabeçalho: "N na fila · M com erro" + botão **"Tentar novamente (M)"** quando M>0.
  - Toggle **"Só com erro"** filtra a lista.
  - Por item em `error`: botão **"↻ Tentar"** + mensagem de erro (já existente).

## Fronteiras

- `electron/main/queue.ts` — `retry`/`retryFailed`.
- `electron/main/ipc.ts` + `electron/preload/index.ts` — canais e API.
- `src/lib/downloaded.ts` — hook `useDownloadedChecker`.
- `src/components/QueueList.tsx` — cabeçalho, toggle, botões de retry.
- `src/components/SearchView.tsx`, `src/App.tsx` — passam a usar o hook.

## Plano (TDD onde há lógica)

1. `QueueManager.retry/retryFailed` + testes: item em `error` re-executa e chega a `done`; item não-`error` é ignorado; `retryFailed` retenta só os com erro. (RED→GREEN, com runner/fonte falsos)
2. IPC + preload (`retry`, `retryFailed`).
3. `useDownloadedChecker` (hook) + `SearchView`/`App` usam.
4. `QueueList`: contagem, toggle "só com erro", botão por item e "tentar todas".
5. Verificação (typecheck/tests/build) + validação ao vivo: forçar um erro (link sem match) → toggle lista o erro → "↻ Tentar"; e um `done` faz o selo aparecer em tempo real numa busca aberta.

## Testes

- Unitário: `QueueManager.retry/retryFailed`.
- UI/integração: validação ao vivo (driver + screenshots).
