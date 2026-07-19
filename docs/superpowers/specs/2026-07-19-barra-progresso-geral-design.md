# Barra de progresso geral da fila — Design + Plano

- **Data:** 2026-07-19
- **Objetivo:** mostrar o progresso geral dos downloads (ex: "Baixando 45/100") com uma barra, no cabecalho da fila.

## UI
- No cabecalho da `QueueList` (aba Download), quando ha itens:
  - Texto: "Baixando `done`/`total`" (e "· M com erro" quando houver). Quando `done+error == total`: "Concluido `done`/`total`".
  - Barra de progresso abaixo: largura = `(done+error)/total`, parte concluida em verde. Chega a 100% quando a fila termina (mesmo com erros).

## Logica (pura/testavel)
- `queueProgress(items: QueueItem[]) -> { total, done, error, pct, finished }`
  - `total` = itens; `done` = state 'done'; `error` = state 'error'.
  - `pct` = total ? round((done+error)/total*100) : 0.
  - `finished` = total>0 && done+error == total.
- Fica em `shared/queueProgress.ts` (usa so o tipo QueueItem). `QueueList` consome.

## Escopo
- Só front-end. Sem backend/IPC novos.

## Plano
1. `shared/queueProgress.ts` + teste (contagens, pct, finished, fila vazia).
2. `QueueList`: renderiza o texto + barra a partir de `queueProgress`.
3. Verificacao (typecheck/tests/build) + validacao ao vivo (screenshot com downloads em andamento).

## Testes
- Unit: `queueProgress`.
- UI: validacao ao vivo.
