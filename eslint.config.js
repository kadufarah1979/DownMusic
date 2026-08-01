import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'

/**
 * Lint em tres camadas. A checagem de tipos ja e feita por `npm run typecheck`
 * (tsc --noEmit), entao aqui usamos as regras nao-tipadas: rodam sem programa
 * de tipos e mantem o lint rapido.
 *
 * `eslint-config-prettier` entra por ultimo apenas para desligar regras de
 * formatacao. A formatacao NAO e imposta pelo lint — quem formata e o
 * `npm run format`, sob demanda.
 */
export default tseslint.config(
  {
    ignores: ['out/**', 'dist/**', 'node_modules/**', 'resources/**']
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // o projeto usa `_e`/`_` para parametros exigidos pela assinatura e nao usados
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }
      ],
      // usado de proposito em pontos de fronteira (payload de IPC, JSON externo)
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  },

  // renderer: regras dos hooks do React
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules
    }
  },

  // main/preload rodam em Node; testes usam os globais do Vitest
  {
    files: ['electron/**/*.ts', '*.config.ts', 'scripts/**/*.js'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', __dirname: 'readonly' }
    }
  },

  // configs em CommonJS (postcss/tailwind): `module.exports` e valido aqui
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'writable', require: 'readonly', __dirname: 'readonly' }
    }
  },

  prettier
)
