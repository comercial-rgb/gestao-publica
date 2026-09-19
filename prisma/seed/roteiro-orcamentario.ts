import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import {
  CONTA_CREDITO_DISPONIVEL,
  CONTA_CREDITO_RESERVADO,
  CONTA_DOTACAO_ADICIONAL,
  CONTA_DOTACAO_INICIAL,
} from "../../modules/m01-core-contabil/roteiros.js";

/**
 * SEED do ROTEIRO ORÇAMENTÁRIO — a tabela-parâmetro sem a qual NENHUMA FICHA NASCE.
 *
 * ═══ ⚠️ ESTE SEED FALTAVA, E A FALTA ERA INVISÍVEL ═══
 * `RoteiroOrcamentario` é fail-closed por desenho: um movimento de dotação que deveria
 * lançar no razão e não acha roteiro derruba a operação inteira. Isso está certo — foi
 * essa exigência que curou o furo em que o crédito disponível era debitado pelo empenho
 * e nunca creditado pela dotação.
 *
 * O que faltava era o outro lado: **quem semeia o roteiro em produção**. Os roteiros
 * existiam só num helper de TESTE (`test/roteiro-orcamentario.ts`), então a suíte inteira
 * passava e um banco de verdade não conseguia criar a primeira ficha. A suíte não podia
 * pegar isso: ela mesma semeava o que faltava.
 *
 * ═══ AS CONTAS VÊM DO DOMÍNIO, NÃO DAQUI ═══
 * Os códigos são importados de `modules/m01-core-contabil/roteiros.ts`. Redigitá-los
 * neste arquivo criaria a segunda verdade sobre qual conta é o crédito disponível — e a
 * primeira divergência só apareceria num balancete, meses depois.
 *
 * ⚠️ O EMPENHO NÃO ENTRA AQUI. O M05 já lança o empenho pelo roteiro que o chamador
 * passa; um roteiro paralelo o lançaria DUAS vezes.
 *
 * IDEMPOTENTE (upsert por `tipo`). Uso: npm run seed:roteiro-orc
 */

const DATABASE_URL = process.env["DATABASE_URL"];
if (DATABASE_URL === undefined) {
  throw new Error("DATABASE_URL não definida — veja .env.example.");
}

const prisma = criarPrismaClient(DATABASE_URL);

/**
 * Cada movimento de dotação é a passagem de um ESTADO a outro:
 *
 *   DOTACAO_INICIAL    D dotação inicial    / C crédito disponível
 *     "a LOA fixou X, e X está disponível para gastar"
 *   CREDITO_ADICIONAL  D dotação adicional  / C crédito disponível
 *   ANULACAO_CREDITO   D crédito disponível / C dotação adicional   (o inverso exato)
 *   RESERVA            D crédito disponível / C crédito reservado
 *   RESERVA_LIBERADA   D crédito reservado  / C crédito disponível
 */
const ROTEIROS: readonly {
  readonly tipo:
    | "DOTACAO_INICIAL"
    | "CREDITO_ADICIONAL"
    | "ANULACAO_CREDITO"
    | "RESERVA"
    | "RESERVA_LIBERADA";
  readonly debito: string;
  readonly credito: string;
}[] = [
  { tipo: "DOTACAO_INICIAL", debito: CONTA_DOTACAO_INICIAL, credito: CONTA_CREDITO_DISPONIVEL },
  { tipo: "CREDITO_ADICIONAL", debito: CONTA_DOTACAO_ADICIONAL, credito: CONTA_CREDITO_DISPONIVEL },
  { tipo: "ANULACAO_CREDITO", debito: CONTA_CREDITO_DISPONIVEL, credito: CONTA_DOTACAO_ADICIONAL },
  { tipo: "RESERVA", debito: CONTA_CREDITO_DISPONIVEL, credito: CONTA_CREDITO_RESERVADO },
  { tipo: "RESERVA_LIBERADA", debito: CONTA_CREDITO_RESERVADO, credito: CONTA_CREDITO_DISPONIVEL },
];

/**
 * ═══ ⚠️ A CONFERÊNCIA CONTINUA IGUAL; O QUE MUDOU É QUEM ELA DERRUBA (V11 V6.1) ═══
 *
 * Conta ausente ou SINTÉTICA continua REPROVANDO — a validação não foi afrouxada uma vírgula, e
 * afrouxá-la para o seed passar seria plantar no banco um roteiro que estoura no meio da primeira
 * transação de ficha. O que mudou é o ALCANCE da reprovação: ela agora derruba **aquele roteiro**,
 * não a instalação inteira.
 *
 * ⚠️ POR QUE, E ISSO FOI MEDIDO. Das quatro contas que estes cinco roteiros exigem, TRÊS são
 * sintéticas no PCASP oficial. Uma foi repontada contra a fonte (a dotação inicial); as outras
 * duas dependem de decisão que não é de digitação — `ROTEIRO-CREDITO-ADICIONAL-POR-TIPO` e
 * `ROTEIRO-RESERVA-SEM-CONTA`, ambas explicadas em `modules/m01-core-contabil/roteiros.ts`. Com o
 * tudo-ou-nada, a primeira delas matava `migrate → SQL → PCASP → roteiro → exercício → bootstrap →
 * cenário → percursos`: o procedimento documentado de instalação não terminava, e nenhum banco
 * novo nascia.
 *
 * É a mesma doutrina do gerador da MSC (M14): o arquivo SAI, e o furo aparece com nome e conta.
 * Um instalador que se recusa a existir por causa de uma classificação pendente deixa o ente sem
 * nada; um que instala e NOMEIA o que ficou de fora deixa a decisão com quem pode tomá-la.
 *
 * ⚠️ E O FAIL-CLOSED NÃO MUDOU DE LUGAR, ELE CONTINUA ONDE SEMPRE ESTEVE: no USO.
 * `RoteiroOrcamentario` é consultado a cada movimento de dotação, e movimento sem roteiro derruba
 * a operação. Um roteiro NÃO semeado é exatamente um movimento que o sistema recusa — o estado
 * correto para uma classificação contábil que ninguém decidiu.
 */
interface Recusa {
  readonly tipo: string;
  readonly codigo: string;
  readonly motivo: string;
}

async function contaAnalitica(codigo: string, tipo: string): Promise<{ readonly id: string } | Recusa> {
  const c = await prisma.contaPcasp.findUnique({
    where: { codigo },
    select: { id: true, analitica: true, nome: true },
  });
  if (c === null) {
    return { tipo, codigo, motivo: `a conta não existe no plano carregado. Rode antes: npm run seed:pcasp-oficial.` };
  }
  if (!c.analitica) {
    // As filhas analíticas, lidas do MESMO plano que está no banco — quem for decidir precisa
    // ver as candidatas, e vê-las da fonte, não de uma lista escrita aqui.
    const filhas = await prisma.contaPcasp.findMany({
      where: { codigo: { startsWith: codigo.slice(0, 9) }, analitica: true },
      orderBy: { codigo: "asc" },
      select: { codigo: true, nome: true },
    });
    const candidatas = filhas.map((f) => `${f.codigo} ${f.nome}`).join("; ");
    return {
      tipo,
      codigo,
      motivo:
        `a conta é SINTÉTICA no plano ("${c.nome}") e não recebe partida. ` +
        `Analíticas sob ela: ${candidatas === "" ? "nenhuma" : candidatas}.`,
    };
  }
  return { id: c.id };
}

const recusas: Recusa[] = [];
for (const r of ROTEIROS) {
  const debito = await contaAnalitica(r.debito, r.tipo);
  const credito = await contaAnalitica(r.credito, r.tipo);
  if ("motivo" in debito) { recusas.push(debito); continue; }
  if ("motivo" in credito) { recusas.push(credito); continue; }
  await prisma.roteiroOrcamentario.upsert({
    where: { tipo: r.tipo },
    update: { contaDebitoId: debito.id, contaCreditoId: credito.id },
    create: { tipo: r.tipo, contaDebitoId: debito.id, contaCreditoId: credito.id, criadoPor: "SEED" },
  });
}

const todos = await prisma.roteiroOrcamentario.findMany({
  orderBy: { tipo: "asc" },
  include: {
    contaDebito: { select: { codigo: true } },
    contaCredito: { select: { codigo: true } },
  },
});

console.log(`ROTEIRO ORÇAMENTÁRIO (${todos.length}):\n`);
for (const r of todos) {
  console.log(
    `  ${r.tipo.padEnd(20)} D ${r.contaDebito.codigo}  /  C ${r.contaCredito.codigo}`
  );
}
console.log(
  `\n  ⚠️ Sem estas linhas nenhuma ficha nasce: o movimento de dotação lança no razão, e o\n` +
    `     lançamento é fail-closed. O EMPENHO não entra aqui — o M05 já o lança pelo roteiro\n` +
    `     que o chamador passa.`
);

if (recusas.length > 0) {
  console.log(`\n  ⚠️ ${recusas.length} ROTEIRO(S) NÃO CONFIGURADO(S) — e o sistema RECUSA o movimento deles:\n`);
  for (const r of recusas) console.log(`     ${r.tipo.padEnd(20)} ${r.codigo}: ${r.motivo}`);
  console.log(
    `\n     Isto NÃO é um seed pela metade: é a classificação contábil que falta, nomeada. Escolher\n` +
      `     a conta aqui seria inventar norma. Ver as pendências ROTEIRO-CREDITO-ADICIONAL-POR-TIPO e\n` +
      `     ROTEIRO-RESERVA-SEM-CONTA em modules/m01-core-contabil/roteiros.ts.\n` +
      `     A instalação PROSSEGUE: o que depende destes movimentos é que fica recusado.`
  );
}

await prisma.$disconnect();
