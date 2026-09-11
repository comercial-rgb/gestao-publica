import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { INCLUDE_DA_SUITE, particionar } from "./test/particao-da-suite.js";

/**
 * A SUÍTE RÁPIDA — domínio puro, sem banco. É a que se roda a cada mudança.
 *
 * ⚠️ ELA NÃO TEM `globalSetup` NEM `setupFiles`, e é daí que vem quase todo o ganho: a
 * suíte completa gasta segundos só provisionando o banco de teste, aplicando migration e
 * o SQL manual — antes do primeiro `it`.
 *
 * ⚠️ A EXCLUSÃO É CALCULADA, não escrita à mão. Uma lista manual de "testes lentos" começa
 * certa e envelhece calada: o arquivo novo que abre banco entraria na partição RÁPIDA, e
 * nesta configuração — que não provisiona nada — ele falharia ou, pior, passaria por
 * vacuidade. `test/particao-da-suite.ts` decide pelo que o arquivo IMPORTA, e
 * `particao-da-suite.test.ts` prova que a união das duas partições é o conjunto inteiro.
 *
 * ⚠️ E ELA NÃO SUBSTITUI A COMPLETA. `npm run test:tudo` continua sendo o que roda no gate.
 */
const RAIZ = resolve(import.meta.dirname);

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    include: [...INCLUDE_DA_SUITE],
    exclude: ["**/node_modules/**", ...particionar(RAIZ).lenta],
    // Sem banco, nada se atropela: os arquivos podem correr em paralelo.
    fileParallelism: true,
  },
});
