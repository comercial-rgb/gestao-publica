import "dotenv/config";
import { pathToFileURL } from "node:url";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { criarSetor } from "../../modules/m21-protocolo/cadastros.js";
import { publicarCriterioDeRateio, apropriarCustoDaLiquidacao } from "../../modules/m12-relatorios/custos-servico.js";
import { toPercentual } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../generated/client/client.js";

/**
 * MASSA POC — O CUSTO POR CENTRO, com o número que o cenário da ordem pede.
 *
 * ⚠️ POR QUE ESTE SEED EXISTE. A tela `/contabilidade/custos` nasceu depois do conferidor
 * pré-apresentação, e num banco sem critério publicado ela abre no ESTADO VAZIO: ele diz o que
 * fazer, mas não mostra número nenhum. Uma tela de relatório vazia numa demonstração é pior que
 * ausente — ela parece quebrada. Este seed põe exatamente a história do cenário F da ordem:
 *
 *     "apropriar um custo elegível de 1.000,00 a dois centros, 600,00 e 400,00:
 *      composição deve retornar ao fato, sem nova despesa"
 *
 * ⚠️ E A APROPRIAÇÃO É PARCIAL DE PROPÓSITO. A liquidação escolhida é de 4.500,00 e só 1.000,00
 * são apropriados: sobram 3.500,00, e a tela continua oferecendo a MESMA liquidação no formulário.
 * Isso deixa a demonstração fazer ao vivo a segunda apropriação — e mostra, sem slide, que o teto é
 * o valor da despesa e não um limite por ato.
 *
 * ⚠️ DOIS SETORES NOVOS, e eles não são decoração. O banco de percursos já tem PROT, JUR e GAB (do
 * cenário do protocolo), e ratear aluguel entre "Protocolo Geral" e "Procuradoria" contaria uma
 * história que nenhum secretário reconhece. Educação e Saúde são os dois centros de custo que todo
 * município tem, e são os dois de que a Comissão vai perguntar.
 *
 * ⚠️ PELOS SERVIÇOS REAIS, nunca por INSERT: `criarSetor`, `publicarCriterioDeRateio` e
 * `apropriarCustoDaLiquidacao` são as MESMAS funções que a tela chama. A massa nasce com a
 * autorização cobrada, a soma dos percentuais conferida e o teto líquido aplicado. Um INSERT direto
 * criaria um custo que o próprio sistema recusaria.
 *
 * ⚠️ E ELE NÃO MEXE EM NENHUM DEMONSTRATIVO. A apropriação não lança no razão nem toca dotação —
 * é o ponto do desenho. Balanço, RREO e RGF saem deste seed com os mesmos números de antes dele.
 *
 * Uso:  npx tsx prisma/seed/poc-custos.ts   (depois de poc-fila e do cenário do protocolo)
 */

const ADMIN_PADRAO = "admin@cg.pb.gov.br";

const CHAVE = "Rateio do aluguel do predio central";
const ATO = "Portaria 12/2026 da Secretaria de Financas";
/** A vigência começa no primeiro dia do exercício da massa — o critério vale para o ano inteiro. */
const VIGENTE_DESDE = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
/** A competência do custo: agosto, dentro do período que a massa principal cobre. */
const COMPETENCIA = new Date(Date.UTC(2026, 7, 31, 12, 0, 0));
const VALOR_APROPRIADO = "1000.00";

const CENTROS = [
  { codigo: "SEC-EDU", nome: "Secretaria de Educacao", percentual: "60" },
  { codigo: "SEC-SAU", nome: "Secretaria de Saude", percentual: "40" },
] as const;

export async function semearCustosPoc(
  prisma: PrismaClient,
  criadoPor = ADMIN_PADRAO
): Promise<void> {
  // GUARDA: pela chave do critério. Rodar de novo é no-op — nunca publica a versão 2 por acidente.
  const ja = await prisma.criterioDeRateioDeCusto.findFirst({
    where: { chave: CHAVE },
    select: { id: true },
  });
  if (ja !== null) {
    console.log("[seed:poc-custos] critério de rateio já existe — no-op (idempotente).");
    return;
  }

  // ── OS DOIS CENTROS DE CUSTO ──
  // ⚠️ A unidade orçamentária é a que a massa já usa: o Setor pendura numa UG, e é isso que faz a
  // permissão por unidade valer para o custo como vale para a tramitação.
  const ug = await prisma.unidadeOrcamentaria.findFirst({
    orderBy: { codigo: "asc" },
    select: { id: true, codigo: true, descricao: true },
  });
  if (ug === null) {
    throw new Error(
      "Nenhuma unidade orçamentária cadastrada. O centro de custo é o SETOR, e o setor pendura " +
        "numa unidade gestora. Rode antes o seed do M02. Nada foi gravado."
    );
  }

  const idPorCodigo = new Map<string, string>();
  for (const c of CENTROS) {
    const existente = await prisma.setor.findUnique({
      where: { codigo: c.codigo },
      select: { id: true },
    });
    if (existente !== null) {
      idPorCodigo.set(c.codigo, existente.id);
      console.log(`[seed:poc-custos] setor ${c.codigo} já existe — reaproveitado.`);
      continue;
    }
    const r = await criarSetor(prisma, {
      codigo: c.codigo,
      nome: c.nome,
      unidadeOrcId: ug.id,
      criadoPor,
    });
    idPorCodigo.set(c.codigo, r.setorId);
    console.log(`[seed:poc-custos] setor ${c.codigo} (${c.nome}) criado.`);
  }

  // ── O CRITÉRIO 60/40, COM O RESÍDUO NA EDUCAÇÃO ──
  // ⚠️ O resíduo vai ao centro de MAIOR percentual, e a escolha tem motivo: numa divisão de
  // 1.000,00 em 60/40 não sobra centavo nenhum, mas no dia em que alguém apropriar 100,01 pelo
  // mesmo critério o centavo tem de ter dono declarado — e o dono natural é quem leva a maior parte.
  const educacao = idPorCodigo.get("SEC-EDU");
  const saude = idPorCodigo.get("SEC-SAU");
  if (educacao === undefined || saude === undefined) {
    throw new Error("Os dois centros de custo não foram resolvidos. Nada foi gravado.");
  }

  const criterio = await publicarCriterioDeRateio(prisma, {
    chave: CHAVE,
    atoRef: ATO,
    vigenteDesde: VIGENTE_DESDE,
    centroDoResiduoId: educacao,
    itens: [
      { centroId: educacao, percentual: toPercentual(CENTROS[0].percentual) },
      { centroId: saude, percentual: toPercentual(CENTROS[1].percentual) },
    ],
    criadoPor,
  });
  console.log(
    `[seed:poc-custos] critério "${CHAVE}" na versão ${String(criterio.versao)}, ` +
      `${String(criterio.centros)} centros (60/40).`
  );

  // ── A APROPRIAÇÃO DE 1.000,00 ──
  // ⚠️ A LIQUIDAÇÃO É ESCOLHIDA PELO MAIOR VALOR DISPONÍVEL, e não por número cravado: a massa
  // muda de lote para lote, e um id literal aqui quebraria o seed no dia em que o `poc-fila`
  // mudasse de números. Anulações ficam de fora — o serviço as recusaria, e com razão.
  const candidatas = await prisma.liquidacao.findMany({
    where: { estornoDeId: null, anulacaoParcialDeId: null },
    orderBy: { valor: "desc" },
    take: 10,
    select: {
      id: true,
      numero: true,
      valor: true,
      apropriacoesDeCusto: { select: { valor: true } },
      empenho: { select: { numero: true, credorCpfCnpj: true } },
    },
  });
  const escolhida = candidatas.find(
    (l) =>
      l.apropriacoesDeCusto.length === 0 &&
      l.valor.greaterThan(VALOR_APROPRIADO)
  );
  if (escolhida === undefined) {
    console.log(
      "[seed:poc-custos] nenhuma liquidação com mais de 1.000,00 livre de apropriação — o " +
        "critério fica publicado e a apropriação NÃO foi feita. A tela mostra o critério e diz " +
        "que não há custo apropriado no período."
    );
    return;
  }

  const r = await apropriarCustoDaLiquidacao(prisma, {
    liquidacaoId: escolhida.id,
    criterioChave: CHAVE,
    competencia: COMPETENCIA,
    valor: VALOR_APROPRIADO,
    motivo: "Apropriacao do aluguel do predio central a competencia de agosto de 2026",
    criadoPor,
  });
  const partes = r.partes.map((p) => p.valor.toFixed(2)).join(" e ");
  console.log(
    `[seed:poc-custos] ${r.valor.toFixed(2)} apropriado da liquidação ${escolhida.numero} ` +
      `(empenho ${escolhida.empenho.numero}, valor ${escolhida.valor.toFixed(2)}) em ${partes} — ` +
      `sobram ${escolhida.valor.minus(VALOR_APROPRIADO).toFixed(2)} para a demonstração ao vivo.`
  );
}

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") throw new Error("DATABASE_URL não definida (.env).");
  const prisma = criarPrismaClient(url);
  try {
    await semearCustosPoc(prisma as unknown as PrismaClient);
  } finally {
    await prisma.$disconnect();
  }
}

const ehEntrada =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (ehEntrada) {
  main().catch((e: unknown) => {
    console.error("[seed:poc-custos] FALHOU:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
