# Pasta de destino por lista (aba Download) — Design + Plano

- **Data:** 2026-07-19
- **Objetivo:** na aba Download, permitir escolher a pasta onde a lista resolvida sera baixada, sobrepondo a pasta padrao apenas para aquele lote.

## Comportamento
- Ao resolver uma lista, aparece "Baixar em: `<pasta>` [Escolher...]" acima das faixas.
- Comeca na pasta padrao (Configuracoes). "Escolher..." abre o seletor nativo e troca a pasta so para esta lista.
- "Enfileirar selecionados" baixa na pasta escolhida.
- Por lote (nao muda o padrao global). Cada nova lista recomeca na pasta padrao. Busca e playlists usam o padrao.

## Tecnico
- `QueueManager.enqueue(meta, outputDir?)`: guarda override por item (mapa `itemId -> outputDir`); `fetchOptions(item)` usa o override se houver, senao `cfg.outputDir`. `format`/`quality`/`nameTemplate` seguem da config. O override persiste no retry.
- IPC `enqueue(metas, outputDir?)` + preload `enqueue(metas, outputDir?)`.
- UI: `TrackSelectList` ganha prop opcional `outputDir` (repassa ao `enqueue`). `App` (aba Download) guarda `downloadDir` (default = config.outputDir, carregado no mount) + botao "Escolher..." (usa `api.pickFolder`). Passa `downloadDir` so para a lista resolvida.

## Fronteiras
- `electron/main/queue.ts` (override por item), `ipc.ts`, `preload`.
- `src/components/TrackSelectList.tsx` (prop outputDir), `src/App.tsx` (estado downloadDir + botao).

## Plano (TDD onde ha logica)
1. `QueueManager.enqueue(meta, outputDir?)` + teste: item com override baixa na pasta dada; sem override usa a config; override sobrevive ao retry.
2. IPC/preload `enqueue(metas, outputDir?)`.
3. UI: prop `outputDir` no TrackSelectList; App com `downloadDir` + "Escolher...".
4. Verificacao (typecheck/tests/build) + validacao ao vivo: resolver lista, escolher pasta B, enfileirar -> arquivos caem em B (nao na padrao).

## Testes
- Unit: fila com override de pasta.
- UI/integracao: validacao ao vivo.
