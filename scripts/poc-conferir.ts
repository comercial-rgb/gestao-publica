import { config as carregarEnv } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer, { type Browser, type BrowserContext, type Page } from "puppeteer";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import type { PrismaClient } from "../prisma/generated/client/client.js";
import { ACOES_DE_ADMINISTRACAO } from "../modules/m16-travamento/acoes.js";
import { listarSaldosExtra } from "../modules/m07-extraorcamentario/consultas.js";
import { criarOrdemCronologicaPrisma } from "../modules/m06-ordem-cronologica/index.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POC — CONFERÊNCIA PRÉ-APRESENTAÇÃO ("posso começar?").
 *
 * Este script existe por UMA razão: hoje o apresentador descobre o problema AO VIVO, na frente da
 * Comissão do TCE-PB. Um clique num botão que sumiu, uma tela que abre vazia, um dia sem movimento
 * escolhido pela Comissão — cada um desses é um constrangimento irreversível. Este comando roda
 * ~1h antes e responde de forma inequívoca: **PODE COMEÇAR** ou **NÃO INICIAR**.
 *
 * A diferença para os gates que já existem importa:
 *   · `npm run build` prova que COMPILA — não que há dado na tela;
 *   · `npm run test` prova que a lógica está certa — não que a massa do banco existe;
 *   · `npm run smoke:visual` prova que o CSS aplicou — não que o botão que será clicado existe.
 * Aqui se confere o que a APRESENTAÇÃO precisa: DADO, ROTA, BOTÃO e CONTINGÊNCIA.
 *
 * OS QUATRO BLOCOS (cada um com veredito próprio, nesta ordem):
 *   BLOCO 1 — MASSA:         lê o banco direto. Sem dado, nenhuma tela salva a demonstração.
 *   BLOCO 2 — ROTAS:         navegador real e logado; toda rota do roteiro responde 200 e não cai
 *                            no /login. Mais a rota PÚBLICA, em contexto anônimo — é assim que ela
 *                            será mostrada, e uma sessão viva esconderia uma regressão de auth.
 *   BLOCO 3 — CONTEÚDO:      cada BOTÃO que o apresentador vai clicar existe, e a tela não está
 *                            vazia. Uma rota 200 vazia passa no BLOCO 2 e mata a apresentação.
 *   BLOCO 4 — CONTINGÊNCIA:  a pasta CONTINGENCIA/ cobre os mesmos dias que o banco tem. Se a
 *                            aplicação não subir, é ela que prova o que o sistema faz.
 *
 * ⚠️ LEITURA PURA: este script NÃO escreve no banco e NÃO escreve arquivo nenhum. Ele CONFERE.
 *
 * PRÉ-REQUISITO: o servidor de produção já de pé.
 *     npm run build && npx next start -p 3000
 *
 * Uso:  npx tsx scripts/poc-conferir.ts [--base=http://localhost:3101] [--senha=…]
 *       (ou `npm run poc:conferir`)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */

// ── AMBIENTE ───────────────────────────────────────────────────────────────────────────────────
// Duas fontes, de propósito: DATABASE_URL mora em `.env`, mas SEED_ADMIN_SENHA mora em
// `.env.local` (que não vai para o git). `dotenv` não sobrescreve o que já existe, então a ordem
// aqui é inofensiva — as duas chaves não colidem.
carregarEnv();
carregarEnv({ path: ".env.local" });

/** Lê `--chave=valor` do argv; cai no padrão quando ausente. */
function arg(chave: string, padrao: string): string {
  const achado = process.argv.slice(2).find((a) => a.startsWith(`--${chave}=`));
  return achado === undefined ? padrao : achado.slice(chave.length + 3);
}

// ⚠️ O PADRÃO É A PORTA DA APRESENTAÇÃO (3000), a mesma que o roteiro manda subir. Já foi 3101 —
// a porta de ensaio — e isso é um erro perigoso num porteiro: rodando `npm run poc:conferir` sem
// argumento, ele conferiria um servidor QUE NÃO É O DA POC (possivelmente com build antigo) e
// devolveria um verde sobre o alvo errado. Um verificador que aponta para o lugar errado é pior
// que nenhum. Para conferir outra porta, passe `--base=http://localhost:XXXX`.
const BASE = arg("base", "http://localhost:3000").replace(/\/$/, "");
const USUARIO = arg("usuario", "admin@cg.pb.gov.br");
// A senha pode vir do argv (para quem roda em máquina sem .env.local) ou do ambiente. NUNCA é
// impressa: as mensagens abaixo falam da AUSÊNCIA dela, jamais do valor.
const SENHA = arg("senha", process.env["SEED_ADMIN_SENHA"] ?? "");

const RAIZ_CONTINGENCIA = "CONTINGENCIA";
const ORGAO_POC = "99";

// ── O REGISTRO DE ACHADOS ──────────────────────────────────────────────────────────────────────

/**
 * Um achado é uma pergunta respondida. `correcao` é o que diferencia este script de um smoke
 * qualquer: reprovar sem dizer O COMANDO exato devolve o problema ao apresentador a 1h do evento.
 */
interface Achado {
  readonly bloco: number;
  readonly ok: boolean;
  readonly rotulo: string;
  readonly detalhe: string;
  /** O comando (ou a instrução) exata para corrigir. Obrigatório em tudo que reprova. */
  readonly correcao?: string;
  /** `true` = alerta, não reprova. Entra no relatório, não derruba o veredito. */
  readonly aviso?: boolean;
}

const achados: Achado[] = [];

function registrar(a: Achado): void {
  achados.push(a);
  const marca = a.ok ? "✓" : a.aviso === true ? "⚠" : "✗";
  console.log(`  ${marca} ${a.rotulo.padEnd(46)} ${a.detalhe}`);
}

/** Açúcar: a checagem booleana mais comum, com a correção já acoplada ao caso de falha. */
function conferir(
  bloco: number,
  rotulo: string,
  ok: boolean,
  detalhe: string,
  correcao: string,
  aviso = false
): void {
  registrar({ bloco, ok, rotulo, detalhe, correcao, aviso });
}

const num = (v: unknown): number => Number(String(v ?? 0));
const iso = (d: Date): string => d.toISOString().slice(0, 10);

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// BLOCO 1 — MASSA (direto no banco)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * OS PERÍODOS COM MOVIMENTO — a união de TODAS as fontes de fato exportável.
 *
 * ⚠️ Esta função é uma RÉPLICA DELIBERADA de `periodosComMovimento` em `scripts/poc-contingencia.ts`
 * (~linha 114). A duplicação é intencional e vale a pena: se as duas divergirem, o BLOCO 4 vai
 * acusar exatamente essa divergência (o banco tem dia que a contingência não cobre) — que é o
 * sintoma que este script existe para pegar. Uma função compartilhada esconderia o erro nos dois
 * lados ao mesmo tempo.
 *
 * A lista COMPLETA é impressa porque é dela que a Comissão vai ESCOLHER um dia. Um dia fora dela é
 * uma tela vazia ao vivo.
 */
async function periodosComMovimento(
  prisma: PrismaClient
): Promise<{ dias: string[]; meses: string[]; exercicios: number[] }> {
  const dias = new Set<string>();
  const juntar = (linhas: readonly { readonly [k: string]: unknown }[], campo: string): void => {
    for (const l of linhas) dias.add(iso(l[campo] as Date));
  };

  juntar(await prisma.empenho.findMany({ select: { data: true } }), "data");
  juntar(await prisma.liquidacao.findMany({ select: { data: true } }), "data");
  // Só pagamentos genuínos — o mesmo filtro do exporter (estorno/anulação não é pagamento).
  juntar(
    await prisma.pagamento.findMany({
      where: { estornoDeId: null, anulacaoParcialDeId: null },
      select: { data: true },
    }),
    "data"
  );
  juntar(await prisma.receitaArrecadada.findMany({ select: { dataArrecadacao: true } }), "dataArrecadacao");
  juntar(await prisma.transferenciaEntreContas.findMany({ select: { data: true } }), "data");
  juntar(
    await prisma.movimentoExtraorcamentario.findMany({
      where: { tipo: "INGRESSO", pagamentoId: { not: null } },
      select: { data: true },
    }),
    "data"
  );
  juntar(
    await prisma.movimentoExtraorcamentario.findMany({ where: { tipo: "DISPENDIO" }, select: { data: true } }),
    "data"
  );

  const ordenados = [...dias].sort();
  const meses = [...new Set(ordenados.map((d) => d.slice(0, 7)))].sort();
  const fichas = await prisma.fichaOrcamentaria.findMany({ select: { exercicio: true }, distinct: ["exercicio"] });
  return { dias: ordenados, meses, exercicios: [...new Set(fichas.map((f) => f.exercicio))].sort() };
}

async function bloco1Massa(prisma: PrismaClient): Promise<{ dias: string[]; meses: string[] }> {
  console.log("\n═══ BLOCO 1 — MASSA (banco de demonstração) ═══");

  // ── A UG da POC e a identificação do ente ──
  // Sem o órgão "99" nada mais faz sentido: é a UG fictícia sobre a qual toda a massa foi montada.
  const orgao = await prisma.orgao.findUnique({ where: { codigo: ORGAO_POC } });
  conferir(
    1,
    `órgão POC (codigo "${ORGAO_POC}")`,
    orgao !== null,
    orgao !== null ? `${orgao.codigo} — ${orgao.nome}` : "NÃO EXISTE",
    "npm run seed:sagres-poc"
  );

  // O EnteConfig alimenta cabeçalho de PDF e exports federais. Vazio = documento sem identificação
  // do ente na frente da Comissão.
  const ente = await prisma.enteConfig.findFirst();
  const enteOk = ente !== null && ente.nome.trim() !== "" && ente.codigoIbge.trim() !== "";
  conferir(
    1,
    "enteConfig preenchido",
    enteOk,
    enteOk && ente !== null ? `${ente.nome} (IBGE ${ente.codigoIbge})` : "ausente ou com nome/IBGE em branco",
    "npm run seed:m02"
  );

  // ── QUEM APRESENTA ──
  const admin = await prisma.usuario.findUnique({ where: { identificador: USUARIO } });
  conferir(
    1,
    `usuário ${USUARIO}`,
    admin !== null && admin.ativo,
    admin === null ? "NÃO EXISTE" : admin.ativo ? "existe e está ativo" : "existe mas está INATIVO",
    "npm run seed:bootstrap"
  );

  /**
   * ⚠️ O USUÁRIO NÃO-ADMINISTRADOR — critério de "não iniciar" silencioso.
   *
   * O passo 10 do roteiro demonstra SEGREGAÇÃO DE FUNÇÕES (TR 6.4): mostra-se uma tela negando um
   * ato a quem não tem a permissão. Com apenas o superusuário cadastrado esse passo é FISICAMENTE
   * IMPOSSÍVEL — e essa é a pior forma de descobrir, porque nada antes dele falha.
   *
   * "Administrador" não é uma coluna: é derivado do grafo perfil→permissão. Um usuário é
   * não-administrador quando NENHUM dos seus perfis carrega qualquer ação da família ADMINISTRACAO
   * (`ACOES_DE_ADMINISTRACAO`, M16). Testar pelo NOME do perfil seria frágil — o seed usa
   * "ADMINISTRADOR" e as fixtures usam "ADMIN".
   */
  const naoAdmins = await prisma.usuario.findMany({
    where: {
      ativo: true,
      vinculos: { none: { perfil: { permissoes: { some: { acao: { in: [...ACOES_DE_ADMINISTRACAO] } } } } } },
    },
    select: { identificador: true },
  });
  conferir(
    1,
    "usuário NÃO-administrador (passo 10)",
    naoAdmins.length > 0,
    naoAdmins.length > 0
      ? `${naoAdmins.length}: ${naoAdmins.map((u) => u.identificador).join(", ")}`
      : "NENHUM — o passo de segregação de funções é impossível",
    'crie o usuário em /administracao/usuarios (perfil SEM as ações de ADMINISTRACAO) — sem ele o passo 10 do roteiro não pode ser executado'
  );

  // ── A FICHA DA DEMONSTRAÇÃO ──
  // 9001 é a ficha que o roteiro percorre (QDD → empenho → liquidação → pagamento). Sem dotação
  // ela existe mas não empenha nada.
  const ficha = await prisma.fichaOrcamentaria.findFirst({ where: { numero: 9001 } });
  const dotacao = ficha === null ? 0 : num(ficha.valorDotado);
  conferir(
    1,
    "ficha orçamentária 9001 com dotação",
    ficha !== null && dotacao > 0,
    ficha === null ? "NÃO EXISTE" : `exercício ${ficha.exercicio}, valorDotado ${dotacao.toFixed(2)}`,
    "npm run seed:sagres-poc"
  );

  // ── OS PERÍODOS — a lista que a Comissão vai escolher ──
  const { dias, meses } = await periodosComMovimento(prisma);
  conferir(
    1,
    "dias com movimento",
    dias.length > 0,
    dias.length > 0 ? `${dias.length} dia(s)` : "NENHUM — não há o que demonstrar",
    "npm run seed:sagres-poc"
  );
  conferir(
    1,
    "meses com movimento",
    meses.length > 0,
    meses.length > 0 ? `${meses.length} mês(es): ${meses.join(", ")}` : "NENHUM",
    "npm run seed:sagres-poc"
  );
  if (dias.length > 0) {
    // Impressa por extenso e não resumida: é a resposta à pergunta "escolha um dia" da Comissão.
    console.log("\n    ── DIAS COM MOVIMENTO (é destes que a Comissão pode escolher) ──");
    for (const d of dias) console.log(`       · ${d}`);
    console.log("");
  }

  // ── OS DOCUMENTOS DO ROTEIRO ──
  const decretos = await prisma.decretoCredito.count();
  conferir(
    1,
    "decreto de crédito adicional",
    decretos > 0,
    decretos > 0 ? `${decretos} decreto(s)` : "NENHUM — o passo do decreto não tem documento",
    "npm run seed:sagres-poc"
  );

  /**
   * ISS — retenção E saldo. As duas coisas são distintas e o roteiro usa as duas: a retenção
   * (nascida DENTRO de um pagamento, vínculo 5.25) e o SALDO A REPASSAR que a tela exibe. Um saldo
   * zerado renderiza a linha, mas o argumento "o ente ainda deve ao consignatário" desaparece.
   * O saldo vem de `listarSaldosExtra` (M07) — a MESMA função que a tela usa, nunca uma reconta.
   */
  const retencoesIss = await prisma.movimentoExtraorcamentario.count({
    where: { tipoConsignacao: { codigo: "ISS" }, pagamentoId: { not: null } },
  });
  conferir(
    1,
    "retenção de ISS",
    retencoesIss > 0,
    retencoesIss > 0 ? `${retencoesIss} retenção(ões) nascida(s) em pagamento` : "NENHUMA",
    "npm run seed:sagres-poc"
  );

  const saldos = await listarSaldosExtra(prisma);
  const saldoIss = saldos.filter((s) => s.tipoCodigo === "ISS").reduce((acc, s) => acc + Number(s.saldo), 0);
  conferir(
    1,
    "saldo extraorçamentário de ISS > 0",
    saldoIss > 0,
    `saldo ISS = ${saldoIss.toFixed(2)}`,
    "npm run seed:sagres-poc"
  );

  const bens = await prisma.bemPatrimonial.count();
  conferir(1, "bens patrimoniais", bens > 0, bens > 0 ? `${bens} bem(ns)` : "NENHUM", "npm run seed:sagres-poc");

  /**
   * EXTRATO API_BB + CONCILIAÇÃO. O roteiro mostra a integração bancária REAL (origem API_BB, não
   * OFX carregado à mão) e depois a conciliação. "Conciliado" não é coluna: é derivado da
   * existência de VinculoConciliacao. Sem vínculo, a tela mostra extrato solto — metade do passo.
   */
  const extratoBb = await prisma.extratoBancario.count({ where: { origem: "API_BB" } });
  conferir(
    1,
    "extrato bancário origem API_BB",
    extratoBb > 0,
    extratoBb > 0 ? `${extratoBb} extrato(s)` : "NENHUM extrato com origem API_BB",
    "npm run bb:smoke (ou importe pelo /integracoes/importadores)"
  );
  const vinculos = await prisma.vinculoConciliacao.count({ where: { tipo: "VINCULO" } });
  conferir(
    1,
    "conciliação bancária feita",
    vinculos > 0,
    vinculos > 0 ? `${vinculos} vínculo(s) de conciliação` : "NENHUM vínculo — nada foi conciliado",
    "npm run seed:sagres-poc"
  );

  /**
   * CMD e MBA VIGENTES. Não há coluna `vigente`: vigente é a versão com o MAIOR `vigenteDesde` que
   * já passou. Uma versão futura (vigenteDesde > hoje) existe no banco e NÃO aparece na tela — é
   * exatamente o tipo de armadilha que este bloco pega antes da Comissão.
   */
  const agora = new Date();
  const cmd = await prisma.versaoCmd.findFirst({
    where: { vigenteDesde: { lte: agora } },
    orderBy: [{ vigenteDesde: "desc" }, { numero: "desc" }],
  });
  const somaCotas =
    cmd === null
      ? 0
      : num((await prisma.cotaCmd.aggregate({ _sum: { valor: true }, where: { versaoId: cmd.id } }))._sum.valor);
  conferir(
    1,
    "CMD vigente com cotas > 0",
    cmd !== null && somaCotas > 0,
    cmd === null ? "NENHUMA versão de CMD vigente" : `v${cmd.numero}/${cmd.exercicio}, Σ cotas ${somaCotas.toFixed(2)}`,
    "npm run seed:poc-programacao"
  );

  const mba = await prisma.versaoMba.findFirst({
    where: { vigenteDesde: { lte: agora } },
    orderBy: [{ vigenteDesde: "desc" }, { numero: "desc" }],
  });
  const somaMetas =
    mba === null
      ? 0
      : num((await prisma.metaMba.aggregate({ _sum: { valor: true }, where: { versaoId: mba.id } }))._sum.valor);
  conferir(
    1,
    "MBA vigente com metas > 0",
    mba !== null && somaMetas > 0,
    mba === null ? "NENHUMA versão de MBA vigente" : `v${mba.numero}/${mba.exercicio}, Σ metas ${somaMetas.toFixed(2)}`,
    "npm run seed:poc-programacao"
  );

  // A receita prevista é o denominador do confronto CMD×MBA e da reprevisão. Zero quebra a tela.
  const previsto = num((await prisma.receitaPrevista.aggregate({ _sum: { valorPrevisto: true } }))._sum.valorPrevisto);
  conferir(
    1,
    "receita prevista > 0",
    previsto > 0,
    `Σ valorPrevisto = ${previsto.toFixed(2)}`,
    "npm run seed:sagres-poc"
  );

  /**
   * A FILA DO ART. 141. Derivada, nunca lida de coluna — e derivada AQUI pela MESMA porta do M06
   * que a tela `/despesa/ordem-cronologica` usa (`filasEm(null)`). Reimplementar a soma aqui daria
   * um "OK" no script e uma fila vazia na tela.
   */
  const filas = await criarOrdemCronologicaPrisma(prisma).filasEm(null);
  const naFila = filas.reduce((s, f) => s + f.liquidacoes.length, 0);
  conferir(
    1,
    "fila do art. 141 com saldo a pagar",
    naFila > 0,
    naFila > 0
      ? `${naFila} liquidação(ões) em ${filas.length} fila(s) (fonte × categoria)`
      : "FILA VAZIA — nada a ordenar; o passo da ordem cronológica fica sem conteúdo",
    "npm run seed:poc-fila"
  );

  /**
   * ⚠️⚠️ O SUBELEMENTO "999" — CRITÉRIO DE "NÃO INICIAR" DO ROTEIRO.
   *
   * "999" é o ERRO PROPOSITAL: um subelemento inválido usado numa VARIANTE da massa, para
   * demonstrar a rejeição do validador. Se ele estiver EM USO na massa principal, a variante de
   * erro ficou ativa — e a demonstração começaria com o SAGRES rejeitando o pacote na frente da
   * Comissão, sem que ninguém tivesse pedido.
   *
   * O teste é "em uso", não "existe": o cadastro do subelemento pode legitimamente ficar no banco
   * (o `codigo` é único POR NATUREZA, não globalmente). O que não pode é um EMPENHO apontar para
   * ele. Por isso a contagem é de empenhos, não de subelementos.
   */
  const subs999 = await prisma.subelemento.findMany({
    where: { codigo: "999" },
    select: { id: true, descricao: true, _count: { select: { empenhos: true } } },
  });
  const empenhosCom999 = subs999.reduce((s, x) => s + x._count.empenhos, 0);
  conferir(
    1,
    'subelemento "999" NÃO em uso',
    empenhosCom999 === 0,
    empenhosCom999 === 0
      ? subs999.length === 0
        ? "não existe no cadastro"
        : `cadastrado (${subs999.length}) mas sem empenho apontando — OK`
      : `🛑 ${empenhosCom999} EMPENHO(S) USANDO O SUBELEMENTO 999 — A VARIANTE DE ERRO ESTÁ ATIVA`,
    "recarregue a massa principal: npm run seed:sagres-poc (a variante de erro NÃO pode estar ativa na abertura)"
  );

  return { dias, meses };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// BLOCO 2 — ROTAS (navegador real, sessão viva)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * TODA rota do roteiro. Uma rota que responde 200 mas cai em `/login` é a falha mais traiçoeira:
 * o status é bom e a tela é outra. Por isso as duas coisas são conferidas juntas.
 */
const ROTAS_PROTEGIDAS = [
  "/",
  "/integracoes",
  "/integracoes/sagres",
  "/integracoes/importadores",
  "/integracoes/captura",
  "/integracoes/tce",
  "/planejamento",
  "/planejamento/qdd",
  "/planejamento/cmd-mba",
  "/planejamento/creditos-adicionais",
  "/planejamento/reprevisao",
  "/despesa/empenhos",
  "/despesa/liquidacoes",
  "/despesa/pagamentos",
  "/despesa/ordem-cronologica",
  "/financeiro/extraorcamentario",
  "/financeiro/conciliacao",
  "/patrimonio/bens",
  "/contabilidade",
  "/contabilidade/plano-de-contas",
  "/contabilidade/lancamentos",
  "/relatorios",
  "/relatorios/gerenciais",
  "/relatorios/livros/diario",
  "/relatorios/livros/razao",
  "/relatorios/livros/balancete",
  "/relatorios/rreo/anexo1",
  "/relatorios/rgf/anexo1",
  "/administracao",
  "/administracao/usuarios",
  "/administracao/auditoria",
  "/suporte",
] as const;

/**
 * A rota PÚBLICA. Conferida em contexto ANÔNIMO (cookies próprios, sessão zerada) porque é assim
 * que ela será mostrada — projetada em tela para a Comissão, "olhem, sem login". Se fosse conferida
 * na aba logada, uma regressão que a tornasse protegida passaria despercebida aqui e explodiria ao
 * vivo. A auth deste projeto é ESTRUTURAL (route group `(areas)` chamando `exigirSessao`), não do
 * middleware — logo é exatamente o tipo de coisa que um refactor de pastas quebra em silêncio.
 */
const ROTA_PUBLICA = "/transparencia/demonstrativos";

/**
 * ⚠️ O BUILD VELHO — a falha que este script quase deixou passar, e que custaria a apresentação.
 *
 * Descoberto medindo: um `next start` que continua rodando DEPOIS de um novo `npm run build` serve
 * HTML novo apontando para chunks que já não existem no disco. O navegador falha com
 * `ChunkLoadError`, o React derruba a árvore e a tela vira "Application error: a client-side
 * exception has occurred" — em BRANCO, no meio da navegação. É INTERMITENTE (medido: 6 quebras em
 * 25 navegações no servidor velho, 0 em 25 no servidor recém-subido), o que é o pior dos mundos:
 * passa nos testes rápidos e quebra na hora H, na frente da Comissão.
 *
 * Sem esta captura o sintoma chegaria ao apresentador como "seletor `table tbody tr` não
 * encontrado" — que o mandaria recarregar a massa, o remédio ERRADO para esta doença. O remédio é
 * REINICIAR o servidor.
 */
const errosDeChunk: string[] = [];

function vigiarQuebrasDeChunk(page: Page): void {
  // O tipo do evento varia entre versões do puppeteer (Error vs unknown) — normaliza-se aqui, que
  // é mais barato que prender o script a uma assinatura que muda de release em release.
  page.on("pageerror", (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("ChunkLoadError") || msg.includes("Loading chunk")) {
      errosDeChunk.push(`${page.url()} — ${msg.split("\n")[0]}`);
    }
  });
}

/** A tela caiu no error boundary do Next? É o rosto do ChunkLoadError. */
const SCRIPT_TELA_QUEBRADA = `(() => {
  const t = document.body.innerText || "";
  return t.indexOf("Application error") >= 0 || t.indexOf("client-side exception") >= 0;
})()`;

async function entrar(page: Page): Promise<void> {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.type('input[name="identificador"]', USUARIO);
  await page.type('input[name="senha"]', SENHA);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => undefined),
    page.click('button[type="submit"]'),
  ]);
  /**
   * A Server Action pode resolver SEM navegação clássica — por isso o destino é confirmado por
   * SONDAGEM, não por evento.
   *
   * ⚠️ Aqui NÃO se usa a espera fixa de 1,5s do `smoke-visual.ts`. Com a máquina carregada (build
   * recém-terminado, banco respondendo lento) 1,5s às vezes não bastam, e o script acusava "login
   * falhou" com a senha CERTA — um "NÃO INICIAR" falso. Num comando cujo produto é um veredito de
   * ir/não-ir, o falso vermelho custa quase tanto quanto o falso verde: ele manda o apresentador
   * caçar um problema que não existe a 1h da Comissão. Poll até 15s: sai assim que a sessão vive.
   */
  const limite = Date.now() + 15_000;
  while (page.url().includes("/login") && Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 250));
  }
  if (page.url().includes("/login")) {
    const msg = (await page.evaluate("document.body.innerText.slice(0, 300)")) as string;
    throw new Error(`login falhou (continua em /login após 15s). Texto da tela: ${msg.replace(/\s+/g, " ")}`);
  }
}

/** Navega e devolve o diagnóstico da rota: status + se a sessão sobreviveu. */
async function visitar(page: Page, rota: string): Promise<{ ok: boolean; detalhe: string }> {
  const resp = await page.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded" });
  const status = resp?.status() ?? 0;
  if (status !== 200) return { ok: false, detalhe: `status ${status}` };
  if (page.url().includes("/login")) return { ok: false, detalhe: "caiu no /login — sessão perdida" };
  return { ok: true, detalhe: "200" };
}

async function bloco2Rotas(page: Page, anonima: Page): Promise<void> {
  console.log("\n═══ BLOCO 2 — ROTAS (navegador logado) ═══");

  for (const rota of ROTAS_PROTEGIDAS) {
    const r = await visitar(page, rota).catch((e: unknown) => ({
      ok: false,
      detalhe: e instanceof Error ? e.message : String(e),
    }));
    conferir(2, rota, r.ok, r.detalhe, `abra ${BASE}${rota} e veja o erro do servidor — a rota está no roteiro`);
  }

  // ── A rota pública, SEM sessão ──
  const rp = await visitar(anonima, ROTA_PUBLICA).catch((e: unknown) => ({
    ok: false,
    detalhe: e instanceof Error ? e.message : String(e),
  }));
  conferir(
    2,
    `${ROTA_PUBLICA} (anônimo)`,
    rp.ok,
    rp.ok ? "200 sem login — pública, como será mostrada" : rp.detalhe,
    "a rota pública deve viver FORA do route group (areas)/ — verifique app/transparencia/demonstrativos/"
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// BLOCO 3 — CONTEÚDO E BOTÕES
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Uma SONDA é uma pergunta feita ao DOM já renderizado.
 *
 * `tipo` existe porque as telas não são uniformes: umas usam o componente `TabelaDeDados`, outras
 * têm `<table>` à mão; o saldo de ISS é DADO numa célula (não um rótulo fixo); a régua do SAGRES é
 * texto dentro de um `<pre>`, não um elemento próprio. Uma sonda genérica só de seletor daria
 * falso verde em pelo menos três telas.
 */
interface Sonda {
  readonly rotulo: string;
  readonly tipo: "seletor" | "texto" | "primeiraTabelaLinhas" | "issSaldo";
  /** O seletor CSS ou o texto procurado — é ISTO que é reportado quando falha. */
  readonly alvo: string;
  readonly minimo: number;
}

interface ResultadoSonda {
  readonly rotulo: string;
  readonly alvo: string;
  readonly achados: number;
  readonly obs: string;
}

/**
 * ⚠️ O script de sondagem vai como STRING, de propósito — mesma razão do `smoke-visual.ts`: se
 * fosse uma função, o `tsx` (esbuild) a compilaria com a marca `__name(...)` que ele injeta para
 * preservar nomes, e essa marca não existe no contexto do navegador. Todo `evaluate` morreria com
 * "__name is not defined". String é avaliada tal e qual.
 */
function scriptDeSondagem(sondas: readonly Sonda[]): string {
  return `(() => {
  const sondas = ${JSON.stringify(sondas)};
  const texto = (el) => (el.innerText || el.textContent || "");

  return sondas.map((p) => {
    // ── seletor: quantos elementos casam ──
    if (p.tipo === "seletor") {
      return { rotulo: p.rotulo, alvo: p.alvo, achados: document.querySelectorAll(p.alvo).length, obs: "" };
    }

    // ── texto: o literal aparece na tela? (comparação sobre innerText, o que o olho lê) ──
    if (p.tipo === "texto") {
      const corpo = texto(document.body);
      return { rotulo: p.rotulo, alvo: p.alvo, achados: corpo.indexOf(p.alvo) >= 0 ? 1 : 0, obs: "" };
    }

    // ── primeiraTabelaLinhas: a tela tem VÁRIAS tabelas e a que importa é a primeira ──
    if (p.tipo === "primeiraTabelaLinhas") {
      const t = document.querySelector("table");
      if (!t) return { rotulo: p.rotulo, alvo: p.alvo, achados: 0, obs: "nenhuma <table> na página" };
      return { rotulo: p.rotulo, alvo: p.alvo, achados: t.querySelectorAll("tbody tr").length, obs: "" };
    }

    // ── issSaldo: o saldo é DADO numa célula, não um rótulo. Ancora-se no <h2> do cartão certo,
    //    porque a sigla "ISS" também aparece nos cartões de retenções e de recolhimentos. ──
    const h = Array.from(document.querySelectorAll("h2")).find((x) => texto(x).indexOf("Saldos por consignat") >= 0);
    if (!h) return { rotulo: p.rotulo, alvo: 'h2 contendo "Saldos por consignat"', achados: 0, obs: "cartão de saldos não encontrado" };
    let caixa = h;
    while (caixa && !caixa.querySelector("table")) caixa = caixa.parentElement;
    if (!caixa) return { rotulo: p.rotulo, alvo: "table dentro do cartão de saldos", achados: 0, obs: "cartão sem tabela" };
    const linha = Array.from(caixa.querySelectorAll("tbody tr")).find((tr) => {
      const c = tr.querySelector("td");
      return c && texto(c).trim().indexOf("ISS") === 0;
    });
    if (!linha) return { rotulo: p.rotulo, alvo: 'linha cuja 1ª <td> começa com "ISS"', achados: 0, obs: "sem linha de ISS na tabela de saldos" };
    const celulas = linha.querySelectorAll("td");
    const saldo = texto(celulas[celulas.length - 1]).trim();
    return { rotulo: p.rotulo, alvo: "última <td> da linha de ISS", achados: saldo !== "" ? 1 : 0, obs: "saldo exibido: " + saldo };
  });
})()`;
}

/** Uma tela do roteiro e tudo que o apresentador vai clicar nela. */
interface TelaDoRoteiro {
  readonly rota: string;
  readonly sondas: readonly Sonda[];
}

const TELAS: readonly TelaDoRoteiro[] = [
  {
    rota: "/planejamento/qdd",
    sondas: [{ rotulo: "linhas do QDD", tipo: "seletor", alvo: "table tbody tr", minimo: 1 }],
  },
  {
    // Três tabelas nesta tela (CMD, MBA, confronto). Os duodécimos são a PRIMEIRA — e quando não há
    // CMD vigente a tabela nem é renderizada (entra um EstadoVazio), então 0 linhas = tela vazia.
    rota: "/planejamento/cmd-mba",
    sondas: [
      { rotulo: "duodécimos (1ª tabela)", tipo: "primeiraTabelaLinhas", alvo: "table:first tbody tr", minimo: 1 },
      { rotulo: "link de PDF", tipo: "seletor", alvo: 'a[href^="/planejamento/cmd-mba/pdf"]', minimo: 1 },
    ],
  },
  {
    rota: "/despesa/empenhos",
    sondas: [
      { rotulo: "linhas de empenho", tipo: "seletor", alvo: "table tbody tr", minimo: 1 },
      // Um link por linha ("Emitir NE") — é o clique do passo da Nota de Empenho.
      { rotulo: "link Nota de Empenho", tipo: "seletor", alvo: 'a[href*="/despesa/empenhos/ne?"]', minimo: 1 },
    ],
  },
  {
    // A fila NÃO pode estar vazia: é o passo do art. 141. Aqui a checagem é redundante com o BLOCO
    // 1 de propósito — lá se conferiu a derivação, aqui se confere que ela CHEGOU À TELA.
    rota: "/despesa/ordem-cronologica",
    sondas: [
      { rotulo: "linhas da fila", tipo: "seletor", alvo: "table tbody tr", minimo: 1 },
      { rotulo: "botão de PDF", tipo: "seletor", alvo: 'a[href^="/despesa/ordem-cronologica/pdf"]', minimo: 1 },
    ],
  },
  {
    rota: "/financeiro/extraorcamentario",
    sondas: [{ rotulo: "saldo de ISS visível", tipo: "issSaldo", alvo: "linha de ISS em Saldos por consignatário", minimo: 1 }],
  },
  {
    // ⚠️ A conciliação é o passo que MAIS depende de dado: sem extrato importado a tela cai no
    // estado vazio (honesto, mas nada a demonstrar). Sondamos a origem, a máscara e a amarração —
    // os três pontos que o roteiro manda apontar.
    rota: "/financeiro/conciliacao",
    sondas: [
      { rotulo: "origem API_BB", tipo: "texto", alvo: "API_BB", minimo: 1 },
      { rotulo: "agência mascarada", tipo: "texto", alvo: "•", minimo: 1 },
      { rotulo: "correspondências extrato × razão", tipo: "seletor", alvo: "table tbody tr", minimo: 1 },
    ],
  },
  {
    rota: "/patrimonio/bens",
    sondas: [
      { rotulo: "linhas de bens", tipo: "seletor", alvo: "table tbody tr", minimo: 1 },
      { rotulo: "botão de PDF", tipo: "seletor", alvo: 'a[href^="/patrimonio/bens/pdf"]', minimo: 1 },
    ],
  },
  {
    rota: "/contabilidade/plano-de-contas",
    sondas: [{ rotulo: "linhas do plano", tipo: "seletor", alvo: "table tbody tr", minimo: 1 }],
  },
  {
    // Com o recorte do roteiro. ⚠️ Data inválida NÃO dá erro nesta tela: ela cai no ano inteiro em
    // silêncio. Por isso o recorte vai literal, do jeito que será digitado na apresentação.
    rota: "/contabilidade/lancamentos?desde=2026-09-01&ate=2026-09-30",
    sondas: [{ rotulo: "linhas de lançamento", tipo: "seletor", alvo: "table tbody tr", minimo: 1 }],
  },
  {
    rota: "/relatorios/gerenciais",
    sondas: [
      { rotulo: "linhas do gerencial", tipo: "seletor", alvo: "table tbody tr", minimo: 1 },
      { rotulo: "botão de PDF", tipo: "seletor", alvo: 'a[href^="/relatorios/gerenciais/pdf"]', minimo: 1 },
      // O CSV é um <button> client-side (download por Blob), não um <a> — não há href para sondar.
      { rotulo: "botão de CSV", tipo: "texto", alvo: "Exportar CSV", minimo: 1 },
    ],
  },
  {
    rota: "/integracoes/sagres",
    sondas: [
      { rotulo: "botão baixar pacote", tipo: "seletor", alvo: 'a[href^="/integracoes/sagres/download"]', minimo: 1 },
      // A RÉGUA DE POSIÇÕES é o argumento central do passo SAGRES ("cada campo na coluna exata").
      // Ela não é um elemento: são as duas últimas linhas de cada <pre>. A linha de unidades começa
      // por "1234567890" — procurar esse literal é o teste mais direto de que ela renderizou.
      { rotulo: "régua de posições (<pre>)", tipo: "seletor", alvo: "pre", minimo: 1 },
      { rotulo: "régua — linha de unidades", tipo: "texto", alvo: "1234567890", minimo: 1 },
      // ⚠️ COMUNICAÇÃO HONESTA (DIRETIVA §7). O literal "não transmitido" NÃO existe na tela; a
      // frase oficial do banner é esta. Sondar a frase errada daria um falso vermelho eterno.
      { rotulo: "aviso de não-transmissão", tipo: "texto", alvo: "Transmissão externa não realizada.", minimo: 1 },
    ],
  },
];

async function bloco3Conteudo(page: Page): Promise<void> {
  console.log("\n═══ BLOCO 3 — CONTEÚDO E BOTÕES (o que será clicado) ═══");

  for (const tela of TELAS) {
    const nav = await visitar(page, tela.rota).catch((e: unknown) => ({
      ok: false,
      detalhe: e instanceof Error ? e.message : String(e),
    }));
    if (!nav.ok) {
      conferir(3, tela.rota, false, `não abriu (${nav.detalhe})`, `veja o BLOCO 2 — a rota ${tela.rota} não responde`);
      continue;
    }

    /**
     * ⚠️ SONDAGEM COM REPESCAGEM — e o motivo é uma armadilha real, não zelo excessivo.
     *
     * O `goto` acima espera `domcontentloaded`, mas várias telas (a de empenhos é a pior) STREAMAM
     * o corpo: o HTML inicial chega, o `<tbody>` chega depois. Sondar no primeiro instante pegava a
     * tela ANTES das linhas e acusava "0 linhas de empenho" — um **falso NÃO INICIAR** que aparecia
     * em ~1 de cada 5 execuções. Num comando cujo produto é um veredito de ir/não-ir, o falso
     * vermelho é quase tão caro quanto o falso verde: manda o apresentador caçar um problema
     * inexistente a 1h da Comissão, e — pior — ensina a desconfiar do veredito.
     *
     * A repescagem NÃO afrouxa o critério: uma tela genuinamente vazia continua reprovando, só que
     * depois de 10s de chance. O laço sai no instante em que tudo passa, então o caminho feliz não
     * fica mais lento de forma perceptível.
     */
    const faltando = (rs: readonly ResultadoSonda[]): boolean =>
      rs.some((r, i) => r.achados < tela.sondas[i]!.minimo);

    const prazo = Date.now() + 10_000;
    let resultados = (await page.evaluate(scriptDeSondagem(tela.sondas))) as ResultadoSonda[];
    while (faltando(resultados) && Date.now() < prazo) {
      await new Promise((r) => setTimeout(r, 300));
      resultados = (await page.evaluate(scriptDeSondagem(tela.sondas))) as ResultadoSonda[];
    }

    /**
     * SEGUNDA CHANCE COM RECARGA. Se a tela caiu no error boundary, insistir no `evaluate` não
     * adianta — o DOM morto não ressuscita sozinho. Uma recarga limpa recupera (o chunk é buscado
     * de novo). Recarrega-se para não reportar um problema que não é do conteúdo; mas o
     * ChunkLoadError fica REGISTRADO e reprova adiante por conta própria. Recuperar o dado e
     * esconder a causa seria o pior dos dois mundos.
     */
    if (faltando(resultados) && ((await page.evaluate(SCRIPT_TELA_QUEBRADA)) as boolean)) {
      conferir(
        3,
        `${tela.rota} · tela quebrou (client-side)`,
        false,
        'a tela caiu em "Application error: a client-side exception" — quase sempre ChunkLoadError de build velho',
        "pare o servidor e suba de novo a partir do build atual: npm run build && npx next start -p 3000"
      );
      await page.reload({ waitUntil: "domcontentloaded" });
      await new Promise((r) => setTimeout(r, 500));
      resultados = (await page.evaluate(scriptDeSondagem(tela.sondas))) as ResultadoSonda[];
    }

    for (let i = 0; i < tela.sondas.length; i += 1) {
      const s = tela.sondas[i]!;
      const r = resultados[i]!;
      const ok = r.achados >= s.minimo;
      conferir(
        3,
        `${tela.rota} · ${s.rotulo}`,
        ok,
        ok
          ? `${r.achados} encontrado(s)${r.obs !== "" ? ` — ${r.obs}` : ""}`
          : // A instrução manda dizer EXATAMENTE o que não foi encontrado: é o que permite corrigir
            // sem reabrir o script a 40 minutos da apresentação.
            `NÃO ENCONTRADO — ${s.tipo === "texto" ? `texto "${r.alvo}"` : `seletor \`${r.alvo}\``}${r.obs !== "" ? ` (${r.obs})` : ""}`,
        `abra ${BASE}${tela.rota} e confirme o elemento; se a tela está vazia, recarregue a massa (npm run seed:sagres-poc)`
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// BLOCO 4 — CONTINGÊNCIA (sistema de arquivos)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

interface ManifestoContingencia {
  readonly totalArtefatos?: number;
  readonly artefatos?: readonly { readonly caminho: string }[];
  readonly periodos?: { readonly dias?: readonly string[] };
}

/**
 * A contingência é o PLANO B: se a aplicação não subir, a pasta sozinha prova o que o sistema faz.
 * Mas um plano B DESATUALIZADO é pior que nenhum — ele dá confiança falsa. Daí a comparação de dias
 * com o BLOCO 1: se o banco ganhou um dia depois da última geração, a Comissão pode escolher
 * justamente esse dia e a contingência não o cobre.
 */
/**
 * O VEREDITO SOBRE O PRÓPRIO SERVIDOR. Fica fora dos quatro blocos porque não é sobre a massa nem
 * sobre uma tela: é sobre o PROCESSO que serve tudo. Um único ChunkLoadError já reprova — ele não
 * "acontece às vezes por acaso", ele significa que o disco e o processo discordam, e a partir daí
 * QUALQUER tela pode embranquecer sem aviso.
 */
/**
 * A PROVA DETERMINÍSTICA de que o processo e o disco são o MESMO build.
 *
 * O `next start` carrega o build em memória ao subir. Se alguém rodar `npm run build` depois, o
 * disco muda e o processo NÃO — e o processo passa a servir HTML que referencia chunks de rota que
 * já não existem. Os chunks do documento inicial costumam ter hash IDÊNTICO (os arquivos comuns não
 * mudaram), então "a página abre" e tudo parece bem: a bomba só estoura na navegação para a tela
 * cujo chunk mudou.
 *
 * ⚠️ Por que NÃO bastava escutar o ChunkLoadError: ele é PROBABILÍSTICO. Medido contra um servidor
 * comprovadamente velho, a escuta pegou o erro em 1 de 3 execuções completas (o script visita cada
 * rota uma vez; o martelo só cai se calhar de passar na rota do chunk trocado). Um veredito de
 * ir/não-ir não pode depender de sorte.
 *
 * Este teste é de UMA requisição e não erra: o `BUILD_ID` do disco tem de aparecer no HTML servido.
 * Foi validado nos dois sentidos — o servidor recém-subido contém o ID do disco; o velho, não.
 */
async function conferirBuildDoServidor(): Promise<void> {
  console.log("\n═══ SERVIDOR — coerência do build ═══");

  const caminhoId = join(".next", "BUILD_ID");
  if (!existsSync(caminhoId)) {
    conferir(
      2,
      "build presente no disco",
      false,
      ".next/BUILD_ID não existe — não há build para servir",
      "npm run build && npx next start -p 3000"
    );
    return;
  }

  const idDisco = readFileSync(caminhoId, "utf8").trim();
  let html = "";
  try {
    html = await (await fetch(`${BASE}/login`)).text();
  } catch (e) {
    conferir(2, "build do servidor legível", false, e instanceof Error ? e.message : String(e), "npm run build && npx next start -p 3000");
    return;
  }

  const coerente = html.includes(idDisco);
  conferir(
    2,
    "servidor serve o build do disco",
    coerente,
    coerente
      ? `BUILD_ID ${idDisco} — processo e disco coerentes`
      : `🛑 SERVIDOR COM BUILD VELHO: o disco está em ${idDisco}, mas o processo serve outro. ` +
        "Telas vão embranquecer (ChunkLoadError) no meio da navegação, ao vivo e sem aviso",
    "PARE o processo do servidor e suba de novo (só refazer o build NÃO basta): npm run build && npx next start -p 3000"
  );
}

/**
 * A corroboração em runtime. Redundante com a checagem do BUILD_ID quando esta funciona — e é
 * justamente por isso que fica: se uma versão futura do Next parar de embutir o ID no HTML, a
 * checagem acima vira cega e ESTA continua enxergando. Duas evidências independentes do mesmo fato.
 */
function conferirChunksObservados(): void {
  const unicos = [...new Set(errosDeChunk)];
  if (unicos.length === 0) return;
  conferir(
    2,
    "navegação sem ChunkLoadError",
    false,
    `${errosDeChunk.length} ChunkLoadError(s) observado(s) em ${unicos.length} rota(s) — confirma build incoerente`,
    "PARE o processo do servidor e suba de novo: npm run build && npx next start -p 3000"
  );
  for (const e of unicos.slice(0, 5)) console.log(`      · ${e}`);
}

function bloco4Contingencia(diasDoBanco: readonly string[]): void {
  console.log("\n═══ BLOCO 4 — CONTINGÊNCIA (pasta CONTINGENCIA/) ═══");

  const caminhoManifesto = join(RAIZ_CONTINGENCIA, "MANIFEST-CONTINGENCIA.json");
  const temPasta = existsSync(RAIZ_CONTINGENCIA);
  conferir(4, "pasta CONTINGENCIA/", temPasta, temPasta ? "existe" : "NÃO EXISTE", "npm run poc:contingencia");
  if (!temPasta) return;

  const temManifesto = existsSync(caminhoManifesto);
  conferir(
    4,
    "MANIFEST-CONTINGENCIA.json",
    temManifesto,
    temManifesto ? "existe" : "NÃO EXISTE — a pasta não tem índice nem SHA-256",
    "npm run poc:contingencia"
  );
  if (!temManifesto) return;

  let manifesto: ManifestoContingencia;
  try {
    manifesto = JSON.parse(readFileSync(caminhoManifesto, "utf8")) as ManifestoContingencia;
  } catch (e) {
    conferir(
      4,
      "manifesto legível",
      false,
      `JSON inválido: ${e instanceof Error ? e.message : String(e)}`,
      "npm run poc:contingencia"
    );
    return;
  }

  const total = manifesto.totalArtefatos ?? manifesto.artefatos?.length ?? 0;
  conferir(
    4,
    "manifesto lista > 100 artefatos",
    total > 100,
    `${total} artefato(s)`,
    "npm run poc:contingencia"
  );

  // ── A comparação que dá sentido ao bloco ──
  const diasManifesto = new Set(manifesto.periodos?.dias ?? []);
  const descobertos = diasDoBanco.filter((d) => !diasManifesto.has(d));
  conferir(
    4,
    "contingência cobre os dias do banco",
    descobertos.length === 0,
    descobertos.length === 0
      ? `${diasManifesto.size} dia(s) cobertos — em dia com o banco`
      : `CONTINGÊNCIA VELHA: o banco tem ${descobertos.length} dia(s) que a pasta não cobre (${descobertos.join(", ")})`,
    "npm run poc:contingencia",
    // Aviso, não reprovação: com a aplicação de pé a apresentação acontece pela TELA. A contingência
    // desatualizada só machuca no cenário de queda — grave, mas não é motivo para não começar.
    true
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// O VEREDITO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

function veredito(): number {
  const reprovas = achados.filter((a) => !a.ok && a.aviso !== true);
  const avisos = achados.filter((a) => !a.ok && a.aviso === true);

  console.log(`\n${"═".repeat(95)}`);
  for (const b of [1, 2, 3, 4]) {
    const doBloco = achados.filter((a) => a.bloco === b);
    if (doBloco.length === 0) continue;
    const maus = doBloco.filter((a) => !a.ok && a.aviso !== true).length;
    const nomes = ["", "MASSA", "ROTAS", "CONTEÚDO E BOTÕES", "CONTINGÊNCIA"];
    console.log(
      `BLOCO ${b} — ${(nomes[b] ?? "").padEnd(20)} ${maus === 0 ? "✅ OK" : `🛑 ${maus} falha(s)`}  (${doBloco.length - maus}/${doBloco.length})`
    );
  }
  console.log("═".repeat(95));

  if (avisos.length > 0) {
    console.log(`\n⚠️  ${avisos.length} AVISO(S) — não impedem começar, mas corrija se puder:`);
    avisos.forEach((a, i) => {
      console.log(`   ${i + 1}. ${a.rotulo} — ${a.detalhe}`);
      if (a.correcao !== undefined) console.log(`      → ${a.correcao}`);
    });
  }

  if (reprovas.length === 0) {
    console.log("\n✅ PODE COMEÇAR");
    console.log("   Massa, rotas, botões e contingência conferidos. Boa apresentação.");
    return 0;
  }

  console.log(`\n🛑 NÃO INICIAR — ${reprovas.length} problema(s) a corrigir:`);
  reprovas.forEach((a, i) => {
    console.log(`\n   ${i + 1}. [BLOCO ${a.bloco}] ${a.rotulo}`);
    console.log(`      Problema: ${a.detalhe}`);
    console.log(`      Corrija:  ${a.correcao ?? "(sem comando associado — investigue manualmente)"}`);
  });
  console.log("\n   Rode este comando de novo depois de corrigir: npm run poc:conferir");
  return 1;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * O SERVIDOR ANTES DE TUDO. Se ele não estiver de pé, um `puppeteer.goto` devolveria
 * `ERR_CONNECTION_REFUSED` no meio de um stack trace — e a 1h da apresentação ninguém quer ler
 * stack trace. Falha cedo, com a instrução literal.
 */
async function exigirServidor(): Promise<void> {
  const controle = new AbortController();
  const t = setTimeout(() => controle.abort(), 8000);
  try {
    await fetch(`${BASE}/login`, { signal: controle.signal });
  } catch {
    console.error(`\n🛑 NÃO INICIAR — o servidor não respondeu em ${BASE}`);
    console.error("\n   Suba o servidor de produção antes de conferir:");
    console.error("       npm run build && npx next start -p 3000");
    console.error("\n   Se ele já está em outra porta, aponte o script:");
    console.error("       npm run poc:conferir -- --base=http://localhost:3000");
    process.exit(1);
  } finally {
    clearTimeout(t);
  }
}

async function main(): Promise<void> {
  console.log("═".repeat(95));
  console.log("  POC — CONFERÊNCIA PRÉ-APRESENTAÇÃO  ·  \"posso começar?\"");
  console.log("═".repeat(95));
  console.log("  PRÉ-REQUISITO: servidor de produção de pé →  npm run build && npx next start -p 3000");
  console.log(`  Conferindo contra: ${BASE}   (mude com --base=URL)`);
  console.log("═".repeat(95));

  // A senha nunca é impressa — só a sua ausência.
  if (SENHA === "") {
    console.error("\n🛑 NÃO INICIAR — senha do usuário de apresentação ausente.");
    console.error(`
   Os BLOCOS 2 e 3 fazem LOGIN REAL: sem a senha não há tela para conferir.
   Defina SEED_ADMIN_SENHA em .env.local (não em .env), ou passe --senha=…
       npm run poc:conferir -- --senha=…`);
    process.exit(1);
  }

  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") {
    console.error("\n🛑 NÃO INICIAR — DATABASE_URL não configurada (.env). O BLOCO 1 lê o banco direto.");
    process.exit(1);
  }

  await exigirServidor();
  // Cedo, de propósito: um build incoerente envenena TODOS os blocos seguintes. Melhor o
  // apresentador ler isso no primeiro segundo do que depois de três minutos de conferência.
  await conferirBuildDoServidor();

  const prisma = criarPrismaClient(url);
  let browser: Browser | undefined;
  let anonimo: BrowserContext | undefined;
  try {
    const { dias } = await bloco1Massa(prisma);

    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    vigiarQuebrasDeChunk(page);

    // Contexto ANÔNIMO e separado: cookies próprios, sessão zerada. É como a rota pública será
    // exibida — e a única forma de provar que ela não depende de sessão.
    anonimo = await browser.createBrowserContext();
    const paginaAnonima = await anonimo.newPage();

    try {
      await entrar(page);
      console.log(`\n✓ login como ${USUARIO} — sessão viva`);
    } catch (e) {
      conferir(
        2,
        "login do apresentador",
        false,
        e instanceof Error ? e.message : String(e),
        "confirme a senha em .env.local (SEED_ADMIN_SENHA) e que o usuário está ativo — npm run seed:bootstrap"
      );
      // Sem sessão, BLOCOS 2 e 3 medem o /login, não o sistema. Segue para o BLOCO 4 e reprova.
      bloco4Contingencia(dias);
      process.exit(veredito());
    }

    await bloco2Rotas(page, paginaAnonima);
    await bloco3Conteudo(page);
    conferirChunksObservados();
    bloco4Contingencia(dias);
  } finally {
    await anonimo?.close();
    await browser?.close();
    await prisma.$disconnect();
  }

  process.exit(veredito());
}

await main();
