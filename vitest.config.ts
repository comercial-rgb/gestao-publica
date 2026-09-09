import { defineConfig } from "vitest/config";

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
    include: [
      "packages/**/*.test.ts",
      "modules/**/*.test.ts",
      // ⚠️ OS ADAPTERS DE TRIBUNAL. Os testes do SAGRES/Captura/Consulta moravam em `modules/` e
      // vieram para `adapters/tribunais/tce-pb/**` — sem esta linha, os 4 arquivos de teste do M15
      // e os 3 do M18/M19 sumiriam do `include` e a suíte ficaria VERDE sem tê-los executado. É a
      // mesma armadilha que a linha do `.tsx` abaixo evita, e a mesma que o `global-setup` recusa
      // ao não pular teste de banco: verde que não rodou nada é pior que vermelho.
      "adapters/**/*.test.ts",
      "prisma/seed/**/*.test.ts",
      "test/**/*.test.ts",
      // ⚠️ .tsx (7.9): os testes de COMPONENTE. Sem esta linha um `Campos.test.tsx` seria
      // silenciosamente IGNORADO — a suíte passaria verde sem nunca tê-lo executado, que é a
      // mesma armadilha que o `global-setup` recusa ao não pular teste de banco.
      "test/**/*.test.tsx",
    ],

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
