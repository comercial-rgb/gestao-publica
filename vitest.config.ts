import { defineConfig } from "vitest/config";
import { INCLUDE_DA_SUITE } from "./test/particao-da-suite.js";

export default defineConfig({
  // ⚠️ JSX AUTOMÁTICO (7.9) — sem isto, um `.tsx` não compila aqui.
  //
  // O `tsconfig.json` do app diz `"jsx": "preserve"` porque quem transforma lá é o Next. O oxc
  // (o transformador do Vite 8) LÊ esse tsconfig e obedece: "preserve" significa "não transforme",
  // e o JSX chega cru ao parser, que morre em `</>`. Aqui não há Next para transformar depois —
  // então o teste pede a transformação explicitamente.
  //
  // É `oxc` e não `esbuild`: no Vite 8 a chave `esbuild` está deprecada e é IGNORADA quando o oxc
  // decide (o Vite avisa "esbuild options will be ignored" — um aviso fácil de não ler).
  // E é o oxc e não `@vitejs/plugin-react` porque o plugin serve a fast-refresh/HMR, que teste não
  // tem: uma dependência a menos para a mesma transformação.
  oxc: { jsx: { runtime: "automatic" } },

  test: {
    // ⚠️ OS `include` VÊM DE `test/particao-da-suite.ts`, e não escritos aqui. São a MESMA
    // lista que a suíte rápida usa: duas listas divergiriam em silêncio, e a divergência
    // apareceria como um arquivo que nenhuma das duas roda. Os comentários sobre por que
    // cada raiz está na lista moraram aqui até o ENT03b e foram para lá junto com ela.
    include: [...INCLUDE_DA_SUITE],

    // ⚠️ AMBIENTE: `node` continua o DEFAULT — quase toda a suíte é domínio + Prisma, e um DOM
    // global custaria a todos por causa de poucos. Quem precisa de DOM pede POR ARQUIVO, no
    // docblock: `// @vitest-environment happy-dom` (ver `test/ui/Campos.test.tsx`).

    // Cria o banco de TESTE, aplica migrations e os índices parciais. Aborta se
    // DATABASE_URL_TEST faltar ou apontar para o mesmo banco que DATABASE_URL.
    globalSetup: ["test/global-setup.ts"],

    // Reescreve process.env.DATABASE_URL para o banco de teste em CADA worker —
    // a suíte fisicamente não alcança o banco de dev.
    setupFiles: ["test/setup.ts"],

    // Os testes de integração compartilham UM banco de teste e cada um limpa e
    // semeia as mesmas tabelas no beforeEach. Em paralelo eles se atropelam.
    // O isolamento resolveu dev-vs-teste, não teste-vs-teste — por isso continua
    // serializado. Dar um schema por arquivo resolveria, e não vale a complexidade
    // numa suíte deste tamanho.
    fileParallelism: false,
  },
});
