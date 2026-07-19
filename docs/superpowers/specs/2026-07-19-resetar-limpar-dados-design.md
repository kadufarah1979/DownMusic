# Resetar / Limpar dados — Design + Plano

- **Data:** 2026-07-19
- **Objetivo:** permitir o usuario limpar seletivamente (via checkboxes num modal): historico, playlists salvas e/ou os arquivos baixados (apaga os arquivos, irreversivel).

## UI
- Botao "Resetar / Limpar dados..." em Configuracoes abre um **modal in-app** com 3 checkboxes:
  1. Historico de downloads (apaga entradas; nao mexe em arquivos).
  2. Playlists salvas (remove todas as cadastradas).
  3. ⚠️ Arquivos baixados (apaga os arquivos da pasta de downloads; irreversivel) — rotulo com aviso.
- "Cancelar" / "Limpar selecionados".
- Ao confirmar, se "Arquivos baixados" estiver marcado, um **`confirm()` nativo extra** informa exatamente o que sera apagado (a pasta) e que e irreversivel. Se cancelado, nada e apagado.

## Backend
- Historico: `history.clear()` (ja existe).
- Playlists: `PlaylistStore.clear()` + `PlaylistService.clear()` + IPC `playlist:clear`.
- Arquivos: IPC `downloads:clear` → apaga o CONTEUDO de `config.outputDir` (mantem a pasta), com guardas.
- **Pura/testavel** `isSafeToClear(dir, home)`: bloqueia vazio, `/`, a home do usuario e ancestrais obvios; permite pastas normais.

## Fronteiras
- `shared`? Nao — `isSafeToClear` fica em `electron/main/reset.ts` (usa so string/path). Testavel.
- `electron/main/playlists.ts` (clear), `electron/main/reset.ts` (isSafeToClear + clearDir), `ipc.ts`, `preload`.
- `src/components/SettingsView.tsx` (botao + modal `ResetDialog`).

## Plano (TDD onde ha logica)
1. `isSafeToClear` (puro) + teste: bloqueia '', '/', home; permite ~/Musica/Downloads.
2. `clearDir(dir)` (apaga conteudo, mantem pasta) + teste com fs temp.
3. `PlaylistService.clear` + teste.
4. IPC `playlist:clear` e `downloads:clear` (usa isSafeToClear + clearDir) + preload.
5. UI: `ResetDialog` (modal com checkboxes) + botao em Configuracoes; confirm nativo extra para arquivos.
6. Verificacao (typecheck/tests/build) + validacao ao vivo: marcar as 3 -> historico/playlists zerados e pasta esvaziada (com guarda).

## Testes
- Unit: `isSafeToClear`, `clearDir` (fs temp), `PlaylistService.clear`.
- UI/integracao: validacao ao vivo.
