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
    // ⚠️ `doador/**` — EXCLUSÃO DECLARADA, com a medição que a justifica.
    //
    // MEDIDO na importação: `vitest list --filesOnly` coletou ZERO arquivos do doador,
    // porque os `include` acima são ANCORADOS (`packages/**`, e não `**/packages/**`) e
    // `doador/saas-municipal/packages/folha-engine/test/*.test.ts` não casa com eles.
    //
    // ⚠️ ENTÃO POR QUE ESCREVER A EXCLUSÃO. Porque o que segura hoje é a ÂNCORA, e âncora
    // se perde numa edição de uma linha: trocar `packages/**` por `**/packages/**` — o
    // reflexo de quem acabou de mover um pacote de lugar — puxaria os 10 `.test.ts` do
    // folha-engine absorvido para dentro da suíte. Eles não rodariam: o doador usa pnpm com
    // workspaces e está sem dependências instaladas de propósito. O modo de falha seria uma
    // suíte vermelha por motivo que não é nosso, no gate, sem ninguém entender de onde veio.
    exclude: ["**/node_modules/**", "doador/**", ...particionar(RAIZ).lenta],
    // Sem banco, nada se atropela: os arquivos podem correr em paralelo.
    fileParallelism: true,
  },
});
