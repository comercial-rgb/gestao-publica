import { conferenciaAprovada, explicarRecusa } from "./scripts/conferencia-de-tipos.mjs";
/** @type {import('next').NextConfig} */
/**
 * ⚠️ A VÁLVULA DOS TIPOS SÓ ABRE COM PROVA DO CONTEÚDO. A variável declara a intenção; o
 * arquivo de aprovação, procurado pelo digesto do conteúdo, é que autoriza. Sem ele o build
 * PARA — e para com a lista do que mudou, não com um "não bate".
 */
function tiposDispensadosComProva() {
  if (process.env.PULAR_CONFERENCIA_DE_TIPOS_DO_BUILD !== "1") return false;
  const r = conferenciaAprovada();
  if (r.ok) {
    console.log(
      `[build] conferencia de tipos DISPENSADA com prova: aprovacao de ${r.quando} para o ` +
        `digesto ${r.digesto.slice(0, 12)} (tsc levou ${r.duracaoMs} ms).`
    );
    return true;
  }
  throw new Error(explicarRecusa(r));
}

const nextConfig = {
  reactStrictMode: true,
  // O commit curto do build vai para o rodapé (via env — o build o injeta).
  env: {
    NEXT_PUBLIC_BUILD_COMMIT: process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "dev",
    // O AMBIENTE DE EXECUÇÃO (V6 P0.1): desenvolvimento | demonstracao | homologacao | producao.
    // É apresentação ("Ambiente de demonstração" na entrada), nunca chave de acesso.
    NEXT_PUBLIC_AMBIENTE: process.env.AMBIENTE_DE_EXECUCAO ?? "desenvolvimento",
  },

  // ⚠️ O puppeteer roda no servidor (a impressão de PDF dos demonstrativos, TR 7.5/5.120) e NUNCA
  // no bundle: ele carrega o Chromium por caminho de arquivo, e empacotá-lo quebraria o build. Marca
  // como externo — o Node o resolve de `node_modules` em runtime, do lado do servidor.
  serverExternalPackages: ["puppeteer"],

  // V23 — o limite padrão do corpo de uma server action é 1 MB, e a planilha oficial do plano de contas
  // do Tribunal (`Pcasp_2025.xlsx`) tem 1,3 MB: a importação morria com 413 e a tela ficava muda. 8 MB
  // cobre as planilhas e os arquivos anexados pelos formulários sem abrir a porta para qualquer tamanho.
  experimental: { serverActions: { bodySizeLimit: "8mb" } },

  // ═══ ⚠️ A CONFERÊNCIA DE TIPOS DO BUILD, E POR QUE ELA TEM UMA VÁLVULA COM CADEADO ═══
  //
  // O QUE ACONTECEU EM 15/09/2026. Três `next build` seguidos morreram SEM MENSAGEM no passo
  // "Linting and checking validity of types", dois deles com a máquina livre. O terceiro, rodado com
  // a saída inteira em disco, mostrou o motivo:
  //
  //     FATAL ERROR: Ineffective mark-compacts near heap limit - JavaScript heap out of memory
  //     Next.js build worker exited with code: null and signal: SIGABRT
  //
  // Não era saturação da máquina: era o HEAP do worker que o Next abre para conferir tipos.
  //
  // ⚠️ E A EXPLICAÇÃO QUE ESTAVA ESCRITA AQUI ERA FALSA — CORRIGIDA EM 24/09/2026 POR MEDIÇÃO.
  // Este comentário afirmava, desde 15/09/2026, que "o worker do Next não herda o
  // `--max-old-space-size` do repositório". Isso NÃO é verdade no Next 15.5.20, e a diferença
  // importa porque mandava a pessoa errada procurar no lugar errado. O que o código faz
  // (`node_modules/next/dist/lib/worker.js`) é:
  //
  //     const nodeOptions = getParsedNodeOptionsWithoutInspect();   // lê process.env.NODE_OPTIONS
  //     if (isolatedMemory) { delete nodeOptions['max-old-space-size']; ... }
  //     env: { ...process.env, IS_NEXT_WORKER: 'true', NODE_OPTIONS: formatNodeOptions(nodeOptions) }
  //
  // Quem APAGA o heap é a opção `isolatedMemory: true` — e ela é do worker de PÁGINAS
  // (`next/dist/build/index.js:338`). O worker de TIPOS é criado com `isolatedMemory: false`
  // (`next/dist/build/type-check.js:77`), e portanto HERDA o ajuste. Medido nesta máquina em
  // 24/09/2026, com sonda sobre a mesma classe `Worker`, nas duas direções:
  //
  //     isolatedMemory: false + NODE_OPTIONS=--max-old-space-size=5324  ->  heap do worker 5372 MB
  //     isolatedMemory: true  + o MESMO NODE_OPTIONS                    ->  heap do worker 2096 MB
  //     isolatedMemory: false + sem NODE_OPTIONS                        ->  heap do worker 2096 MB
  //
  // E o efeito confere com o build: `env NODE_OPTIONS=--max-old-space-size=5324 npx next build`
  // atravessa "Linting and checking validity of types" e termina com código 0 — registrado em
  // `.registro-de-execucao/rebuild-v816-2026-09-23T03-07-18-177Z.log` e reproduzido em
  // `.registro-de-execucao/build-v11-v9-2-2026-09-24T02-14-51-769Z.log`.
  //
  // ⚠️ ENTÃO O CAMINHO NORMAL É BUILDAR COM O HEAP EXPORTADO, E A VÁLVULA FICA. Ela não é
  // paliativo para esta máquina: é o instrumento para a máquina MENOR (o `heapEmMegabytes()` de
  // `scripts/conferencia-de-tipos.mjs` dimensiona por memória total, e num servidor pequeno o
  // worker não terá heap para terminar). Enquanto o heap couber, NÃO se liga a válvula — a
  // conferência do próprio build é melhor que a do `typecheck:app`, porque confere o
  // `.next/types/**` recém-gerado desta build em vez do da anterior.
  //
  // ⚠️ E ESTE PASSO É DUPLICADO. `npm run typecheck:app` roda `tsc --noEmit -p tsconfig.json`: o
  // MESMO tsconfig, com o MESMO `.next/types/**` na lista de `include`. Conferir duas vezes a mesma
  // coisa, numa máquina que só aguenta uma, custa o build inteiro.
  //
  // ═══ ⚠️ O QUE MUDOU NA V9 N0: A VARIÁVEL DEIXOU DE SER A APROVAÇÃO ═══
  //
  // A versão anterior era `ignoreBuildErrors: env === "1"`, e isso tinha dois defeitos reais:
  //
  //   1. **Uma variável no ambiente aprovava todo build futuro.** Exportada uma vez no shell — ou,
  //      pior, posta no ambiente de um servidor —, ela dispensava a conferência do build de amanhã,
  //      com arquivos que ninguém olhou. O SHA também não resolveria: a árvore desta sessão tem
  //      alterações não commitadas, e dois conteúdos diferentes moram sob o mesmo SHA.
  //
  //   2. **O MESMO interruptor desligava o ESLint.** Rodar `tsc` não confere lint nenhum, e o nome
  //      da variável ("pular conferência do build") fazia uma conferência que aconteceu carregar
  //      outra que nunca existiu. São duas decisões, e agora são duas linhas.
  //
  // Agora a variável apenas DECLARA a intenção; quem aprova é um arquivo gravado pelo
  // `npm run tipos:conferir`, procurado pelo **digesto do conteúdo exato** (fontes de `app/`,
  // `components/`, `lib/`, o próprio tsconfig, este arquivo, o lockfile e os tipos gerados do
  // Prisma). Sem aprovação para este conteúdo, o build PARA aqui — e a mensagem lista os arquivos
  // que mudaram desde a última conferência, para reconferir só a parte necessária.
  typescript: { ignoreBuildErrors: tiposDispensadosComProva() },

  // ⚠️ LINT: DECISÃO SEPARADA, E HOJE ELA É "NÃO HÁ LINT". Conferido em 15/09/2026: este
  // repositório não tem ESLint — nenhum `eslint.config.*`, nenhum `.eslintrc`, nenhuma dependência
  // `eslint` no `package.json`. `ignoreDuringBuilds: false` é o padrão do Next e fica EXPLÍCITO de
  // propósito: no dia em que o ESLint entrar, o build passa a conferi-lo sozinho, sem depender de
  // alguém lembrar de remover uma válvula. O que NÃO se faz é pendurá-lo na variável dos tipos:
  // "passo pulado não é passo barato" vale para o lint como vale para o resto, e desligar por
  // tabela um passo que nunca rodou é declarar aprovação de algo que não existe.
  eslint: { ignoreDuringBuilds: false },

  // ⚠️ O DOMÍNIO É NodeNext — imports com `.js` que resolvem `.ts`. O webpack do Next NÃO faz esse
  // mapeamento sozinho (o tsc faz, o webpack não), então uma porta que importa `modules/**` quebra
  // o build com "Can't resolve './razao.js'". `extensionAlias` ensina o webpack a resolver `.js`
  // para os fontes `.ts`/`.tsx` — o mesmo mapeamento do NodeNext, do lado do bundler. Sem isto, a
  // borda `lib/portas/**` (a única que importa o domínio) não compila.
  webpack(config) {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};
export default nextConfig;
