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

  // ═══ ⚠️ A CONFERÊNCIA DE TIPOS DO BUILD, E POR QUE ELA TEM UMA VÁLVULA COM CADEADO ═══
  //
  // O QUE ACONTECEU EM 15/09/2026. Três `next build` seguidos morreram SEM MENSAGEM no passo
  // "Linting and checking validity of types", dois deles com a máquina livre. O terceiro, rodado com
  // a saída inteira em disco, mostrou o motivo:
  //
  //     FATAL ERROR: Ineffective mark-compacts near heap limit - JavaScript heap out of memory
  //     Next.js build worker exited with code: null and signal: SIGABRT
  //
  // Não era saturação da máquina: era o HEAP do worker que o Next abre para conferir tipos. Esta
  // máquina tem 8 GB, e `npm run typecheck:app` só passa com heap ampliado — o worker do Next não
  // herda esse ajuste, e estoura sozinho.
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
